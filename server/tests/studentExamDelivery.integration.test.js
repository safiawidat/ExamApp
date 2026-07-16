import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  loadTestApplication,
  runPrefix,
  username,
} from './testDatabase.js';

const password = 'Test-only password 42!';
const bearer = (token) => `Bearer ${token}`;
const typeName = `${runPrefix}_student_delivery_type`;
const createdExamIds = [];
const createdExamTypeIds = [];

const publicationTimes = {
  older: '2025-01-01T09:00:00.000Z',
  newer: '2025-02-01T09:00:00.000Z',
};

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
let olderExam;
let detailedExam;
let newerTieExam;
let shortAnswerQuestion;
let multipleChoiceQuestion;
let trueFalseQuestion;
let firstOption;
let secondOption;

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

const insertExam = async ({ title, description, status, publishedAt }) => {
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
     RETURNING id, title, description, published_at`,
    [lecturer.id, examType.id, title, description, status, publishedAt],
  );

  createdExamIds.push(result.rows[0].id);
  return result.rows[0];
};

const insertQuestion = async ({ examId, type, prompt, points, position, answer }) => {
  const result = await pool.query(
    `INSERT INTO questions (exam_id, type, text, points, position, correct_answer)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, type, text, points, position`,
    [examId, type, prompt, points, position, answer],
  );

  return result.rows[0];
};

const insertOption = async ({ questionId, text, position, isCorrect }) => {
  const result = await pool.query(
    `INSERT INTO question_options (question_id, text, position, is_correct)
     VALUES ($1, $2, $3, $4)
     RETURNING id, text, position`,
    [questionId, text, position, isCorrect],
  );

  return result.rows[0];
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
    username('student_delivery_lecturer'),
  );
  const validatedPassword = authService.validatePassword(password);
  const passwordHash = await authService.hashPassword(validatedPassword);
  lecturer = await userRepository.upsertLecturer({
    username: normalizedUsername,
    passwordHash,
  });
  lecturerAuthorization = await login(lecturer.username);

  const registeredStudents = await Promise.all([
    registerStudent('student_delivery_a'),
    registerStudent('student_delivery_b'),
  ]);
  studentA = registeredStudents[0].user;
  studentB = registeredStudents[1].user;
  studentAAuthorization = registeredStudents[0].authorization;
  studentBAuthorization = registeredStudents[1].authorization;

  const typeResult = await pool.query(
    `INSERT INTO exam_types (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, name`,
    [typeName, 'Test-only student delivery type.', lecturer.id],
  );
  examType = typeResult.rows[0];
  createdExamTypeIds.push(examType.id);

  draftExam = await insertExam({
    title: `${runPrefix} hidden draft`,
    description: 'This draft must remain hidden.',
    status: 'draft',
    publishedAt: null,
  });
  olderExam = await insertExam({
    title: `${runPrefix} older published`,
    description: null,
    status: 'published',
    publishedAt: publicationTimes.older,
  });
  detailedExam = await insertExam({
    title: `${runPrefix} detailed published`,
    description: 'Safe delivery detail fixture.',
    status: 'published',
    publishedAt: publicationTimes.newer,
  });
  newerTieExam = await insertExam({
    title: `${runPrefix} newer tie published`,
    description: 'Higher ID at the same publication time.',
    status: 'published',
    publishedAt: publicationTimes.newer,
  });

  multipleChoiceQuestion = await insertQuestion({
    examId: detailedExam.id,
    type: 'multiple_choice',
    prompt: 'Choose the safe option.',
    points: 5,
    position: 2,
    answer: null,
  });
  trueFalseQuestion = await insertQuestion({
    examId: detailedExam.id,
    type: 'true_false',
    prompt: 'The stored answer must remain private.',
    points: 3,
    position: 3,
    answer: 'false',
  });
  shortAnswerQuestion = await insertQuestion({
    examId: detailedExam.id,
    type: 'short_answer',
    prompt: 'Provide a short response.',
    points: 4,
    position: 1,
    answer: 'Private reference answer',
  });

  secondOption = await insertOption({
    questionId: multipleChoiceQuestion.id,
    text: 'Second visible option',
    position: 2,
    isCorrect: false,
  });
  firstOption = await insertOption({
    questionId: multipleChoiceQuestion.id,
    text: 'First visible option',
    position: 1,
    isCorrect: true,
  });

  await insertQuestion({
    examId: newerTieExam.id,
    type: 'true_false',
    prompt: 'A second published exam question.',
    points: 7,
    position: 1,
    answer: 'true',
  });

  await pool.query(
    `INSERT INTO exam_submissions (exam_id, student_id, submitted_at)
     VALUES ($1, $2, $3)`,
    [detailedExam.id, studentA.id, '2025-02-02T09:00:00.000Z'],
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

describe('student exam delivery authorization', () => {
  test('requires student authentication for both list and detail routes', async () => {
    const responses = [
      await request(app).get('/api/student/exams'),
      await request(app).get(`/api/student/exams/${detailedExam.id}`),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required.' });
    }
  });

  test('forbids lecturers and permits students on both routes', async () => {
    const lecturerResponses = [
      await request(app)
        .get('/api/student/exams')
        .set('Authorization', lecturerAuthorization),
      await request(app)
        .get(`/api/student/exams/${detailedExam.id}`)
        .set('Authorization', lecturerAuthorization),
    ];

    for (const response of lecturerResponses) {
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Access forbidden.' });
    }

    const studentResponses = [
      await request(app)
        .get('/api/student/exams')
        .set('Authorization', studentAAuthorization),
      await request(app)
        .get(`/api/student/exams/${detailedExam.id}`)
        .set('Authorization', studentAAuthorization),
    ];

    for (const response of studentResponses) {
      expect(response.status).toBe(200);
    }
  });
});

describe('published student exam catalog', () => {
  test('filters drafts, orders published exams, and returns exact safe aggregates', async () => {
    const response = await request(app)
      .get('/api/student/exams')
      .set('Authorization', studentAAuthorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: newerTieExam.id,
        title: newerTieExam.title,
        description: newerTieExam.description,
        published_at: publicationTimes.newer,
        exam_type: { id: examType.id, name: examType.name },
        question_count: 1,
        total_points: 7,
        has_submitted: false,
      },
      {
        id: detailedExam.id,
        title: detailedExam.title,
        description: detailedExam.description,
        published_at: publicationTimes.newer,
        exam_type: { id: examType.id, name: examType.name },
        question_count: 3,
        total_points: 12,
        has_submitted: true,
      },
      {
        id: olderExam.id,
        title: olderExam.title,
        description: null,
        published_at: publicationTimes.older,
        exam_type: { id: examType.id, name: examType.name },
        question_count: 0,
        total_points: 0,
        has_submitted: false,
      },
    ]);
    expect(response.body.map((exam) => exam.id)).not.toContain(draftExam.id);

    for (const exam of response.body) {
      expect(Object.keys(exam).sort()).toEqual([
        'description',
        'exam_type',
        'has_submitted',
        'id',
        'published_at',
        'question_count',
        'title',
        'total_points',
      ]);
      expect(Object.keys(exam.exam_type).sort()).toEqual(['id', 'name']);
      expect(Number.isInteger(exam.question_count)).toBe(true);
      expect(Number.isInteger(exam.total_points)).toBe(true);
      expect(typeof exam.has_submitted).toBe('boolean');
    }
  });

  test('computes has_submitted for only the authenticated student', async () => {
    const [studentAResponse, studentBResponse] = await Promise.all([
      request(app)
        .get('/api/student/exams')
        .set('Authorization', studentAAuthorization),
      request(app)
        .get('/api/student/exams')
        .set('Authorization', studentBAuthorization),
    ]);
    const studentADetail = studentAResponse.body.find(({ id }) => id === detailedExam.id);
    const studentBDetail = studentBResponse.body.find(({ id }) => id === detailedExam.id);

    expect(studentADetail.has_submitted).toBe(true);
    expect(studentBDetail.has_submitted).toBe(false);
  });
});

describe('published student exam detail', () => {
  test('returns ordered questions and options through the exact safe projection', async () => {
    const response = await request(app)
      .get(`/api/student/exams/${detailedExam.id}`)
      .set('Authorization', studentAAuthorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: detailedExam.id,
      title: detailedExam.title,
      description: detailedExam.description,
      published_at: publicationTimes.newer,
      exam_type: { id: examType.id, name: examType.name },
      question_count: 3,
      total_points: 12,
      has_submitted: true,
      questions: [
        {
          id: shortAnswerQuestion.id,
          question_type: 'short_answer',
          prompt: shortAnswerQuestion.text,
          points: 4,
          position: 1,
        },
        {
          id: multipleChoiceQuestion.id,
          question_type: 'multiple_choice',
          prompt: multipleChoiceQuestion.text,
          points: 5,
          position: 2,
          options: [
            { id: firstOption.id, text: firstOption.text, position: 1 },
            { id: secondOption.id, text: secondOption.text, position: 2 },
          ],
        },
        {
          id: trueFalseQuestion.id,
          question_type: 'true_false',
          prompt: trueFalseQuestion.text,
          points: 3,
          position: 3,
        },
      ],
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'description',
      'exam_type',
      'has_submitted',
      'id',
      'published_at',
      'question_count',
      'questions',
      'title',
      'total_points',
    ]);
  });

  test('never exposes answer-key fields anywhere in the serialized response', async () => {
    const response = await request(app)
      .get(`/api/student/exams/${detailedExam.id}`)
      .set('Authorization', studentAAuthorization);
    const keys = collectKeys(response.body);

    expect(keys).not.toContain('correct_answer');
    expect(keys).not.toContain('reference_answer');
    expect(keys).not.toContain('is_correct');
    expect(response.body.questions[0]).not.toHaveProperty('options');
    expect(response.body.questions[2]).not.toHaveProperty('options');
    expect(Object.keys(response.body.questions[1].options[0]).sort()).toEqual([
      'id',
      'position',
      'text',
    ]);
  });

  test('returns the same safe not-found response for hidden and missing exams', async () => {
    const hidden = await request(app)
      .get(`/api/student/exams/${draftExam.id}`)
      .set('Authorization', studentAAuthorization);
    const missing = await request(app)
      .get('/api/student/exams/2147483647')
      .set('Authorization', studentAAuthorization);

    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(hidden.body).toEqual({ error: 'Exam not found.' });
    expect(missing.body).toEqual(hidden.body);
  });

  test.each(['0', '-1', '1.5', 'not-a-number', '9007199254740992'])(
    'rejects invalid exam ID %s',
    async (invalidId) => {
      const response = await request(app)
        .get(`/api/student/exams/${invalidId}`)
        .set('Authorization', studentAAuthorization);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Exam ID must be a positive integer.',
      });
    },
  );

  test('does not create submissions or answers or change has_submitted while reading', async () => {
    const before = await pool.query(
      `SELECT
         (SELECT COUNT(*)::INTEGER
          FROM exam_submissions
          WHERE exam_id = ANY($1::int[])) AS submissions,
         (SELECT COUNT(*)::INTEGER
          FROM submission_answers
          WHERE exam_id = ANY($1::int[])) AS answers`,
      [createdExamIds],
    );

    const listResponse = await request(app)
      .get('/api/student/exams')
      .set('Authorization', studentBAuthorization);
    const detailResponse = await request(app)
      .get(`/api/student/exams/${detailedExam.id}`)
      .set('Authorization', studentBAuthorization);
    const after = await pool.query(
      `SELECT
         (SELECT COUNT(*)::INTEGER
          FROM exam_submissions
          WHERE exam_id = ANY($1::int[])) AS submissions,
         (SELECT COUNT(*)::INTEGER
          FROM submission_answers
          WHERE exam_id = ANY($1::int[])) AS answers`,
      [createdExamIds],
    );

    expect(before.rows[0]).toEqual({ submissions: 1, answers: 0 });
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(listResponse.body.find(({ id }) => id === detailedExam.id).has_submitted)
      .toBe(false);
    expect(detailResponse.body.has_submitted).toBe(false);
  });
});
