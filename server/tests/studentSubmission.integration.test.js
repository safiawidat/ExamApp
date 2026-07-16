import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest';
import {
  loadTestApplication,
  runPrefix,
  username,
} from './testDatabase.js';

const password = 'Test-only password 42!';
const bearer = (token) => `Bearer ${token}`;
const typeName = `${runPrefix}_student_submission_type`;
const createdExamIds = [];
const createdExamTypeIds = [];

let app;
let pool;
let authService;
let userRepository;
let lecturer;
let studentA;
let studentB;
let lecturerAuthorization;
let studentAAuthorization;
let studentBAuthorization;
let examType;
let draftExam;
let mainExam;
let alternateExam;
let multipleChoiceQuestion;
let trueFalseQuestion;
let shortAnswerQuestion;
let unansweredMultipleChoiceQuestion;
let alternateQuestion;
let firstQuestionOption;
let secondQuestionOption;
let otherQuestionOption;

const registerStudent = async (label) => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ username: username(label), password });

  expect(response.status).toBe(201);
  return {
    user: response.body.user,
    authorization: bearer(response.body.token),
  };
};

const login = async (loginUsername) => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username: loginUsername, password });

  expect(response.status).toBe(200);
  return bearer(response.body.token);
};

const insertExam = async ({ title, status, publishedAt }) => {
  const result = await pool.query(
    `INSERT INTO exams (
       lecturer_id,
       exam_type_id,
       title,
       description,
       status,
       published_at
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, title`,
    [
      lecturer.id,
      examType.id,
      title,
      `${title} description`,
      status,
      publishedAt,
    ],
  );

  createdExamIds.push(result.rows[0].id);
  return result.rows[0];
};

const insertQuestion = async ({ examId, type, prompt, position, answer }) => {
  const result = await pool.query(
    `INSERT INTO questions (exam_id, type, text, points, position, correct_answer)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, type, position`,
    [examId, type, prompt, position, position, answer],
  );

  return result.rows[0];
};

const insertOption = async ({ questionId, text, position, isCorrect }) => {
  const result = await pool.query(
    `INSERT INTO question_options (question_id, text, position, is_correct)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [questionId, text, position, isCorrect],
  );

  return result.rows[0];
};

const mainAnswers = () => [
  {
    question_id: multipleChoiceQuestion.id,
    selected_option_id: firstQuestionOption.id,
  },
  {
    question_id: trueFalseQuestion.id,
    boolean_answer: false,
  },
  {
    question_id: shortAnswerQuestion.id,
    text_answer: '  A trimmed student response  ',
  },
  {
    question_id: unansweredMultipleChoiceQuestion.id,
  },
];

const postSubmission = (
  authorization,
  examId = mainExam.id,
  answers = mainAnswers(),
) => request(app)
  .post(`/api/student/exams/${examId}/submissions`)
  .set('Authorization', authorization)
  .send({ answers });

const submissionCounts = async () => {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::INTEGER
        FROM exam_submissions
        WHERE exam_id = ANY($1::int[])) AS submissions,
       (SELECT COUNT(*)::INTEGER
        FROM submission_answers
        WHERE exam_id = ANY($1::int[])) AS answers`,
    [createdExamIds],
  );

  return result.rows[0];
};

const expectNoSubmissionRows = async () => {
  expect(await submissionCounts()).toEqual({ submissions: 0, answers: 0 });
};

const collectKeys = (value, keys = []) => {
  if (!value || typeof value !== 'object') {
    return keys;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    keys.push(key);
    collectKeys(nestedValue, keys);
  }

  return keys;
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
        WHERE q.exam_id = ANY($1::int[])) AS question_options,
       (SELECT COUNT(*)::INTEGER
        FROM exam_submissions
        WHERE exam_id = ANY($1::int[])) AS exam_submissions,
       (SELECT COUNT(*)::INTEGER
        FROM submission_answers
        WHERE exam_id = ANY($1::int[])) AS submission_answers`,
    [createdExamIds, createdExamTypeIds, usernamePrefix],
  );

  expect(result.rows[0]).toEqual({
    users: 0,
    exams: 0,
    exam_types: 0,
    questions: 0,
    question_options: 0,
    exam_submissions: 0,
    submission_answers: 0,
  });
};

beforeAll(async () => {
  ({ app, pool } = await loadTestApplication());
  [authService, userRepository] = await Promise.all([
    import('../services/authService.js'),
    import('../repositories/userRepository.js'),
  ]);

  const normalizedUsername = authService.normalizeAndValidateUsername(
    username('student_submission_lecturer'),
  );
  const validatedPassword = authService.validatePassword(password);
  const passwordHash = await authService.hashPassword(validatedPassword);
  lecturer = await userRepository.upsertLecturer({
    username: normalizedUsername,
    passwordHash,
  });
  lecturerAuthorization = await login(lecturer.username);

  const registeredStudents = await Promise.all([
    registerStudent('student_submission_a'),
    registerStudent('student_submission_b'),
  ]);
  studentA = registeredStudents[0].user;
  studentB = registeredStudents[1].user;
  studentAAuthorization = registeredStudents[0].authorization;
  studentBAuthorization = registeredStudents[1].authorization;

  const typeResult = await pool.query(
    `INSERT INTO exam_types (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [typeName, 'Test-only submission exam type.', lecturer.id],
  );
  examType = typeResult.rows[0];
  createdExamTypeIds.push(examType.id);

  draftExam = await insertExam({
    title: `${runPrefix} submission draft`,
    status: 'draft',
    publishedAt: null,
  });
  mainExam = await insertExam({
    title: `${runPrefix} main submission exam`,
    status: 'published',
    publishedAt: '2025-04-01T09:00:00.000Z',
  });
  alternateExam = await insertExam({
    title: `${runPrefix} alternate submission exam`,
    status: 'published',
    publishedAt: '2025-04-02T09:00:00.000Z',
  });

  await insertQuestion({
    examId: draftExam.id,
    type: 'short_answer',
    prompt: `${runPrefix} hidden draft question`,
    position: 1,
    answer: 'Hidden reference answer',
  });

  multipleChoiceQuestion = await insertQuestion({
    examId: mainExam.id,
    type: 'multiple_choice',
    prompt: `${runPrefix} first multiple-choice question`,
    position: 20,
    answer: null,
  });
  trueFalseQuestion = await insertQuestion({
    examId: mainExam.id,
    type: 'true_false',
    prompt: `${runPrefix} true-false question`,
    position: 40,
    answer: 'false',
  });
  shortAnswerQuestion = await insertQuestion({
    examId: mainExam.id,
    type: 'short_answer',
    prompt: `${runPrefix} short-answer question`,
    position: 10,
    answer: 'Private reference answer',
  });
  unansweredMultipleChoiceQuestion = await insertQuestion({
    examId: mainExam.id,
    type: 'multiple_choice',
    prompt: `${runPrefix} unanswered multiple-choice question`,
    position: 30,
    answer: null,
  });
  alternateQuestion = await insertQuestion({
    examId: alternateExam.id,
    type: 'true_false',
    prompt: `${runPrefix} alternate true-false question`,
    position: 1,
    answer: 'true',
  });

  firstQuestionOption = await insertOption({
    questionId: multipleChoiceQuestion.id,
    text: `${runPrefix} first correct option`,
    position: 1,
    isCorrect: true,
  });
  secondQuestionOption = await insertOption({
    questionId: multipleChoiceQuestion.id,
    text: `${runPrefix} first incorrect option`,
    position: 2,
    isCorrect: false,
  });
  otherQuestionOption = await insertOption({
    questionId: unansweredMultipleChoiceQuestion.id,
    text: `${runPrefix} other question option`,
    position: 1,
    isCorrect: true,
  });
});

beforeEach(async () => {
  await pool.query(
    'DELETE FROM submission_answers WHERE exam_id = ANY($1::int[])',
    [createdExamIds],
  );
  await pool.query(
    'DELETE FROM exam_submissions WHERE exam_id = ANY($1::int[])',
    [createdExamIds],
  );
});

afterAll(async () => {
  if (pool) {
    try {
      await pool.query(
        'DELETE FROM submission_answers WHERE exam_id = ANY($1::int[])',
        [createdExamIds],
      );
      await pool.query(
        'DELETE FROM exam_submissions WHERE exam_id = ANY($1::int[])',
        [createdExamIds],
      );
      await pool.query('DELETE FROM exams WHERE id = ANY($1::int[])', [createdExamIds]);
      await pool.query(
        'DELETE FROM exam_types WHERE id = ANY($1::int[])',
        [createdExamTypeIds],
      );
      const usernamePrefix = `${runPrefix}_`;
      await pool.query(
        'DELETE FROM users WHERE LEFT(username, LENGTH($1)) = $1',
        [usernamePrefix],
      );
      await verifyRunRecordsRemoved();
    } finally {
      await pool.end();
    }
  }
});

describe('student final submission', () => {
  test('requires authentication and forbids lecturer access', async () => {
    const unauthenticated = await request(app)
      .post(`/api/student/exams/${mainExam.id}/submissions`)
      .send({ answers: mainAnswers() });
    const lecturerResponse = await postSubmission(lecturerAuthorization);

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toEqual({ error: 'Authentication required.' });
    expect(lecturerResponse.status).toBe(403);
    expect(lecturerResponse.body).toEqual({ error: 'Access forbidden.' });
    await expectNoSubmissionRows();
  });

  test('stores one mixed final submission and updates student delivery state', async () => {
    const response = await postSubmission(studentAAuthorization);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual([
      'answer_count',
      'exam_id',
      'id',
      'submitted_at',
    ]);
    expect(response.body).toMatchObject({
      exam_id: mainExam.id,
      answer_count: 4,
    });
    expect(Number.isInteger(response.body.id)).toBe(true);
    expect(Number.isNaN(Date.parse(response.body.submitted_at))).toBe(false);
    expect(collectKeys(response.body)).not.toContain('student_id');
    expect(collectKeys(response.body)).not.toContain('score');
    expect(collectKeys(response.body)).not.toContain('feedback');

    const submissionResult = await pool.query(
      `SELECT id, exam_id, student_id
       FROM exam_submissions
       WHERE exam_id = $1 AND student_id = $2`,
      [mainExam.id, studentA.id],
    );
    const answerResult = await pool.query(
      `SELECT
         sa.question_id,
         sa.selected_option_id,
         sa.boolean_answer,
         sa.text_answer
       FROM submission_answers sa
       JOIN questions q ON q.id = sa.question_id
       WHERE sa.submission_id = $1
       ORDER BY q.position, q.id`,
      [response.body.id],
    );

    expect(submissionResult.rows).toHaveLength(1);
    expect(submissionResult.rows[0].id).toBe(response.body.id);
    expect(answerResult.rows).toEqual([
      {
        question_id: shortAnswerQuestion.id,
        selected_option_id: null,
        boolean_answer: null,
        text_answer: 'A trimmed student response',
      },
      {
        question_id: multipleChoiceQuestion.id,
        selected_option_id: firstQuestionOption.id,
        boolean_answer: null,
        text_answer: null,
      },
      {
        question_id: unansweredMultipleChoiceQuestion.id,
        selected_option_id: null,
        boolean_answer: null,
        text_answer: null,
      },
      {
        question_id: trueFalseQuestion.id,
        selected_option_id: null,
        boolean_answer: false,
        text_answer: null,
      },
    ]);

    const [studentAList, studentADetail, studentBList, studentBDetail] = await Promise.all([
      request(app)
        .get('/api/student/exams')
        .set('Authorization', studentAAuthorization),
      request(app)
        .get(`/api/student/exams/${mainExam.id}`)
        .set('Authorization', studentAAuthorization),
      request(app)
        .get('/api/student/exams')
        .set('Authorization', studentBAuthorization),
      request(app)
        .get(`/api/student/exams/${mainExam.id}`)
        .set('Authorization', studentBAuthorization),
    ]);

    expect(studentAList.body.find(({ id }) => id === mainExam.id).has_submitted)
      .toBe(true);
    expect(studentADetail.body.has_submitted).toBe(true);
    expect(studentBList.body.find(({ id }) => id === mainExam.id).has_submitted)
      .toBe(false);
    expect(studentBDetail.body.has_submitted).toBe(false);
  });

  test('enforces one final submission without blocking other valid exam-student pairs', async () => {
    const first = await postSubmission(studentAAuthorization);
    const countsAfterFirst = await submissionCounts();
    const duplicate = await postSubmission(studentAAuthorization);

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({
      error: 'Exam has already been submitted.',
    });
    expect(await submissionCounts()).toEqual(countsAfterFirst);

    const otherStudent = await postSubmission(studentBAuthorization);
    const otherExam = await postSubmission(
      studentAAuthorization,
      alternateExam.id,
      [{ question_id: alternateQuestion.id, boolean_answer: true }],
    );

    expect(otherStudent.status).toBe(201);
    expect(otherExam.status).toBe(201);
    expect(await submissionCounts()).toEqual({ submissions: 3, answers: 9 });
  });

  test('returns the same safe not-found response for draft and missing exams', async () => {
    const draftResponse = await postSubmission(
      studentAAuthorization,
      draftExam.id,
      [],
    );
    const missingResponse = await postSubmission(
      studentAAuthorization,
      2147483647,
      [],
    );

    expect(draftResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    expect(draftResponse.body).toEqual({ error: 'Exam not found.' });
    expect(missingResponse.body).toEqual(draftResponse.body);
    await expectNoSubmissionRows();
  });

  test.each(['0', '-1', '1.5', 'not-a-number', '9007199254740992'])(
    'rejects invalid exam ID %s',
    async (invalidId) => {
      const response = await request(app)
        .post(`/api/student/exams/${invalidId}/submissions`)
        .set('Authorization', studentAAuthorization)
        .send({ answers: mainAnswers() });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Exam ID must be a positive integer.',
      });
      await expectNoSubmissionRows();
    },
  );

  test('validates the exact top-level submission payload contract', async () => {
    const cases = [
      {
        send: (agent) => agent,
        error: 'Submission answers must be an array.',
      },
      {
        send: (agent) => agent.send([]),
        error: 'Request body must be a JSON object.',
      },
      {
        send: (agent) => agent.send({}),
        error: 'Submission answers must be an array.',
      },
      {
        send: (agent) => agent.send({ answers: {} }),
        error: 'Submission answers must be an array.',
      },
      {
        send: (agent) => agent.send({ answers: [], grading: true }),
        error: 'Unsupported submission field: grading.',
      },
    ];

    for (const testCase of cases) {
      const agent = request(app)
        .post(`/api/student/exams/${mainExam.id}/submissions`)
        .set('Authorization', studentAAuthorization);
      const response = await testCase.send(agent);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: testCase.error });
    }

    await expectNoSubmissionRows();
  });

  test('validates and normalizes every answer object safely', async () => {
    const replaceFirstAnswer = (replacement) => [
      replacement,
      ...mainAnswers().slice(1),
    ];
    const cases = [
      {
        answers: replaceFirstAnswer(null),
        error: 'Each submission answer must be a JSON object.',
      },
      {
        answers: replaceFirstAnswer({ selected_option_id: firstQuestionOption.id }),
        error: 'Question ID must be a positive integer.',
      },
      {
        answers: replaceFirstAnswer({ question_id: `${multipleChoiceQuestion.id}` }),
        error: 'Question ID must be a positive integer.',
      },
      {
        answers: replaceFirstAnswer({ question_id: 0 }),
        error: 'Question ID must be a positive integer.',
      },
      {
        answers: replaceFirstAnswer({
          question_id: multipleChoiceQuestion.id,
          is_correct: true,
        }),
        error: 'Unsupported answer field: is_correct.',
      },
      {
        answers: replaceFirstAnswer({
          question_id: multipleChoiceQuestion.id,
          selected_option_id: `${firstQuestionOption.id}`,
        }),
        error: 'Selected option ID must be a positive integer or null.',
      },
      {
        answers: [
          mainAnswers()[0],
          { question_id: trueFalseQuestion.id, boolean_answer: 0 },
          ...mainAnswers().slice(2),
        ],
        error: 'Boolean answer must be true, false, or null.',
      },
      {
        answers: [
          ...mainAnswers().slice(0, 2),
          { question_id: shortAnswerQuestion.id, text_answer: 42 },
          mainAnswers()[3],
        ],
        error: 'Text answer must be a string or null.',
      },
      {
        answers: replaceFirstAnswer({
          question_id: multipleChoiceQuestion.id,
          selected_option_id: firstQuestionOption.id,
          boolean_answer: false,
        }),
        error: 'Each question may contain at most one answer value.',
      },
    ];

    for (const testCase of cases) {
      const response = await postSubmission(
        studentAAuthorization,
        mainExam.id,
        testCase.answers,
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: testCase.error });
    }

    await expectNoSubmissionRows();
  });

  test('requires every exam question exactly once with no extras', async () => {
    const validAnswers = mainAnswers();
    const cases = [
      [validAnswers[0], validAnswers[1], validAnswers[2], validAnswers[0]],
      validAnswers.slice(0, 3),
      [
        validAnswers[0],
        validAnswers[1],
        validAnswers[2],
        { question_id: alternateQuestion.id },
      ],
      [
        validAnswers[0],
        validAnswers[1],
        validAnswers[2],
        { question_id: 2147483647 },
      ],
      [...validAnswers, { question_id: alternateQuestion.id }],
    ];

    for (const answers of cases) {
      const response = await postSubmission(
        studentAAuthorization,
        mainExam.id,
        answers,
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Submission answers must contain every exam question exactly once.',
      });
    }

    await expectNoSubmissionRows();
  });

  test('rejects answer values that do not match the question type', async () => {
    const validAnswers = mainAnswers();
    const cases = [
      {
        answers: [
          { question_id: multipleChoiceQuestion.id, boolean_answer: true },
          ...validAnswers.slice(1),
        ],
        error: 'Multiple-choice answers must use selected_option_id.',
      },
      {
        answers: [
          validAnswers[0],
          { question_id: trueFalseQuestion.id, text_answer: 'true' },
          ...validAnswers.slice(2),
        ],
        error: 'True/false answers must use boolean_answer.',
      },
      {
        answers: [
          ...validAnswers.slice(0, 2),
          {
            question_id: shortAnswerQuestion.id,
            selected_option_id: firstQuestionOption.id,
          },
          validAnswers[3],
        ],
        error: 'Short answers must use text_answer.',
      },
    ];

    for (const testCase of cases) {
      const response = await postSubmission(
        studentAAuthorization,
        mainExam.id,
        testCase.answers,
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: testCase.error });
    }

    await expectNoSubmissionRows();
  });

  test('rolls back the submission when option ownership fails during answer insertion', async () => {
    for (const invalidOptionId of [firstQuestionOption.id, 2147483647]) {
      const answers = mainAnswers();
      answers[3] = {
        question_id: unansweredMultipleChoiceQuestion.id,
        selected_option_id: invalidOptionId,
      };

      const response = await postSubmission(
        studentAAuthorization,
        mainExam.id,
        answers,
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Selected option does not belong to the question.',
      });
      await expectNoSubmissionRows();
    }
  });

  test('stores explicit unanswered values as null for every public question type', async () => {
    const response = await postSubmission(
      studentAAuthorization,
      mainExam.id,
      [
        {
          question_id: multipleChoiceQuestion.id,
          selected_option_id: null,
        },
        {
          question_id: trueFalseQuestion.id,
          boolean_answer: null,
        },
        {
          question_id: shortAnswerQuestion.id,
          text_answer: '   ',
        },
        { question_id: unansweredMultipleChoiceQuestion.id },
      ],
    );

    expect(response.status).toBe(201);
    expect(response.body.answer_count).toBe(4);

    const result = await pool.query(
      `SELECT selected_option_id, boolean_answer, text_answer
       FROM submission_answers
       WHERE submission_id = $1`,
      [response.body.id],
    );

    expect(result.rows).toHaveLength(4);
    expect(result.rows).toEqual(
      expect.arrayContaining([
        {
          selected_option_id: null,
          boolean_answer: null,
          text_answer: null,
        },
      ]),
    );
    expect(result.rows.every((row) => Object.values(row).every((value) => value === null)))
      .toBe(true);
  });

  test('keeps success and database-backed error responses free of private data', async () => {
    const success = await postSubmission(studentAAuthorization);
    const duplicate = await postSubmission(studentAAuthorization);
    const serialized = JSON.stringify([success.body, duplicate.body]);

    expect(success.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(serialized).not.toContain('correct_answer');
    expect(serialized).not.toContain('reference_answer');
    expect(serialized).not.toContain('is_correct');
    expect(serialized).not.toContain('exam_submissions_exam_student_unique');
    expect(serialized).not.toContain('submission_answers_option_question_fkey');
    expect(serialized).not.toContain('INSERT INTO');
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain('password_hash');
  });
});
