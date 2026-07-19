import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  loadTestApplication,
  runPrefix,
  username,
} from './testDatabase.js';

const password = 'Test-only password 42!';
const bearer = (token) => `Bearer ${token}`;
const createdExamIds = [];
const createdExamTypeIds = [];
const submittedAt = '2026-07-10T09:00:00.000Z';
const completedAt = '2026-07-11T09:00:00.000Z';
const publishedAt = '2026-07-12T09:00:00.000Z';

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
let mainExam;
let noSubmissionExam;
let ungradedExam;
let inProgressExam;
let completedUnpublishedExam;
let draftExam;
let mainSubmission;
let mcqQuestion;
let trueFalseQuestion;
let answeredShortQuestion;
let unansweredShortQuestion;
let selectedOption;
let correctOption;

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

const insertExam = async (title, { status = 'published' } = {}) => {
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
      status === 'published' ? '2026-07-01T09:00:00.000Z' : null,
    ],
  );

  createdExamIds.push(result.rows[0].id);
  return result.rows[0];
};

const insertQuestion = async ({ examId, type, prompt, position, correctAnswer = null }) => {
  const result = await pool.query(
    `INSERT INTO questions (exam_id, type, text, points, position, correct_answer)
     VALUES ($1, $2, $3, 1, $4, $5)
     RETURNING id, type, text, position`,
    [examId, type, prompt, position, correctAnswer],
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

const insertSubmission = async ({
  examId,
  studentId,
  state = 'ungraded',
  totalScore = null,
  publish = false,
}) => {
  const result = await pool.query(
    `INSERT INTO exam_submissions (
       exam_id,
       student_id,
       submitted_at,
       grading_state,
       total_score,
       graded_by,
       grading_completed_at,
       result_published_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, submitted_at, result_published_at`,
    [
      examId,
      studentId,
      submittedAt,
      state,
      totalScore,
      state === 'completed' ? lecturer.id : null,
      state === 'completed' ? completedAt : null,
      publish ? publishedAt : null,
    ],
  );

  return result.rows[0];
};

const insertAnswer = async ({
  submissionId,
  examId,
  questionId,
  selectedOptionId = null,
  booleanAnswer = null,
  textAnswer = null,
  awardedPoints = null,
  feedback = null,
}) => {
  await pool.query(
    `INSERT INTO submission_answers (
       submission_id,
       exam_id,
       question_id,
       selected_option_id,
       boolean_answer,
       text_answer,
       awarded_points,
       lecturer_feedback
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      submissionId,
      examId,
      questionId,
      selectedOptionId,
      booleanAnswer,
      textAnswer,
      awardedPoints,
      feedback,
    ],
  );
};

const createSingleQuestionFixture = async (exam, state, { publish = false } = {}) => {
  const question = await insertQuestion({
    examId: exam.id,
    type: 'true_false',
    prompt: `${exam.title} question`,
    position: 1,
    correctAnswer: 'true',
  });
  const submission = await insertSubmission({
    examId: exam.id,
    studentId: studentA.id,
    state,
    totalScore: state === 'completed' ? 1 : null,
    publish,
  });
  await insertAnswer({
    submissionId: submission.id,
    examId: exam.id,
    questionId: question.id,
    booleanAnswer: true,
    awardedPoints: state === 'ungraded' ? null : 1,
  });
  return submission;
};

const collectKeys = (value, keys = []) => {
  if (value === null || typeof value !== 'object') {
    return keys;
  }

  for (const [key, nested] of Object.entries(value)) {
    keys.push(key);
    collectKeys(nested, keys);
  }

  return keys;
};

const resultPath = (examId = mainExam.id) => `/api/student/exams/${examId}/result`;

beforeAll(async () => {
  ({ app, pool } = await loadTestApplication());
  [authService, userRepository] = await Promise.all([
    import('../services/authService.js'),
    import('../repositories/userRepository.js'),
  ]);

  const normalizedUsername = authService.normalizeAndValidateUsername(
    username('student_result_lecturer'),
  );
  const validatedPassword = authService.validatePassword(password);
  const passwordHash = await authService.hashPassword(validatedPassword);
  lecturer = await userRepository.upsertLecturer({
    username: normalizedUsername,
    passwordHash,
  });
  lecturerAuthorization = await login(lecturer.username);

  const registeredStudents = await Promise.all([
    registerStudent('student_result_a'),
    registerStudent('student_result_b'),
  ]);
  studentA = registeredStudents[0].user;
  studentB = registeredStudents[1].user;
  studentAAuthorization = registeredStudents[0].authorization;
  studentBAuthorization = registeredStudents[1].authorization;

  const typeResult = await pool.query(
    `INSERT INTO exam_types (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [`${runPrefix}_student_result_type`, 'Student result test type.', lecturer.id],
  );
  examType = typeResult.rows[0];
  createdExamTypeIds.push(examType.id);

  mainExam = await insertExam(`${runPrefix} published result`);
  noSubmissionExam = await insertExam(`${runPrefix} no submission`);
  ungradedExam = await insertExam(`${runPrefix} ungraded result`);
  inProgressExam = await insertExam(`${runPrefix} in progress result`);
  completedUnpublishedExam = await insertExam(`${runPrefix} unpublished result`);
  draftExam = await insertExam(`${runPrefix} draft result`, { status: 'draft' });

  mcqQuestion = await insertQuestion({
    examId: mainExam.id,
    type: 'multiple_choice',
    prompt: 'Choose the correct option.',
    position: 20,
  });
  trueFalseQuestion = await insertQuestion({
    examId: mainExam.id,
    type: 'true_false',
    prompt: 'False is the correct answer.',
    position: 30,
    correctAnswer: 'false',
  });
  answeredShortQuestion = await insertQuestion({
    examId: mainExam.id,
    type: 'short_answer',
    prompt: 'Give a short explanation.',
    position: 10,
    correctAnswer: 'Reference explanation',
  });
  unansweredShortQuestion = await insertQuestion({
    examId: mainExam.id,
    type: 'short_answer',
    prompt: 'Leave this unanswered.',
    position: 40,
    correctAnswer: 'Second reference answer',
  });

  correctOption = await insertOption({
    questionId: mcqQuestion.id,
    text: 'Correct option',
    position: 2,
    isCorrect: true,
  });
  selectedOption = await insertOption({
    questionId: mcqQuestion.id,
    text: 'Selected distractor',
    position: 1,
    isCorrect: false,
  });

  mainSubmission = await insertSubmission({
    examId: mainExam.id,
    studentId: studentA.id,
    state: 'completed',
    totalScore: 1.5,
    publish: true,
  });
  await insertAnswer({
    submissionId: mainSubmission.id,
    examId: mainExam.id,
    questionId: answeredShortQuestion.id,
    textAnswer: 'Student explanation',
    awardedPoints: 0.5,
    feedback: 'Useful partial explanation.',
  });
  await insertAnswer({
    submissionId: mainSubmission.id,
    examId: mainExam.id,
    questionId: mcqQuestion.id,
    selectedOptionId: selectedOption.id,
    awardedPoints: 0,
    feedback: 'Review the options.',
  });
  await insertAnswer({
    submissionId: mainSubmission.id,
    examId: mainExam.id,
    questionId: trueFalseQuestion.id,
    booleanAnswer: false,
    awardedPoints: 1,
  });
  await insertAnswer({
    submissionId: mainSubmission.id,
    examId: mainExam.id,
    questionId: unansweredShortQuestion.id,
    awardedPoints: 0,
  });

  const studentBSubmission = await insertSubmission({
    examId: mainExam.id,
    studentId: studentB.id,
  });
  for (const question of [
    answeredShortQuestion,
    mcqQuestion,
    trueFalseQuestion,
    unansweredShortQuestion,
  ]) {
    await insertAnswer({
      submissionId: studentBSubmission.id,
      examId: mainExam.id,
      questionId: question.id,
    });
  }

  await insertQuestion({
    examId: noSubmissionExam.id,
    type: 'true_false',
    prompt: 'No submission question',
    position: 1,
    correctAnswer: 'true',
  });
  await createSingleQuestionFixture(ungradedExam, 'ungraded');
  await createSingleQuestionFixture(inProgressExam, 'in_progress');
  await createSingleQuestionFixture(completedUnpublishedExam, 'completed');
  await createSingleQuestionFixture(draftExam, 'completed', { publish: true });
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
      await pool.query(
        'DELETE FROM users WHERE LEFT(username, LENGTH($1)) = $1',
        [`${runPrefix}_`],
      );
    } finally {
      await pool.end();
    }
  }
});

describe('student catalog result availability', () => {
  test('reveals only Boolean availability for the authenticated student', async () => {
    const response = await request(app)
      .get('/api/student/exams')
      .set('Authorization', studentAAuthorization);

    expect(response.status).toBe(200);
    const byId = new Map(response.body.map((exam) => [exam.id, exam]));
    expect(byId.get(noSubmissionExam.id).result_available).toBe(false);
    expect(byId.get(ungradedExam.id).result_available).toBe(false);
    expect(byId.get(inProgressExam.id).result_available).toBe(false);
    expect(byId.get(completedUnpublishedExam.id).result_available).toBe(false);
    expect(byId.get(mainExam.id).result_available).toBe(true);

    const forbiddenKeys = [
      'score',
      'total_score',
      'maximum_score',
      'percentage',
      'feedback',
      'lecturer_feedback',
      'awarded_points',
      'grading_state',
      'graded_by',
      'grading_lecturer_username',
      'grading_completed_at',
      'result_published_at',
      'correct_answer',
      'reference_answer',
      'is_correct',
    ];
    const keys = collectKeys(response.body);
    for (const key of forbiddenKeys) {
      expect(keys).not.toContain(key);
    }
    expect(response.body.every((exam) => typeof exam.result_available === 'boolean'))
      .toBe(true);
  });

  test('does not expose another student result availability', async () => {
    const response = await request(app)
      .get('/api/student/exams')
      .set('Authorization', studentBAuthorization);
    const mainCatalogExam = response.body.find((exam) => exam.id === mainExam.id);

    expect(response.status).toBe(200);
    expect(mainCatalogExam.has_submitted).toBe(true);
    expect(mainCatalogExam.result_available).toBe(false);
  });
});

describe('published student result', () => {
  test('converts PostgreSQL NUMERIC values and applies approved score precision', async () => {
    const [storedSubmission, storedAnswer] = await Promise.all([
      pool.query(
        `SELECT total_score, PG_TYPEOF(total_score)::TEXT AS value_type
         FROM exam_submissions
         WHERE id = $1`,
        [mainSubmission.id],
      ),
      pool.query(
        `SELECT awarded_points, PG_TYPEOF(awarded_points)::TEXT AS value_type
         FROM submission_answers
         WHERE submission_id = $1 AND question_id = $2`,
        [mainSubmission.id, answeredShortQuestion.id],
      ),
    ]);

    expect(storedSubmission.rows[0]).toEqual({
      total_score: '1.5',
      value_type: 'numeric',
    });
    expect(storedAnswer.rows[0]).toEqual({
      awarded_points: '0.5',
      value_type: 'numeric',
    });

    try {
      await pool.query(
        `UPDATE submission_answers
         SET awarded_points = 0.33335
         WHERE submission_id = $1 AND question_id = $2`,
        [mainSubmission.id, answeredShortQuestion.id],
      );
      await pool.query(
        `UPDATE exam_submissions
         SET total_score = 1.3334
         WHERE id = $1`,
        [mainSubmission.id],
      );

      const response = await request(app)
        .get(resultPath())
        .set('Authorization', studentAAuthorization);
      const answeredShort = response.body.questions.find(
        (question) => question.id === answeredShortQuestion.id,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        total_score: 1.3334,
        maximum_score: 4,
        percentage: 33.34,
      });
      expect(answeredShort.awarded_points).toBe(0.33335);
      expect(typeof response.body.total_score).toBe('number');
      expect(typeof response.body.percentage).toBe('number');
      expect(typeof answeredShort.awarded_points).toBe('number');
    } finally {
      await pool.query(
        `UPDATE submission_answers
         SET awarded_points = 0.5
         WHERE submission_id = $1 AND question_id = $2`,
        [mainSubmission.id, answeredShortQuestion.id],
      );
      await pool.query(
        `UPDATE exam_submissions
         SET total_score = 1.5
         WHERE id = $1`,
        [mainSubmission.id],
      );
    }
  });

  test('returns the owning student ordered answers, keys, marks, and feedback', async () => {
    const response = await request(app)
      .get(resultPath())
      .set('Authorization', studentAAuthorization);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'exam_id',
      'exam_title',
      'maximum_score',
      'percentage',
      'questions',
      'result_published_at',
      'submission_id',
      'submitted_at',
      'total_score',
    ]);
    expect(response.body).toMatchObject({
      exam_id: mainExam.id,
      exam_title: mainExam.title,
      submission_id: mainSubmission.id,
      submitted_at: submittedAt,
      result_published_at: publishedAt,
      total_score: 1.5,
      maximum_score: 4,
      percentage: 37.5,
    });
    expect(typeof response.body.total_score).toBe('number');
    expect(typeof response.body.maximum_score).toBe('number');
    expect(typeof response.body.percentage).toBe('number');
    expect(response.body.questions.map((question) => question.id)).toEqual([
      answeredShortQuestion.id,
      mcqQuestion.id,
      trueFalseQuestion.id,
      unansweredShortQuestion.id,
    ]);

    const [answeredShort, mcq, trueFalse, unansweredShort] = response.body.questions;
    expect(new Set(response.body.questions.map((question) => question.id)).size).toBe(4);
    expect(new Set(response.body.questions.map((question) => question.position)).size).toBe(4);
    expect(response.body.questions.every((question) => (
      Number.isInteger(question.id)
      && question.id > 0
      && Number.isInteger(question.position)
      && question.position > 0
      && question.maximum_points === 1
      && typeof question.awarded_points === 'number'
    ))).toBe(true);
    expect(Object.keys(answeredShort).sort()).toEqual([
      'awarded_points',
      'feedback',
      'id',
      'is_unanswered',
      'maximum_points',
      'position',
      'prompt',
      'question_type',
      'reference_answer',
      'text_answer',
    ]);
    expect(Object.keys(mcq).sort()).toEqual([
      'awarded_points',
      'correct_option_id',
      'feedback',
      'id',
      'is_unanswered',
      'maximum_points',
      'options',
      'position',
      'prompt',
      'question_type',
      'selected_option_id',
    ]);
    expect(Object.keys(trueFalse).sort()).toEqual([
      'awarded_points',
      'boolean_answer',
      'correct_answer',
      'feedback',
      'id',
      'is_unanswered',
      'maximum_points',
      'position',
      'prompt',
      'question_type',
    ]);
    expect(answeredShort).toMatchObject({
      text_answer: 'Student explanation',
      reference_answer: 'Reference explanation',
      is_unanswered: false,
      awarded_points: 0.5,
      maximum_points: 1,
      feedback: 'Useful partial explanation.',
    });
    expect(mcq).toMatchObject({
      selected_option_id: selectedOption.id,
      correct_option_id: correctOption.id,
      is_unanswered: false,
      awarded_points: 0,
      feedback: 'Review the options.',
    });
    expect(mcq.options).toEqual([
      { id: selectedOption.id, text: 'Selected distractor', position: 1 },
      { id: correctOption.id, text: 'Correct option', position: 2 },
    ]);
    expect(mcq.options.every((option) => (
      Object.keys(option).sort().join(',') === 'id,position,text'
    ))).toBe(true);
    expect(trueFalse).toMatchObject({
      boolean_answer: false,
      correct_answer: false,
      is_unanswered: false,
      awarded_points: 1,
      feedback: null,
    });
    expect(unansweredShort).toMatchObject({
      text_answer: null,
      reference_answer: 'Second reference answer',
      is_unanswered: true,
      awarded_points: 0,
      feedback: null,
    });

    const keys = collectKeys(response.body);
    expect(keys).not.toContain('student_id');
    expect(keys).not.toContain('student_username');
    expect(keys).not.toContain('graded_by');
    expect(keys).not.toContain('grading_state');
    expect(keys).not.toContain('grading_completed_at');
    expect(keys).not.toContain('is_correct');
  });

  test('keeps ordinary exam detail free of answer keys and grading data', async () => {
    const response = await request(app)
      .get(`/api/student/exams/${mainExam.id}`)
      .set('Authorization', studentAAuthorization);
    const keys = collectKeys(response.body);

    expect(response.status).toBe(200);
    for (const key of [
      'correct_answer',
      'reference_answer',
      'is_correct',
      'awarded_points',
      'feedback',
      'lecturer_feedback',
      'total_score',
      'maximum_score',
      'percentage',
      'grading_state',
      'graded_by',
      'grading_completed_at',
      'result_published_at',
      'result_available',
    ]) {
      expect(keys).not.toContain(key);
    }
  });
});

describe('student result isolation and hidden states', () => {
  test('requires authentication and forbids lecturers', async () => {
    const unauthenticated = await request(app).get(resultPath());
    const lecturerResponse = await request(app)
      .get(resultPath())
      .set('Authorization', lecturerAuthorization);

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toEqual({ error: 'Authentication required.' });
    expect(lecturerResponse.status).toBe(403);
    expect(lecturerResponse.body).toEqual({ error: 'Access forbidden.' });
  });

  test.each([
    [
      "another student's result when both students submitted the exam",
      () => mainExam.id,
      () => studentBAuthorization,
    ],
    ['an exam with no submission', () => noSubmissionExam.id],
    ['an ungraded submission', () => ungradedExam.id],
    ['an in-progress submission', () => inProgressExam.id],
    ['a completed but unpublished submission', () => completedUnpublishedExam.id],
    ['a draft exam', () => draftExam.id],
    ['a nonexistent exam', () => 2147483647],
  ])('returns the same safe 404 for %s', async (_label, readExamId, readAuthorization) => {
    const response = await request(app)
      .get(resultPath(readExamId()))
      .set(
        'Authorization',
        readAuthorization ? readAuthorization() : studentAAuthorization,
      );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Result not found.' });
  });

  test.each(['0', '-1', '1.5', 'not-a-number', '2147483648'])(
    'rejects invalid exam ID %s',
    async (invalidId) => {
      const response = await request(app)
        .get(resultPath(invalidId))
        .set('Authorization', studentAAuthorization);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Exam ID must be a positive integer.',
      });
    },
  );

  test('rejects inconsistent stored grading safely', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await pool.query(
        `UPDATE submission_answers
         SET awarded_points = 1
         WHERE submission_id = $1 AND question_id = $2`,
        [mainSubmission.id, mcqQuestion.id],
      );

      const response = await request(app)
        .get(resultPath())
        .set('Authorization', studentAAuthorization);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error.' });
      expect(JSON.stringify(response.body)).not.toContain('multiple-choice');
    } finally {
      await pool.query(
        `UPDATE submission_answers
         SET awarded_points = 0
         WHERE submission_id = $1 AND question_id = $2`,
        [mainSubmission.id, mcqQuestion.id],
      );
      consoleError.mockRestore();
    }
  });

  test.each([
    ['a non-finite total', 'NaN'],
    ['an over-maximum total', '5'],
  ])('rejects %s without leaking persistence details', async (_label, storedValue) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await pool.query(
        `UPDATE exam_submissions
         SET total_score = $2::NUMERIC
         WHERE id = $1`,
        [mainSubmission.id, storedValue],
      );

      const response = await request(app)
        .get(resultPath())
        .set('Authorization', studentAAuthorization);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error.' });
      expect(JSON.stringify(response.body)).not.toMatch(/SELECT|UPDATE|NUMERIC|stack/i);
    } finally {
      await pool.query(
        `UPDATE exam_submissions
         SET total_score = 1.5
         WHERE id = $1`,
        [mainSubmission.id],
      );
      consoleError.mockRestore();
    }
  });
});
