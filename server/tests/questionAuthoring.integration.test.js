import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  cleanTestRecords,
  loadTestApplication,
  runPrefix,
  username,
} from './testDatabase.js';

const password = 'Test-only password 42!';
const bearer = (token) => `Bearer ${token}`;
const typeName = (label) => `${runPrefix}_${label}`;
const createdExamIds = [];
const createdExamTypeIds = [];
const questionApiBodies = [];
const noBody = Symbol('noBody');

const multipleChoicePayload = (label = 'multiple_choice', overrides = {}) => ({
  question_type: 'multiple_choice',
  prompt: `Test-only ${label} prompt`,
  points: 5,
  options: [
    { text: `Incorrect ${label} option`, is_correct: false },
    { text: `Correct ${label} option`, is_correct: true },
  ],
  ...overrides,
});

const trueFalsePayload = (label = 'true_false', correctAnswer = true, overrides = {}) => ({
  question_type: 'true_false',
  prompt: `Test-only ${label} prompt`,
  points: 3,
  correct_answer: correctAnswer,
  ...overrides,
});

const shortAnswerPayload = (label = 'short_answer', overrides = {}) => ({
  question_type: 'short_answer',
  prompt: `Test-only ${label} prompt`,
  points: 4,
  reference_answer: `Reference answer for ${label}`,
  ...overrides,
});

let app;
let pool;
let authService;
let userRepository;
let primaryLecturer;
let secondaryLecturer;
let primaryAuthorization;
let secondaryAuthorization;
let studentAuthorization;
let sharedExamType;

const record = (response) => {
  if (response.body !== undefined && response.body !== null) {
    questionApiBodies.push(response.body);
  }
  return response;
};

const apiRequest = async ({
  method,
  path,
  authorization = primaryAuthorization,
  body = noBody,
}) => {
  let pending = request(app)[method](path);

  if (authorization) {
    pending = pending.set('Authorization', authorization);
  }

  if (body !== noBody) {
    pending = pending.send(body);
  }

  return record(await pending);
};

const seedLecturer = async (label) => {
  const normalizedUsername = authService.normalizeAndValidateUsername(username(label));
  const validatedPassword = authService.validatePassword(password);
  const passwordHash = await authService.hashPassword(validatedPassword);
  return userRepository.upsertLecturer({ username: normalizedUsername, passwordHash });
};

const login = async (loginUsername) => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username: loginUsername, password });

  expect(response.status).toBe(200);
  return bearer(response.body.token);
};

const createExamType = async (authorization, label) => {
  const response = await request(app)
    .post('/api/exam-types')
    .set('Authorization', authorization)
    .send({
      name: typeName(label),
      description: `Test-only ${label} type.`,
    });

  expect(response.status).toBe(201);
  createdExamTypeIds.push(response.body.id);
  return response.body;
};

const createExam = async (label, {
  authorization = primaryAuthorization,
  examTypeId = sharedExamType.id,
} = {}) => {
  const response = await request(app)
    .post('/api/exams')
    .set('Authorization', authorization)
    .send({
      exam_type_id: examTypeId,
      title: `Test-only ${label} exam`,
      description: `Created for ${label}.`,
    });

  expect(response.status).toBe(201);
  createdExamIds.push(response.body.id);
  return response.body;
};

const createQuestion = async (examId, payload, {
  authorization = primaryAuthorization,
  expectedStatus = 201,
} = {}) => {
  const response = await apiRequest({
    method: 'post',
    path: `/api/exams/${examId}/questions`,
    authorization,
    body: payload,
  });

  expect(response.status).toBe(expectedStatus);
  return response.body;
};

const listQuestions = async (examId, authorization = primaryAuthorization) => {
  const response = await apiRequest({
    method: 'get',
    path: `/api/exams/${examId}/questions`,
    authorization,
  });

  expect(response.status).toBe(200);
  return response.body;
};

const expectQuestionResponseShape = (question, expected) => {
  expect(question).toMatchObject(expected);
  expect(Number.isSafeInteger(question.id)).toBe(true);
  expect(Number.isSafeInteger(question.exam_id)).toBe(true);
  expect(Number.isSafeInteger(question.position)).toBe(true);
  expect(typeof question.created_at).toBe('string');
  expect(typeof question.updated_at).toBe('string');
  expect(question).not.toHaveProperty('type');
  expect(question).not.toHaveProperty('text');
};

const publishExam = async (examId) => {
  const result = await pool.query(
    `UPDATE exams
     SET status = 'published', published_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING status`,
    [examId],
  );
  expect(result.rows[0].status).toBe('published');
};

const expectErrorResponses = (responses, status) => {
  for (const response of responses) {
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: expect.any(String) });
  }
};

const verifyRunRecordsRemoved = async () => {
  const usernamePrefix = `${runPrefix}_`;
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::INTEGER
        FROM users
        WHERE LEFT(username, LENGTH($3)) = $3) AS users,
       (SELECT COUNT(*)::INTEGER
        FROM exams
        WHERE id = ANY($1::int[])) AS exams,
       (SELECT COUNT(*)::INTEGER
        FROM exam_types
        WHERE id = ANY($2::int[])) AS exam_types,
       (SELECT COUNT(*)::INTEGER
        FROM questions
        WHERE exam_id = ANY($1::int[])) AS questions,
       (SELECT COUNT(*)::INTEGER
        FROM question_options qo
        JOIN questions q ON q.id = qo.question_id
        WHERE q.exam_id = ANY($1::int[])) AS question_options`,
    [createdExamIds, createdExamTypeIds, usernamePrefix],
  );

  expect(result.rows[0]).toEqual({
    users: 0,
    exams: 0,
    exam_types: 0,
    questions: 0,
    question_options: 0,
  });
};

beforeAll(async () => {
  ({ app, pool } = await loadTestApplication());
  [authService, userRepository] = await Promise.all([
    import('../services/authService.js'),
    import('../repositories/userRepository.js'),
  ]);

  [primaryLecturer, secondaryLecturer] = await Promise.all([
    seedLecturer('questions_primary'),
    seedLecturer('questions_secondary'),
  ]);
  [primaryAuthorization, secondaryAuthorization] = await Promise.all([
    login(primaryLecturer.username),
    login(secondaryLecturer.username),
  ]);

  const student = await request(app)
    .post('/api/auth/register')
    .send({ username: username('questions_student'), password });
  expect(student.status).toBe(201);
  studentAuthorization = bearer(student.body.token);
  sharedExamType = await createExamType(primaryAuthorization, 'question_authoring');
});

afterAll(async () => {
  if (pool) {
    try {
      await cleanTestRecords(pool, createdExamIds, createdExamTypeIds);
      await verifyRunRecordsRemoved();
    } finally {
      await pool.end();
    }
  }
});

describe('question authorization and ownership', () => {
  test('requires authentication for every question operation', async () => {
    const paths = [
      { method: 'get', path: '/api/exams/1/questions' },
      { method: 'post', path: '/api/exams/1/questions', body: multipleChoicePayload('unauth') },
      { method: 'patch', path: '/api/exams/1/questions/1', body: { prompt: 'Denied' } },
      { method: 'delete', path: '/api/exams/1/questions/1' },
      { method: 'put', path: '/api/exams/1/questions/reorder', body: { question_ids: [] } },
    ];

    const responses = [];
    for (const operation of paths) {
      responses.push(await apiRequest({ ...operation, authorization: null }));
    }

    expectErrorResponses(responses, 401);
    for (const response of responses) {
      expect(response.body).toEqual({ error: 'Authentication required.' });
    }
  });

  test('rejects students from every question operation', async () => {
    const exam = await createExam('student_question_boundary');
    const question = await createQuestion(exam.id, trueFalsePayload('student_boundary'));
    const operations = [
      { method: 'get', path: `/api/exams/${exam.id}/questions` },
      {
        method: 'post',
        path: `/api/exams/${exam.id}/questions`,
        body: shortAnswerPayload('student_forbidden_create'),
      },
      {
        method: 'patch',
        path: `/api/exams/${exam.id}/questions/${question.id}`,
        body: { prompt: 'Denied student update' },
      },
      { method: 'delete', path: `/api/exams/${exam.id}/questions/${question.id}` },
      {
        method: 'put',
        path: `/api/exams/${exam.id}/questions/reorder`,
        body: { question_ids: [question.id] },
      },
    ];

    const responses = [];
    for (const operation of operations) {
      responses.push(await apiRequest({
        ...operation,
        authorization: studentAuthorization,
      }));
    }

    expectErrorResponses(responses, 403);
    for (const response of responses) {
      expect(response.body).toEqual({ error: 'Access forbidden.' });
    }
  });

  test('hides a lecturer exam from another lecturer for every operation', async () => {
    const exam = await createExam('foreign_lecturer_boundary');
    const question = await createQuestion(exam.id, multipleChoicePayload('foreign_boundary'));
    const unknownExamId = 2147483647;
    const operations = [
      { method: 'get', suffix: '', body: noBody },
      { method: 'post', suffix: '', body: trueFalsePayload('foreign_create') },
      { method: 'patch', suffix: `/${question.id}`, body: { prompt: 'Foreign edit' } },
      { method: 'delete', suffix: `/${question.id}`, body: noBody },
      { method: 'put', suffix: '/reorder', body: { question_ids: [question.id] } },
    ];

    for (const operation of operations) {
      const foreign = await apiRequest({
        method: operation.method,
        path: `/api/exams/${exam.id}/questions${operation.suffix}`,
        authorization: secondaryAuthorization,
        body: operation.body,
      });
      const nonexistent = await apiRequest({
        method: operation.method,
        path: `/api/exams/${unknownExamId}/questions${operation.suffix}`,
        authorization: secondaryAuthorization,
        body: operation.body,
      });

      expect(foreign.status).toBe(404);
      expect(nonexistent.status).toBe(404);
      expect(foreign.body).toEqual(nonexistent.body);
    }
  });

  test('does not allow a question ID to cross its exam boundary', async () => {
    const firstExam = await createExam('cross_exam_first');
    const secondExam = await createExam('cross_exam_second');
    const question = await createQuestion(firstExam.id, shortAnswerPayload('cross_exam'));

    const patchResponse = await apiRequest({
      method: 'patch',
      path: `/api/exams/${secondExam.id}/questions/${question.id}`,
      body: { prompt: 'Must not move between exams' },
    });
    const deleteResponse = await apiRequest({
      method: 'delete',
      path: `/api/exams/${secondExam.id}/questions/${question.id}`,
    });

    expectErrorResponses([patchResponse, deleteResponse], 404);
    const persisted = await listQuestions(firstExam.id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].prompt).toBe(question.prompt);
  });
});

describe('question creation and public response mapping', () => {
  test('creates and maps a multiple-choice question with ordered options', async () => {
    const exam = await createExam('create_multiple_choice');
    const payload = multipleChoicePayload('create_mapping', {
      prompt: '  Which answer is correct?  ',
      options: [
        { text: '  First answer  ', is_correct: false },
        { text: '  Second answer  ', is_correct: true },
        { text: '  Third answer  ', is_correct: false },
      ],
    });
    const created = await createQuestion(exam.id, payload);

    expectQuestionResponseShape(created, {
      exam_id: exam.id,
      question_type: 'multiple_choice',
      prompt: 'Which answer is correct?',
      points: 5,
      position: 1,
    });
    expect(created.options.map(({ text, is_correct: isCorrect }) => ({
      text,
      is_correct: isCorrect,
    }))).toEqual([
      { text: 'First answer', is_correct: false },
      { text: 'Second answer', is_correct: true },
      { text: 'Third answer', is_correct: false },
    ]);
    expect(created).not.toHaveProperty('correct_answer');
    expect(created).not.toHaveProperty('reference_answer');

    const stored = await pool.query(
      `SELECT q.type, q.text, q.correct_answer,
              ARRAY_AGG(qo.text ORDER BY qo.position, qo.id) AS option_texts,
              ARRAY_AGG(qo.is_correct ORDER BY qo.position, qo.id) AS correctness
       FROM questions q
       JOIN question_options qo ON qo.question_id = q.id
       WHERE q.id = $1
       GROUP BY q.id`,
      [created.id],
    );
    expect(stored.rows[0]).toEqual({
      type: 'multiple_choice',
      text: 'Which answer is correct?',
      correct_answer: null,
      option_texts: ['First answer', 'Second answer', 'Third answer'],
      correctness: [false, true, false],
    });
  });

  test('creates true and false questions and maps stored text to JSON booleans', async () => {
    const exam = await createExam('create_true_false');
    const trueQuestion = await createQuestion(
      exam.id,
      trueFalsePayload('boolean_true', true),
    );
    const falseQuestion = await createQuestion(
      exam.id,
      trueFalsePayload('boolean_false', false),
    );

    expectQuestionResponseShape(trueQuestion, {
      exam_id: exam.id,
      question_type: 'true_false',
      correct_answer: true,
      position: 1,
    });
    expectQuestionResponseShape(falseQuestion, {
      exam_id: exam.id,
      question_type: 'true_false',
      correct_answer: false,
      position: 2,
    });
    for (const question of [trueQuestion, falseQuestion]) {
      expect(question).not.toHaveProperty('options');
      expect(question).not.toHaveProperty('reference_answer');
    }

    const stored = await pool.query(
      `SELECT correct_answer
       FROM questions
       WHERE id = ANY($1::int[])
       ORDER BY position, id`,
      [[trueQuestion.id, falseQuestion.id]],
    );
    expect(stored.rows.map((row) => row.correct_answer)).toEqual(['true', 'false']);
  });

  test('creates a short-answer question with a trimmed public reference answer', async () => {
    const exam = await createExam('create_short_answer');
    const created = await createQuestion(exam.id, shortAnswerPayload('short_mapping', {
      reference_answer: '  Expected reference text  ',
    }));

    expectQuestionResponseShape(created, {
      exam_id: exam.id,
      question_type: 'short_answer',
      reference_answer: 'Expected reference text',
      position: 1,
    });
    expect(created).not.toHaveProperty('options');
    expect(created).not.toHaveProperty('correct_answer');

    const stored = await pool.query(
      'SELECT type, correct_answer FROM questions WHERE id = $1',
      [created.id],
    );
    expect(stored.rows[0]).toEqual({
      type: 'short_answer',
      correct_answer: 'Expected reference text',
    });
  });

  test('appends concurrent creations at unique contiguous positions and updates question_count', async () => {
    const exam = await createExam('concurrent_creation');
    const payloads = [
      multipleChoicePayload('concurrent_mc'),
      trueFalsePayload('concurrent_true', true),
      shortAnswerPayload('concurrent_short'),
      trueFalsePayload('concurrent_false', false),
      multipleChoicePayload('concurrent_second_mc'),
    ];

    const responses = await Promise.all(payloads.map((body) => apiRequest({
      method: 'post',
      path: `/api/exams/${exam.id}/questions`,
      body,
    })));
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201, 201]);

    const listed = await listQuestions(exam.id);
    expect(listed).toHaveLength(5);
    expect(listed.map((question) => question.position)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(listed.map((question) => question.id)).size).toBe(5);

    const examResponse = await request(app)
      .get(`/api/exams/${exam.id}`)
      .set('Authorization', primaryAuthorization);
    expect(examResponse.status).toBe(200);
    expect(examResponse.body.question_count).toBe(5);
  });

  test('allows owner reads but rejects creation after an exam is published', async () => {
    const exam = await createExam('published_create');
    const existing = await createQuestion(exam.id, trueFalsePayload('published_existing'));
    await publishExam(exam.id);

    const listed = await listQuestions(exam.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(existing.id);

    const response = await apiRequest({
      method: 'post',
      path: `/api/exams/${exam.id}/questions`,
      body: shortAnswerPayload('published_create_rejected'),
    });
    expect(response.status).toBe(409);
    expect(await listQuestions(exam.id)).toHaveLength(1);
  });
});

describe('question creation validation', () => {
  test('rejects non-object bodies, missing common fields, unsupported types, and managed fields', async () => {
    const exam = await createExam('common_creation_validation');
    const invalidBodies = [
      null,
      [],
      {},
      { prompt: 'Missing type and points' },
      { question_type: 'true_false', points: 1, correct_answer: true },
      { question_type: 'true_false', prompt: 'Missing points', correct_answer: true },
      trueFalsePayload('unsupported_type', true, { question_type: 'open_text' }),
      trueFalsePayload('uppercase_type', true, { question_type: 'TRUE_FALSE' }),
      trueFalsePayload('spaced_type', true, { question_type: ' true_false ' }),
      { ...trueFalsePayload('unknown_field'), future_field: true },
      { ...trueFalsePayload('managed_id'), id: 9 },
      { ...trueFalsePayload('managed_exam'), exam_id: exam.id },
      { ...trueFalsePayload('managed_position'), position: 1 },
      { ...trueFalsePayload('managed_created'), created_at: new Date().toISOString() },
      { ...trueFalsePayload('managed_updated'), updated_at: new Date().toISOString() },
    ];

    const responses = [];
    for (const body of invalidBodies) {
      responses.push(await apiRequest({
        method: 'post',
        path: `/api/exams/${exam.id}/questions`,
        body,
      }));
    }

    expectErrorResponses(responses, 400);
    expect(await listQuestions(exam.id)).toEqual([]);
  });

  test('rejects invalid prompts and points without leaking database errors', async () => {
    const exam = await createExam('prompt_points_validation');
    const invalidBodies = [
      trueFalsePayload('null_prompt', true, { prompt: null }),
      trueFalsePayload('array_prompt', true, { prompt: [] }),
      trueFalsePayload('blank_prompt', true, { prompt: '   ' }),
      trueFalsePayload('zero_points', true, { points: 0 }),
      trueFalsePayload('negative_points', true, { points: -1 }),
      trueFalsePayload('decimal_points', true, { points: 1.5 }),
      trueFalsePayload('string_points', true, { points: '5' }),
      trueFalsePayload('null_points', true, { points: null }),
      trueFalsePayload('array_points', true, { points: [5] }),
      trueFalsePayload('boolean_points', true, { points: true }),
      trueFalsePayload('integer_overflow', true, { points: 2147483648 }),
      trueFalsePayload('unsafe_points', true, { points: Number.MAX_SAFE_INTEGER + 1 }),
    ];

    const responses = [];
    for (const body of invalidBodies) {
      responses.push(await apiRequest({
        method: 'post',
        path: `/api/exams/${exam.id}/questions`,
        body,
      }));
    }

    expectErrorResponses(responses, 400);
    expect(await listQuestions(exam.id)).toEqual([]);
  });

  test('rejects malformed multiple-choice options and duplicate normalized text', async () => {
    const exam = await createExam('multiple_choice_validation');
    const invalidOptions = [
      null,
      {},
      [],
      [{ text: 'Only option', is_correct: true }],
      [null, { text: 'Valid', is_correct: true }],
      [['Not an object'], { text: 'Valid', is_correct: true }],
      ['Not an object', { text: 'Valid', is_correct: true }],
      [{ is_correct: false }, { text: 'Valid', is_correct: true }],
      [{ text: 'Missing boolean' }, { text: 'Valid', is_correct: true }],
      [{ text: 'Wrong boolean', is_correct: 0 }, { text: 'Valid', is_correct: true }],
      [{ text: '   ', is_correct: false }, { text: 'Valid', is_correct: true }],
      [{ text: 42, is_correct: false }, { text: 'Valid', is_correct: true }],
      [
        { text: 'First', is_correct: false, id: 10 },
        { text: 'Second', is_correct: true },
      ],
      [
        { text: 'First', is_correct: false, position: 1 },
        { text: 'Second', is_correct: true },
      ],
      [
        { text: 'First', is_correct: false, future_field: true },
        { text: 'Second', is_correct: true },
      ],
      [
        { text: ' Same answer ', is_correct: false },
        { text: 'same ANSWER', is_correct: true },
      ],
      [
        { text: 'First', is_correct: false },
        { text: 'Second', is_correct: false },
      ],
      [
        { text: 'First', is_correct: true },
        { text: 'Second', is_correct: true },
      ],
    ];

    const responses = [];
    for (const [index, options] of invalidOptions.entries()) {
      responses.push(await apiRequest({
        method: 'post',
        path: `/api/exams/${exam.id}/questions`,
        body: multipleChoicePayload(`invalid_options_${index}`, { options }),
      }));
    }

    expectErrorResponses(responses, 400);
    expect(await listQuestions(exam.id)).toEqual([]);
  });

  test('requires exact type-specific fields and rejects mixed payloads', async () => {
    const exam = await createExam('type_specific_validation');
    const invalidBodies = [
      multipleChoicePayload('mc_correct_answer', { correct_answer: true }),
      multipleChoicePayload('mc_reference_answer', { reference_answer: 'Wrong field' }),
      { ...multipleChoicePayload('mc_missing_options'), options: undefined },
      trueFalsePayload('tf_options', true, {
        options: [
          { text: 'False', is_correct: false },
          { text: 'True', is_correct: true },
        ],
      }),
      trueFalsePayload('tf_reference', true, { reference_answer: 'Wrong field' }),
      trueFalsePayload('tf_string_boolean', true, { correct_answer: 'true' }),
      trueFalsePayload('tf_null_boolean', true, { correct_answer: null }),
      { ...trueFalsePayload('tf_missing_boolean'), correct_answer: undefined },
      shortAnswerPayload('sa_options', {
        options: [
          { text: 'First', is_correct: false },
          { text: 'Second', is_correct: true },
        ],
      }),
      shortAnswerPayload('sa_correct', { correct_answer: false }),
      shortAnswerPayload('sa_blank', { reference_answer: '   ' }),
      shortAnswerPayload('sa_non_string', { reference_answer: 42 }),
      { ...shortAnswerPayload('sa_missing'), reference_answer: undefined },
    ];

    const responses = [];
    for (const body of invalidBodies) {
      const serializedBody = JSON.parse(JSON.stringify(body));
      responses.push(await apiRequest({
        method: 'post',
        path: `/api/exams/${exam.id}/questions`,
        body: serializedBody,
      }));
    }

    expectErrorResponses(responses, 400);
    expect(await listQuestions(exam.id)).toEqual([]);
  });

  test('rejects malformed and out-of-range exam and question route IDs safely', async () => {
    const exam = await createExam('route_id_validation');
    const question = await createQuestion(exam.id, trueFalsePayload('route_id'));
    const invalidIds = ['0', '-1', 'not-an-id', '1.5', '2147483648', '9007199254740992'];
    const responses = [];

    for (const invalidId of invalidIds) {
      responses.push(await apiRequest({
        method: 'get',
        path: `/api/exams/${invalidId}/questions`,
      }));
      responses.push(await apiRequest({
        method: 'patch',
        path: `/api/exams/${exam.id}/questions/${invalidId}`,
        body: { prompt: 'Invalid route must not update' },
      }));
      responses.push(await apiRequest({
        method: 'delete',
        path: `/api/exams/${exam.id}/questions/${invalidId}`,
      }));
    }

    expectErrorResponses(responses, 400);
    expect((await listQuestions(exam.id))[0].prompt).toBe(question.prompt);
  });
});

describe('question updates and type transitions', () => {
  test('updates prompt and points while preserving omitted multiple-choice options', async () => {
    const exam = await createExam('update_common_fields');
    const created = await createQuestion(exam.id, multipleChoicePayload('preserve_options'));
    const beforeOptions = created.options.map((option) => ({
      text: option.text,
      is_correct: option.is_correct,
    }));

    const response = await apiRequest({
      method: 'patch',
      path: `/api/exams/${exam.id}/questions/${created.id}`,
      body: {
        prompt: '  Updated common prompt  ',
        points: 11,
      },
    });

    expect(response.status).toBe(200);
    expectQuestionResponseShape(response.body, {
      id: created.id,
      prompt: 'Updated common prompt',
      points: 11,
      question_type: 'multiple_choice',
    });
    expect(response.body.options.map((option) => ({
      text: option.text,
      is_correct: option.is_correct,
    }))).toEqual(beforeOptions);
  });

  test('replaces a complete multiple-choice option set transactionally', async () => {
    const exam = await createExam('replace_options');
    const created = await createQuestion(exam.id, multipleChoicePayload('old_options'));
    const oldOptionIds = created.options
      .map((option) => option.id)
      .filter((id) => Number.isSafeInteger(id));
    const replacement = [
      { text: 'Replacement first', is_correct: true },
      { text: 'Replacement second', is_correct: false },
      { text: 'Replacement third', is_correct: false },
    ];

    const response = await apiRequest({
      method: 'patch',
      path: `/api/exams/${exam.id}/questions/${created.id}`,
      body: { options: replacement },
    });
    expect(response.status).toBe(200);
    expect(response.body.options.map((option) => ({
      text: option.text,
      is_correct: option.is_correct,
    }))).toEqual(replacement);

    if (oldOptionIds.length > 0) {
      const oldRows = await pool.query(
        'SELECT COUNT(*)::INTEGER AS count FROM question_options WHERE id = ANY($1::int[])',
        [oldOptionIds],
      );
      expect(oldRows.rows[0].count).toBe(0);
    }
  });

  test('updates true/false false values and short-answer reference text without truthiness bugs', async () => {
    const exam = await createExam('same_type_updates');
    const trueFalse = await createQuestion(exam.id, trueFalsePayload('same_type_tf', true));
    const shortAnswer = await createQuestion(exam.id, shortAnswerPayload('same_type_sa'));

    const falseUpdate = await apiRequest({
      method: 'patch',
      path: `/api/exams/${exam.id}/questions/${trueFalse.id}`,
      body: { correct_answer: false },
    });
    const referenceUpdate = await apiRequest({
      method: 'patch',
      path: `/api/exams/${exam.id}/questions/${shortAnswer.id}`,
      body: { reference_answer: '  New expected answer  ' },
    });

    expect(falseUpdate.status).toBe(200);
    expect(falseUpdate.body.correct_answer).toBe(false);
    expect(referenceUpdate.status).toBe(200);
    expect(referenceUpdate.body.reference_answer).toBe('New expected answer');
  });

  test.each([
    {
      name: 'multiple-choice to true/false',
      source: multipleChoicePayload('transition_mc_tf'),
      patch: { question_type: 'true_false', correct_answer: false },
      targetType: 'true_false',
      targetField: ['correct_answer', false],
      storedAnswer: 'false',
      optionCount: 0,
    },
    {
      name: 'multiple-choice to short answer',
      source: multipleChoicePayload('transition_mc_sa'),
      patch: { question_type: 'short_answer', reference_answer: 'New short answer' },
      targetType: 'short_answer',
      targetField: ['reference_answer', 'New short answer'],
      storedAnswer: 'New short answer',
      optionCount: 0,
    },
    {
      name: 'true/false to multiple-choice',
      source: trueFalsePayload('transition_tf_mc', true),
      patch: {
        question_type: 'multiple_choice',
        options: [
          { text: 'New incorrect', is_correct: false },
          { text: 'New correct', is_correct: true },
        ],
      },
      targetType: 'multiple_choice',
      targetField: null,
      storedAnswer: null,
      optionCount: 2,
    },
    {
      name: 'true/false to short answer',
      source: trueFalsePayload('transition_tf_sa', true),
      patch: { question_type: 'short_answer', reference_answer: 'Transition reference' },
      targetType: 'short_answer',
      targetField: ['reference_answer', 'Transition reference'],
      storedAnswer: 'Transition reference',
      optionCount: 0,
    },
    {
      name: 'short answer to multiple-choice',
      source: shortAnswerPayload('transition_sa_mc'),
      patch: {
        question_type: 'multiple_choice',
        options: [
          { text: 'Transition correct', is_correct: true },
          { text: 'Transition incorrect', is_correct: false },
        ],
      },
      targetType: 'multiple_choice',
      targetField: null,
      storedAnswer: null,
      optionCount: 2,
    },
    {
      name: 'short answer to true/false',
      source: shortAnswerPayload('transition_sa_tf'),
      patch: { question_type: 'true_false', correct_answer: true },
      targetType: 'true_false',
      targetField: ['correct_answer', true],
      storedAnswer: 'true',
      optionCount: 0,
    },
  ])('supports $name and removes stale storage', async ({
    name,
    source,
    patch,
    targetType,
    targetField,
    storedAnswer,
    optionCount,
  }) => {
    const exam = await createExam(`type_transition_${name.replaceAll(/[^a-z]+/g, '_')}`);
    const created = await createQuestion(exam.id, source);
    const response = await apiRequest({
      method: 'patch',
      path: `/api/exams/${exam.id}/questions/${created.id}`,
      body: patch,
    });

    expect(response.status).toBe(200);
    expect(response.body.question_type).toBe(targetType);
    if (targetField) {
      expect(response.body[targetField[0]]).toBe(targetField[1]);
    }
    if (targetType === 'multiple_choice') {
      expect(response.body).not.toHaveProperty('correct_answer');
      expect(response.body).not.toHaveProperty('reference_answer');
      expect(response.body.options).toHaveLength(2);
    } else {
      expect(response.body).not.toHaveProperty('options');
    }

    const stored = await pool.query(
      `SELECT q.type, q.correct_answer,
              (SELECT COUNT(*)::INTEGER
               FROM question_options qo
               WHERE qo.question_id = q.id) AS option_count
       FROM questions q
       WHERE q.id = $1`,
      [created.id],
    );
    expect(stored.rows[0]).toEqual({
      type: targetType,
      correct_answer: storedAnswer,
      option_count: optionCount,
    });
  });

  test('rejects empty patches, managed position, and incompatible final fields', async () => {
    const exam = await createExam('patch_validation');
    const question = await createQuestion(exam.id, multipleChoicePayload('patch_validation'));
    const invalidPatches = [
      {},
      { position: 2 },
      { id: question.id },
      { exam_id: exam.id },
      { created_at: new Date().toISOString() },
      { future_field: true },
      { question_type: 'true_false' },
      { question_type: 'short_answer' },
      { correct_answer: true },
      { reference_answer: 'Wrong for multiple choice' },
      { options: [{ text: 'Only one', is_correct: true }] },
    ];

    const responses = [];
    for (const body of invalidPatches) {
      responses.push(await apiRequest({
        method: 'patch',
        path: `/api/exams/${exam.id}/questions/${question.id}`,
        body,
      }));
    }

    expectErrorResponses(responses, 400);
    const persisted = await listQuestions(exam.id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      id: question.id,
      question_type: 'multiple_choice',
      prompt: question.prompt,
      points: question.points,
    });
  });

  test('rolls back a failed option replacement without changing the question or options', async () => {
    const exam = await createExam('patch_rollback');
    const question = await createQuestion(exam.id, multipleChoicePayload('patch_rollback'));
    const before = await listQuestions(exam.id);

    const response = await apiRequest({
      method: 'patch',
      path: `/api/exams/${exam.id}/questions/${question.id}`,
      body: {
        prompt: 'This must roll back',
        options: [
          { text: 'Duplicate', is_correct: false },
          { text: ' duplicate ', is_correct: true },
        ],
      },
    });

    expect(response.status).toBe(400);
    expect(await listQuestions(exam.id)).toEqual(before);
  });

  test('rejects updates to published exams and preserves the question', async () => {
    const exam = await createExam('published_update');
    const question = await createQuestion(exam.id, shortAnswerPayload('published_update'));
    await publishExam(exam.id);

    const response = await apiRequest({
      method: 'patch',
      path: `/api/exams/${exam.id}/questions/${question.id}`,
      body: { prompt: 'Published update must fail' },
    });
    expect(response.status).toBe(409);

    const stored = await pool.query('SELECT text FROM questions WHERE id = $1', [question.id]);
    expect(stored.rows[0].text).toBe(question.prompt);
  });
});

describe('question deletion', () => {
  test('deletes options by cascade, compacts positions, and decrements question_count', async () => {
    const exam = await createExam('delete_compaction');
    const first = await createQuestion(exam.id, trueFalsePayload('delete_first'));
    const middle = await createQuestion(exam.id, multipleChoicePayload('delete_middle'));
    const last = await createQuestion(exam.id, shortAnswerPayload('delete_last'));
    const optionsBefore = await pool.query(
      'SELECT COUNT(*)::INTEGER AS count FROM question_options WHERE question_id = $1',
      [middle.id],
    );
    expect(optionsBefore.rows[0].count).toBe(2);

    const response = await apiRequest({
      method: 'delete',
      path: `/api/exams/${exam.id}/questions/${middle.id}`,
    });
    expect(response.status).toBe(204);

    const listed = await listQuestions(exam.id);
    expect(listed.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: first.id, position: 1 },
      { id: last.id, position: 2 },
    ]);
    const optionsAfter = await pool.query(
      'SELECT COUNT(*)::INTEGER AS count FROM question_options WHERE question_id = $1',
      [middle.id],
    );
    expect(optionsAfter.rows[0].count).toBe(0);

    const examResponse = await request(app)
      .get(`/api/exams/${exam.id}`)
      .set('Authorization', primaryAuthorization);
    expect(examResponse.status).toBe(200);
    expect(examResponse.body.question_count).toBe(2);
  });

  test('rejects deletion from a published exam without cascading anything', async () => {
    const exam = await createExam('published_delete');
    const question = await createQuestion(exam.id, multipleChoicePayload('published_delete'));
    await publishExam(exam.id);

    const response = await apiRequest({
      method: 'delete',
      path: `/api/exams/${exam.id}/questions/${question.id}`,
    });
    expect(response.status).toBe(409);

    const stored = await pool.query(
      `SELECT q.id,
              (SELECT COUNT(*)::INTEGER FROM question_options WHERE question_id = q.id)
                AS option_count
       FROM questions q
       WHERE q.id = $1`,
      [question.id],
    );
    expect(stored.rows[0]).toEqual({ id: question.id, option_count: 2 });
  });
});

describe('question reordering', () => {
  test('atomically applies a complete order without temporary unique-position conflicts', async () => {
    const exam = await createExam('valid_reorder');
    const first = await createQuestion(exam.id, trueFalsePayload('reorder_first'));
    const second = await createQuestion(exam.id, shortAnswerPayload('reorder_second'));
    const third = await createQuestion(exam.id, multipleChoicePayload('reorder_third'));
    const desired = [third.id, first.id, second.id];

    const response = await apiRequest({
      method: 'put',
      path: `/api/exams/${exam.id}/questions/reorder`,
      body: { question_ids: desired },
    });
    expect(response.status).toBe(200);

    const listed = await listQuestions(exam.id);
    expect(listed.map((question) => question.id)).toEqual(desired);
    expect(listed.map((question) => question.position)).toEqual([1, 2, 3]);
  });

  test('rejects malformed bodies, duplicate IDs, and invalid ID values without changing order', async () => {
    const exam = await createExam('reorder_validation');
    const first = await createQuestion(exam.id, trueFalsePayload('validation_first'));
    const second = await createQuestion(exam.id, shortAnswerPayload('validation_second'));
    const originalOrder = [first.id, second.id];
    const invalidBodies = [
      null,
      [],
      {},
      { question_ids: originalOrder, future_field: true },
      { question_ids: null },
      { question_ids: {} },
      { question_ids: first.id },
      { question_ids: [first.id, first.id] },
      { question_ids: [first.id, 0] },
      { question_ids: [first.id, -1] },
      { question_ids: [first.id, 1.5] },
      { question_ids: [first.id, `${second.id}`] },
      { question_ids: [first.id, null] },
      { question_ids: [first.id, Number.MAX_SAFE_INTEGER + 1] },
      { question_ids: [first.id, 2147483648] },
    ];

    const responses = [];
    for (const body of invalidBodies) {
      responses.push(await apiRequest({
        method: 'put',
        path: `/api/exams/${exam.id}/questions/reorder`,
        body,
      }));
    }

    expectErrorResponses(responses, 400);
    expect((await listQuestions(exam.id)).map((question) => question.id)).toEqual(originalOrder);
  });

  test('requires exactly all and only IDs belonging to the exam and rolls back failures', async () => {
    const exam = await createExam('reorder_membership');
    const otherExam = await createExam('reorder_membership_other');
    const first = await createQuestion(exam.id, trueFalsePayload('membership_first'));
    const second = await createQuestion(exam.id, shortAnswerPayload('membership_second'));
    const foreign = await createQuestion(otherExam.id, trueFalsePayload('membership_foreign'));
    const unknownId = 2147483647;
    const originalOrder = [first.id, second.id];
    const invalidBodies = [
      { question_ids: [] },
      { question_ids: [first.id] },
      { question_ids: [first.id, second.id, unknownId] },
      { question_ids: [first.id, foreign.id] },
    ];

    const responses = [];
    for (const body of invalidBodies) {
      responses.push(await apiRequest({
        method: 'put',
        path: `/api/exams/${exam.id}/questions/reorder`,
        body,
      }));
    }

    expectErrorResponses(responses, 400);
    expect((await listQuestions(exam.id)).map((question) => question.id)).toEqual(originalOrder);
  });

  test('allows an empty array only when the exam has no questions', async () => {
    const emptyExam = await createExam('empty_reorder');
    const response = await apiRequest({
      method: 'put',
      path: `/api/exams/${emptyExam.id}/questions/reorder`,
      body: { question_ids: [] },
    });

    expect(response.status).toBe(200);
    expect(await listQuestions(emptyExam.id)).toEqual([]);
  });

  test('rejects reordering a published exam and preserves its prior order', async () => {
    const exam = await createExam('published_reorder');
    const first = await createQuestion(exam.id, trueFalsePayload('published_reorder_first'));
    const second = await createQuestion(exam.id, shortAnswerPayload('published_reorder_second'));
    await publishExam(exam.id);

    const response = await apiRequest({
      method: 'put',
      path: `/api/exams/${exam.id}/questions/reorder`,
      body: { question_ids: [second.id, first.id] },
    });
    expect(response.status).toBe(409);

    const rows = await pool.query(
      'SELECT id FROM questions WHERE exam_id = $1 ORDER BY position, id',
      [exam.id],
    );
    expect(rows.rows.map((row) => row.id)).toEqual([first.id, second.id]);
  });
});

describe('question API security', () => {
  test('does not expose credentials, internal storage names, or raw database errors', () => {
    expect(questionApiBodies.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(questionApiBodies).toLowerCase();

    expect(serialized).not.toContain('password_hash');
    expect(serialized).not.toContain('postgresql://');
    expect(serialized).not.toContain('database_url');
    expect(serialized).not.toContain('jwt_secret');
    expect(serialized).not.toContain('bearer ');
    expect(serialized).not.toContain('"token"');
    expect(serialized).not.toContain('"constraint"');
    expect(serialized).not.toContain('"detail"');
    expect(serialized).not.toContain('"stack"');
    expect(serialized).not.toContain('23505');
    expect(serialized).not.toContain('23514');
  });
});
