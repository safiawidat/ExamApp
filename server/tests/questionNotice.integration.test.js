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
const typeName = `${runPrefix}_question_notice_type`;
const createdExamIds = [];
const createdExamTypeIds = [];

let app;
let pool;
let authService;
let userRepository;
let lecturerA;
let lecturerB;
let student;
let lecturerAAuthorization;
let lecturerBAuthorization;
let studentAuthorization;
let examType;
let draftExam;
let publishedExamA;
let publishedExamB;
let draftQuestion;
let multipleChoiceQuestion;
let trueFalseQuestion;
let foreignQuestion;
let correctOption;
let incorrectOption;

const login = async (loginUsername) => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username: loginUsername, password });

  expect(response.status).toBe(200);
  return bearer(response.body.token);
};

const registerStudent = async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ username: username('question_notice_student'), password });

  expect(response.status).toBe(201);
  return {
    user: response.body.user,
    authorization: bearer(response.body.token),
  };
};

const createLecturer = async (label) => {
  const normalizedUsername = authService.normalizeAndValidateUsername(
    username(label),
  );
  const validatedPassword = authService.validatePassword(password);
  const passwordHash = await authService.hashPassword(validatedPassword);

  return userRepository.upsertLecturer({
    username: normalizedUsername,
    passwordHash,
  });
};

const insertExam = async ({ lecturerId, title, status, publishedAt }) => {
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
      lecturerId,
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

const insertQuestion = async ({
  examId,
  type,
  prompt,
  points,
  position,
  correctAnswer,
}) => {
  const result = await pool.query(
    `INSERT INTO questions (exam_id, type, text, points, position, correct_answer)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, exam_id, type, text, points, position, correct_answer`,
    [examId, type, prompt, points, position, correctAnswer],
  );

  return result.rows[0];
};

const noticePath = (
  examId = publishedExamA.id,
  questionId = multipleChoiceQuestion.id,
) => `/api/exams/${examId}/questions/${questionId}/notice`;

const putNotice = (
  authorization = lecturerAAuthorization,
  payload = { message: 'Clarification for students.', placement: 'above' },
  examId = publishedExamA.id,
  questionId = multipleChoiceQuestion.id,
) => request(app)
  .put(noticePath(examId, questionId))
  .set('Authorization', authorization)
  .send(payload);

const noticeCount = async () => {
  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM question_notices
     WHERE exam_id = ANY($1::int[])`,
    [createdExamIds],
  );

  return result.rows[0].count;
};

const readPublishedContent = async () => {
  const [questions, options] = await Promise.all([
    pool.query(
      `SELECT id, exam_id, type, text, points, position, correct_answer
       FROM questions
       WHERE exam_id = $1
       ORDER BY position, id`,
      [publishedExamA.id],
    ),
    pool.query(
      `SELECT qo.id, qo.question_id, qo.text, qo.position, qo.is_correct
       FROM question_options qo
       JOIN questions q ON q.id = qo.question_id
       WHERE q.exam_id = $1
       ORDER BY q.position, q.id, qo.position, qo.id`,
      [publishedExamA.id],
    ),
  ]);

  return { questions: questions.rows, options: options.rows };
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
        FROM question_notices
        WHERE exam_id = ANY($1::int[])) AS question_notices,
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
    question_notices: 0,
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

  [lecturerA, lecturerB] = await Promise.all([
    createLecturer('question_notice_lecturer_a'),
    createLecturer('question_notice_lecturer_b'),
  ]);
  [lecturerAAuthorization, lecturerBAuthorization] = await Promise.all([
    login(lecturerA.username),
    login(lecturerB.username),
  ]);
  const registeredStudent = await registerStudent();
  student = registeredStudent.user;
  studentAuthorization = registeredStudent.authorization;

  const typeResult = await pool.query(
    `INSERT INTO exam_types (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [typeName, 'Test-only question notice type.', lecturerA.id],
  );
  examType = typeResult.rows[0];
  createdExamTypeIds.push(examType.id);

  draftExam = await insertExam({
    lecturerId: lecturerA.id,
    title: `${runPrefix} notice draft`,
    status: 'draft',
    publishedAt: null,
  });
  publishedExamA = await insertExam({
    lecturerId: lecturerA.id,
    title: `${runPrefix} notice published A`,
    status: 'published',
    publishedAt: '2025-05-01T09:00:00.000Z',
  });
  publishedExamB = await insertExam({
    lecturerId: lecturerB.id,
    title: `${runPrefix} notice published B`,
    status: 'published',
    publishedAt: '2025-05-02T09:00:00.000Z',
  });

  draftQuestion = await insertQuestion({
    examId: draftExam.id,
    type: 'true_false',
    prompt: `${runPrefix} draft question`,
    points: 2,
    position: 1,
    correctAnswer: 'true',
  });
  multipleChoiceQuestion = await insertQuestion({
    examId: publishedExamA.id,
    type: 'multiple_choice',
    prompt: `${runPrefix} immutable multiple-choice prompt`,
    points: 7,
    position: 20,
    correctAnswer: null,
  });
  trueFalseQuestion = await insertQuestion({
    examId: publishedExamA.id,
    type: 'true_false',
    prompt: `${runPrefix} immutable true-false prompt`,
    points: 5,
    position: 10,
    correctAnswer: 'false',
  });
  foreignQuestion = await insertQuestion({
    examId: publishedExamB.id,
    type: 'short_answer',
    prompt: `${runPrefix} foreign short-answer prompt`,
    points: 3,
    position: 1,
    correctAnswer: 'Private reference answer',
  });

  const optionResult = await pool.query(
    `INSERT INTO question_options (question_id, text, position, is_correct)
     VALUES
       ($1, $2, 2, FALSE),
       ($1, $3, 1, TRUE)
     RETURNING id, text`,
    [
      multipleChoiceQuestion.id,
      `${runPrefix} immutable incorrect option`,
      `${runPrefix} immutable correct option`,
    ],
  );
  incorrectOption = optionResult.rows.find((row) => row.text.includes('incorrect'));
  correctOption = optionResult.rows.find((row) => !row.text.includes('incorrect'));
});

beforeEach(async () => {
  await pool.query(
    'DELETE FROM question_notices WHERE exam_id = ANY($1::int[])',
    [createdExamIds],
  );
});

afterAll(async () => {
  if (pool) {
    try {
      await pool.query(
        'DELETE FROM question_notices WHERE exam_id = ANY($1::int[])',
        [createdExamIds],
      );
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

describe('lecturer question notices', () => {
  test('requires authentication for GET, PUT, and DELETE', async () => {
    const responses = await Promise.all([
      request(app).get(noticePath()),
      request(app).put(noticePath()).send({
        message: 'Unauthenticated notice',
        placement: 'above',
      }),
      request(app).delete(noticePath()),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required.' });
    }
    expect(await noticeCount()).toBe(0);
  });

  test('forbids students from GET, PUT, and DELETE', async () => {
    const responses = await Promise.all([
      request(app)
        .get(noticePath())
        .set('Authorization', studentAuthorization),
      request(app)
        .put(noticePath())
        .set('Authorization', studentAuthorization)
        .send({ message: 'Student notice', placement: 'above' }),
      request(app)
        .delete(noticePath())
        .set('Authorization', studentAuthorization),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Access forbidden.' });
    }
    expect(await noticeCount()).toBe(0);
  });

  test('hides a published exam owned by another lecturer for every operation', async () => {
    const path = noticePath(publishedExamB.id, foreignQuestion.id);
    const responses = [
      await request(app).get(path).set('Authorization', lecturerAAuthorization),
      await request(app)
        .put(path)
        .set('Authorization', lecturerAAuthorization)
        .send({ message: 'Foreign notice', placement: 'above' }),
      await request(app).delete(path).set('Authorization', lecturerAAuthorization),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Exam not found.' });
    }
    expect(await noticeCount()).toBe(0);
  });

  test('rejects notices on an owned draft exam', async () => {
    const response = await putNotice(
      lecturerAAuthorization,
      { message: 'Draft notice', placement: 'above' },
      draftExam.id,
      draftQuestion.id,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Question notices are available only for published exams.',
    });
    expect(await noticeCount()).toBe(0);
  });

  test('hides foreign and nonexistent questions behind the same safe response', async () => {
    for (const questionId of [foreignQuestion.id, 2147483647]) {
      const response = await putNotice(
        lecturerAAuthorization,
        { message: 'Invalid target', placement: 'above' },
        publishedExamA.id,
        questionId,
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Question not found.' });
    }
    expect(await noticeCount()).toBe(0);
  });

  test('returns the same missing-notice response for GET and DELETE', async () => {
    const getResponse = await request(app)
      .get(noticePath())
      .set('Authorization', lecturerAAuthorization);
    const deleteResponse = await request(app)
      .delete(noticePath())
      .set('Authorization', lecturerAAuthorization);

    expect(getResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
    expect(getResponse.body).toEqual({ error: 'Question notice not found.' });
    expect(deleteResponse.body).toEqual(getResponse.body);
  });

  test('creates one trimmed notice through the exact safe response projection', async () => {
    const response = await putNotice(
      lecturerAAuthorization,
      { message: '  Clarification for students.  ', placement: 'above' },
    );

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'created_at',
      'exam_id',
      'message',
      'placement',
      'question_id',
      'updated_at',
    ]);
    expect(response.body).toMatchObject({
      question_id: multipleChoiceQuestion.id,
      exam_id: publishedExamA.id,
      message: 'Clarification for students.',
      placement: 'above',
    });
    expect(Number.isNaN(Date.parse(response.body.created_at))).toBe(false);
    expect(Number.isNaN(Date.parse(response.body.updated_at))).toBe(false);
    expect(await noticeCount()).toBe(1);

    const row = await pool.query(
      `SELECT question_id, exam_id, message, placement
       FROM question_notices
       WHERE question_id = $1`,
      [multipleChoiceQuestion.id],
    );
    expect(row.rows).toEqual([{
      question_id: multipleChoiceQuestion.id,
      exam_id: publishedExamA.id,
      message: 'Clarification for students.',
      placement: 'above',
    }]);

    const keys = collectKeys(response.body);
    for (const forbidden of [
      'lecturer_id',
      'prompt',
      'question_type',
      'points',
      'options',
      'correct_answer',
      'reference_answer',
      'is_correct',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  test('reads an existing notice through the exact safe projection', async () => {
    const created = await putNotice();
    const response = await request(app)
      .get(noticePath())
      .set('Authorization', lecturerAAuthorization);

    expect(created.status).toBe(200);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(created.body);
    expect(Object.keys(response.body).sort()).toEqual([
      'created_at',
      'exam_id',
      'message',
      'placement',
      'question_id',
      'updated_at',
    ]);
  });

  test('updates by upsert while preserving creation time and row uniqueness', async () => {
    const created = await putNotice();
    const updated = await putNotice(
      lecturerAAuthorization,
      { message: '  Replacement clarification.  ', placement: 'below' },
    );
    const read = await request(app)
      .get(noticePath())
      .set('Authorization', lecturerAAuthorization);

    expect(created.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      question_id: multipleChoiceQuestion.id,
      exam_id: publishedExamA.id,
      message: 'Replacement clarification.',
      placement: 'below',
      created_at: created.body.created_at,
    });
    expect(Date.parse(updated.body.updated_at)).toBeGreaterThanOrEqual(
      Date.parse(created.body.updated_at),
    );
    expect(read.body).toEqual(updated.body);
    expect(await noticeCount()).toBe(1);
  });

  test('deletes only the notice and returns 204 without content', async () => {
    await putNotice();
    const response = await request(app)
      .delete(noticePath())
      .set('Authorization', lecturerAAuthorization);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(await noticeCount()).toBe(0);

    const contentCount = await pool.query(
      `SELECT
         (SELECT COUNT(*)::INTEGER
          FROM questions
          WHERE id = $1 AND exam_id = $2) AS questions,
         (SELECT COUNT(*)::INTEGER
          FROM question_options
          WHERE question_id = $1) AS options`,
      [multipleChoiceQuestion.id, publishedExamA.id],
    );
    expect(contentCount.rows[0]).toEqual({ questions: 1, options: 2 });

    const laterGet = await request(app)
      .get(noticePath())
      .set('Authorization', lecturerAAuthorization);
    expect(laterGet.status).toBe(404);
    expect(laterGet.body).toEqual({ error: 'Question notice not found.' });
  });

  test('rejects invalid PUT payloads without creating a notice', async () => {
    const cases = [
      {
        send: (agent) => agent,
        error: 'Notice message is required.',
      },
      {
        send: (agent) => agent.send([]),
        error: 'Request body must be a JSON object.',
      },
      {
        send: (agent) => agent.send({}),
        error: 'Notice message is required.',
      },
      {
        send: (agent) => agent.send({ message: 42, placement: 'above' }),
        error: 'Notice message is required.',
      },
      {
        send: (agent) => agent.send({ message: '   ', placement: 'above' }),
        error: 'Notice message is required.',
      },
      {
        send: (agent) => agent.send({
          message: 'x'.repeat(1001),
          placement: 'above',
        }),
        error: 'Notice message must be at most 1000 characters.',
      },
      {
        send: (agent) => agent.send({ message: 'Missing placement' }),
        error: 'Notice placement must be above or below.',
      },
      {
        send: (agent) => agent.send({
          message: 'Invalid placement',
          placement: 'ABOVE',
        }),
        error: 'Notice placement must be above or below.',
      },
      {
        send: (agent) => agent.send({
          message: 'Unsupported field',
          placement: 'above',
          extra: true,
        }),
        error: 'Unsupported question notice field: extra.',
      },
      {
        send: (agent) => agent.send({
          message: 'Managed field',
          placement: 'above',
          question_id: multipleChoiceQuestion.id,
        }),
        error: 'Unsupported question notice field: question_id.',
      },
      {
        send: (agent) => agent.send({
          message: 'Managed timestamp',
          placement: 'above',
          updated_at: '2025-01-01T00:00:00.000Z',
        }),
        error: 'Unsupported question notice field: updated_at.',
      },
    ];

    for (const testCase of cases) {
      const agent = request(app)
        .put(noticePath())
        .set('Authorization', lecturerAAuthorization);
      const response = await testCase.send(agent);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: testCase.error });
      expect(await noticeCount()).toBe(0);
    }
  });

  test.each(['0', '-1', '1.5', 'not-a-number', '2147483648'])(
    'rejects invalid exam ID %s',
    async (invalidId) => {
      const response = await putNotice(
        lecturerAAuthorization,
        { message: 'Invalid exam ID', placement: 'above' },
        invalidId,
        multipleChoiceQuestion.id,
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Exam ID must be a positive integer.',
      });
      expect(await noticeCount()).toBe(0);
    },
  );

  test.each(['0', '-1', '1.5', 'not-a-number', '2147483648'])(
    'rejects invalid question ID %s',
    async (invalidId) => {
      const response = await putNotice(
        lecturerAAuthorization,
        { message: 'Invalid question ID', placement: 'above' },
        publishedExamA.id,
        invalidId,
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Question ID must be a positive integer.',
      });
      expect(await noticeCount()).toBe(0);
    },
  );

  test('never changes published question content or student delivery in Task 6A', async () => {
    const before = await readPublishedContent();
    const created = await putNotice();
    const updated = await putNotice(
      lecturerAAuthorization,
      { message: 'Updated immutable clarification', placement: 'below' },
    );
    const deleted = await request(app)
      .delete(noticePath())
      .set('Authorization', lecturerAAuthorization);
    const after = await readPublishedContent();

    expect(created.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(deleted.status).toBe(204);
    expect(after).toEqual(before);
    expect(before.options).toEqual([
      {
        id: correctOption.id,
        question_id: multipleChoiceQuestion.id,
        text: correctOption.text,
        position: 1,
        is_correct: true,
      },
      {
        id: incorrectOption.id,
        question_id: multipleChoiceQuestion.id,
        text: incorrectOption.text,
        position: 2,
        is_correct: false,
      },
    ]);

    const studentResponse = await request(app)
      .get(`/api/student/exams/${publishedExamA.id}`)
      .set('Authorization', studentAuthorization);
    expect(studentResponse.status).toBe(200);
    expect(collectKeys(studentResponse.body)).not.toContain('notice');
    expect(studentResponse.body.questions).toHaveLength(2);
    expect(student.id).toBeGreaterThan(0);
    expect(lecturerBAuthorization).toMatch(/^Bearer /);
  });
});
