import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  loadTestApplication,
  runPrefix,
  username,
} from './testDatabase.js';

const password = 'Test-only password 42!';
const bearer = (token) => `Bearer ${token}`;
const createdExamIds = [];
const createdExamTypeIds = [];

let app;
let pool;
let authService;
let userRepository;
let lecturerA;
let lecturerB;
let studentA;
let studentB;
let lecturerAAuthorization;
let lecturerBAuthorization;
let studentAAuthorization;
let examType;
let mainExam;
let objectiveExam;
let foreignExam;
let mainSubmission;
let objectiveSubmission;
let foreignSubmission;
let mcqCorrect;
let mcqIncorrect;
let mcqUnanswered;
let trueFalseCorrectFalse;
let trueFalseIncorrect;
let shortAnswered;
let shortUnanswered;
let foreignQuestion;
let correctOption;
let incorrectOption;
let incorrectQuestionCorrectOption;
let incorrectQuestionSelectedOption;

const seedLecturer = async (label) => {
  const normalizedUsername = authService.normalizeAndValidateUsername(username(label));
  const validatedPassword = authService.validatePassword(password);
  const passwordHash = await authService.hashPassword(validatedPassword);
  return userRepository.upsertLecturer({
    username: normalizedUsername,
    passwordHash,
  });
};

const login = async (loginUsername) => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username: loginUsername, password });

  expect(response.status).toBe(200);
  return bearer(response.body.token);
};

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

const insertExam = async (lecturerId, title) => {
  const result = await pool.query(
    `INSERT INTO exams (
       lecturer_id,
       exam_type_id,
       title,
       description,
       status,
       published_at
     )
     VALUES ($1, $2, $3, $4, 'published', CURRENT_TIMESTAMP)
     RETURNING id, title`,
    [lecturerId, examType.id, title, `${title} description`],
  );

  createdExamIds.push(result.rows[0].id);
  return result.rows[0];
};

const insertQuestion = async ({
  examId,
  type,
  prompt,
  position,
  correctAnswer = null,
}) => {
  const result = await pool.query(
    `INSERT INTO questions (exam_id, type, text, points, position, correct_answer)
     VALUES ($1, $2, $3, 1, $4, $5)
     RETURNING id, type, position`,
    [examId, type, prompt, position, correctAnswer],
  );

  return result.rows[0];
};

const insertOption = async ({ questionId, text, position, isCorrect }) => {
  const result = await pool.query(
    `INSERT INTO question_options (question_id, text, position, is_correct)
     VALUES ($1, $2, $3, $4)
     RETURNING id, position`,
    [questionId, text, position, isCorrect],
  );

  return result.rows[0];
};

const insertSubmission = async (examId, studentId, answers) => {
  const submissionResult = await pool.query(
    `INSERT INTO exam_submissions (exam_id, student_id)
     VALUES ($1, $2)
     RETURNING id, submitted_at`,
    [examId, studentId],
  );
  const submission = submissionResult.rows[0];

  for (const answer of answers) {
    await pool.query(
      `INSERT INTO submission_answers (
         submission_id,
         exam_id,
         question_id,
         selected_option_id,
         boolean_answer,
         text_answer
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        submission.id,
        examId,
        answer.questionId,
        answer.selectedOptionId ?? null,
        answer.booleanAnswer ?? null,
        answer.textAnswer ?? null,
      ],
    );
  }

  return submission;
};

const mainQuestionOrder = () => [
  mcqCorrect,
  mcqIncorrect,
  mcqUnanswered,
  trueFalseCorrectFalse,
  trueFalseIncorrect,
  shortAnswered,
  shortUnanswered,
];

const mainSnapshot = ({
  answeredShortMark = 0.75,
  unansweredShortMark = null,
  answeredFeedback = 'Useful partial-credit explanation.',
} = {}) => mainQuestionOrder().map((question) => ({
  questionId: question.id,
  awardedPoints: question.id === shortAnswered.id
    ? answeredShortMark
    : question.id === shortUnanswered.id
      ? unansweredShortMark
      : null,
  feedback: question.id === shortAnswered.id
    ? answeredFeedback
    : question.id === mcqIncorrect.id
      ? '   '
      : null,
}));

const gradingPath = (
  examId = mainExam.id,
  submissionId = mainSubmission.id,
) => `/api/exams/${examId}/submissions/${submissionId}/grading`;

const publicationPath = (
  examId = mainExam.id,
  submissionId = mainSubmission.id,
) => `/api/exams/${examId}/submissions/${submissionId}/result/publish`;

const saveMainDraft = (snapshot = mainSnapshot()) => request(app)
  .put(gradingPath())
  .set('Authorization', lecturerAAuthorization)
  .send({ answers: snapshot });

const completeMain = () => request(app)
  .post(`${gradingPath()}/complete`)
  .set('Authorization', lecturerAAuthorization);

const publishMain = () => request(app)
  .post(publicationPath())
  .set('Authorization', lecturerAAuthorization);

const completeMainWithDraft = async (snapshot = mainSnapshot()) => {
  const draft = await saveMainDraft(snapshot);
  expect(draft.status).toBe(200);
  return completeMain();
};

const readPersistedGrading = async (submissionId = mainSubmission.id) => {
  const [submission, answers] = await Promise.all([
    pool.query(
      `SELECT
         grading_state,
         total_score,
         graded_by,
         grading_completed_at,
         result_published_at
       FROM exam_submissions
       WHERE id = $1`,
      [submissionId],
    ),
    pool.query(
      `SELECT
         question_id,
         selected_option_id,
         boolean_answer,
         text_answer,
         awarded_points,
         lecturer_feedback
       FROM submission_answers
       WHERE submission_id = $1
       ORDER BY question_id`,
      [submissionId],
    ),
  ]);

  return {
    submission: submission.rows[0],
    answers: answers.rows,
  };
};

const expectMainGradingUntouched = async () => {
  const persisted = await readPersistedGrading();
  expect(persisted.submission).toMatchObject({
    grading_state: 'ungraded',
    total_score: null,
    graded_by: null,
    grading_completed_at: null,
    result_published_at: null,
  });
  expect(persisted.answers.every((answer) => (
    answer.awarded_points === null && answer.lecturer_feedback === null
  ))).toBe(true);
};

beforeAll(async () => {
  ({ app, pool } = await loadTestApplication());
  [authService, userRepository] = await Promise.all([
    import('../services/authService.js'),
    import('../repositories/userRepository.js'),
  ]);

  [lecturerA, lecturerB] = await Promise.all([
    seedLecturer('grading_lecturer_a'),
    seedLecturer('grading_lecturer_b'),
  ]);
  [lecturerAAuthorization, lecturerBAuthorization] = await Promise.all([
    login(lecturerA.username),
    login(lecturerB.username),
  ]);
  const registeredStudents = await Promise.all([
    registerStudent('grading_student_a'),
    registerStudent('grading_student_b'),
  ]);
  studentA = registeredStudents[0].user;
  studentB = registeredStudents[1].user;
  studentAAuthorization = registeredStudents[0].authorization;

  const typeResult = await pool.query(
    `INSERT INTO exam_types (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `${runPrefix}_grading_type`,
      'Test-only lecturer grading type.',
      lecturerA.id,
    ],
  );
  examType = typeResult.rows[0];
  createdExamTypeIds.push(examType.id);

  mainExam = await insertExam(lecturerA.id, `${runPrefix} grading main`);
  objectiveExam = await insertExam(lecturerA.id, `${runPrefix} grading objective`);
  foreignExam = await insertExam(lecturerB.id, `${runPrefix} grading foreign`);

  mcqCorrect = await insertQuestion({
    examId: mainExam.id,
    type: 'multiple_choice',
    prompt: 'Correct multiple choice',
    position: 10,
  });
  mcqIncorrect = await insertQuestion({
    examId: mainExam.id,
    type: 'multiple_choice',
    prompt: 'Incorrect multiple choice',
    position: 20,
  });
  mcqUnanswered = await insertQuestion({
    examId: mainExam.id,
    type: 'multiple_choice',
    prompt: 'Unanswered multiple choice',
    position: 30,
  });
  trueFalseCorrectFalse = await insertQuestion({
    examId: mainExam.id,
    type: 'true_false',
    prompt: 'False is correct',
    position: 40,
    correctAnswer: 'false',
  });
  trueFalseIncorrect = await insertQuestion({
    examId: mainExam.id,
    type: 'true_false',
    prompt: 'True is correct',
    position: 50,
    correctAnswer: 'true',
  });
  shortAnswered = await insertQuestion({
    examId: mainExam.id,
    type: 'short_answer',
    prompt: 'Answered short answer',
    position: 60,
    correctAnswer: 'Lecturer reference answer',
  });
  shortUnanswered = await insertQuestion({
    examId: mainExam.id,
    type: 'short_answer',
    prompt: 'Unanswered short answer',
    position: 70,
    correctAnswer: 'Second lecturer reference',
  });

  correctOption = await insertOption({
    questionId: mcqCorrect.id,
    text: 'Correct selected option',
    position: 1,
    isCorrect: true,
  });
  incorrectOption = await insertOption({
    questionId: mcqCorrect.id,
    text: 'Incorrect option',
    position: 2,
    isCorrect: false,
  });
  incorrectQuestionCorrectOption = await insertOption({
    questionId: mcqIncorrect.id,
    text: 'Unselected correct option',
    position: 1,
    isCorrect: true,
  });
  incorrectQuestionSelectedOption = await insertOption({
    questionId: mcqIncorrect.id,
    text: 'Selected distractor',
    position: 2,
    isCorrect: false,
  });
  await insertOption({
    questionId: mcqUnanswered.id,
    text: 'Unanswered correct option',
    position: 1,
    isCorrect: true,
  });
  await insertOption({
    questionId: mcqUnanswered.id,
    text: 'Unanswered distractor',
    position: 2,
    isCorrect: false,
  });

  const objectiveMcq = await insertQuestion({
    examId: objectiveExam.id,
    type: 'multiple_choice',
    prompt: 'Objective exam multiple choice',
    position: 1,
  });
  const objectiveTrueFalse = await insertQuestion({
    examId: objectiveExam.id,
    type: 'true_false',
    prompt: 'Objective exam false answer',
    position: 2,
    correctAnswer: 'false',
  });
  const objectiveCorrectOption = await insertOption({
    questionId: objectiveMcq.id,
    text: 'Objective correct option',
    position: 1,
    isCorrect: true,
  });
  await insertOption({
    questionId: objectiveMcq.id,
    text: 'Objective distractor',
    position: 2,
    isCorrect: false,
  });

  foreignQuestion = await insertQuestion({
    examId: foreignExam.id,
    type: 'true_false',
    prompt: 'Foreign true-false question',
    position: 1,
    correctAnswer: 'true',
  });

  mainSubmission = await insertSubmission(mainExam.id, studentA.id, [
    { questionId: mcqCorrect.id, selectedOptionId: correctOption.id },
    {
      questionId: mcqIncorrect.id,
      selectedOptionId: incorrectQuestionSelectedOption.id,
    },
    { questionId: mcqUnanswered.id },
    { questionId: trueFalseCorrectFalse.id, booleanAnswer: false },
    { questionId: trueFalseIncorrect.id, booleanAnswer: false },
    { questionId: shortAnswered.id, textAnswer: 'Student short response' },
    { questionId: shortUnanswered.id },
  ]);
  objectiveSubmission = await insertSubmission(objectiveExam.id, studentB.id, [
    { questionId: objectiveMcq.id, selectedOptionId: objectiveCorrectOption.id },
    { questionId: objectiveTrueFalse.id, booleanAnswer: false },
  ]);
  foreignSubmission = await insertSubmission(foreignExam.id, studentA.id, [
    { questionId: foreignQuestion.id, booleanAnswer: true },
  ]);
});

beforeEach(async () => {
  await pool.query(
    `UPDATE exam_submissions
     SET grading_state = 'ungraded',
         total_score = NULL,
         graded_by = NULL,
         grading_completed_at = NULL,
         result_published_at = NULL
     WHERE exam_id = ANY($1::int[])`,
    [createdExamIds],
  );
  await pool.query(
    `UPDATE submission_answers
     SET awarded_points = NULL, lecturer_feedback = NULL
     WHERE exam_id = ANY($1::int[])`,
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
      await pool.query(
        'DELETE FROM users WHERE LEFT(username, LENGTH($1)) = $1',
        [`${runPrefix}_`],
      );
    } finally {
      await pool.end();
    }
  }
});

describe('lecturer submission list and detail', () => {
  test('requires authentication for every lecturer grading endpoint', async () => {
    const basePath = `/api/exams/${mainExam.id}/submissions`;
    const detailPath = `${basePath}/${mainSubmission.id}`;
    const responses = [
      await request(app).get(basePath),
      await request(app).get(detailPath),
      await request(app).put(`${detailPath}/grading`).send({ answers: [] }),
      await request(app).post(`${detailPath}/grading/complete`),
      await request(app).post(`${detailPath}/grading/reopen`),
      await request(app).post(`${detailPath}/result/publish`),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required.' });
    }
  });

  test('lists owned-exam submissions with identity and ungraded summary', async () => {
    const response = await request(app)
      .get(`/api/exams/${mainExam.id}/submissions`)
      .set('Authorization', lecturerAAuthorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: mainSubmission.id,
        exam_id: mainExam.id,
        student_id: studentA.id,
        student_username: studentA.username,
        grading_state: 'ungraded',
        total_score: null,
        maximum_score: 7,
        percentage: null,
        grading_completed_at: null,
        result_published_at: null,
      }),
    ]);
  });

  test('returns ordered mixed-question detail with lecturer-only answer keys', async () => {
    const response = await request(app)
      .get(`/api/exams/${mainExam.id}/submissions/${mainSubmission.id}`)
      .set('Authorization', lecturerAAuthorization);

    expect(response.status).toBe(200);
    expect(response.body.student).toEqual({
      id: studentA.id,
      username: studentA.username,
    });
    expect(response.body.questions.map((question) => question.id)).toEqual(
      mainQuestionOrder().map((question) => question.id),
    );

    const byId = new Map(response.body.questions.map((question) => [question.id, question]));
    expect(byId.get(mcqCorrect.id)).toMatchObject({
      grading_mode: 'automatic',
      is_unanswered: false,
      selected_option_id: correctOption.id,
      correct_option_id: correctOption.id,
      awarded_points: 1,
    });
    expect(byId.get(mcqCorrect.id).options.map((option) => option.id)).toEqual([
      correctOption.id,
      incorrectOption.id,
    ]);
    expect(byId.get(mcqIncorrect.id)).toMatchObject({
      selected_option_id: incorrectQuestionSelectedOption.id,
      correct_option_id: incorrectQuestionCorrectOption.id,
      awarded_points: 0,
    });
    expect(byId.get(mcqUnanswered.id)).toMatchObject({
      is_unanswered: true,
      selected_option_id: null,
      awarded_points: 0,
    });
    expect(byId.get(trueFalseCorrectFalse.id)).toMatchObject({
      boolean_answer: false,
      correct_answer: false,
      awarded_points: 1,
    });
    expect(byId.get(trueFalseIncorrect.id)).toMatchObject({
      boolean_answer: false,
      correct_answer: true,
      awarded_points: 0,
    });
    expect(byId.get(shortAnswered.id)).toMatchObject({
      grading_mode: 'manual',
      is_unanswered: false,
      text_answer: 'Student short response',
      reference_answer: 'Lecturer reference answer',
      awarded_points: null,
    });
    expect(byId.get(shortUnanswered.id)).toMatchObject({
      is_unanswered: true,
      text_answer: null,
      reference_answer: 'Second lecturer reference',
      awarded_points: 0,
    });
  });

  test('enforces lecturer role, ownership, and submission membership', async () => {
    const ownerPath = `/api/exams/${mainExam.id}/submissions`;
    const detailPath = `${ownerPath}/${mainSubmission.id}`;
    const studentResponses = [
      await request(app).get(ownerPath).set('Authorization', studentAAuthorization),
      await request(app).get(detailPath).set('Authorization', studentAAuthorization),
    ];

    for (const response of studentResponses) {
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Access forbidden.' });
    }

    const foreignList = await request(app)
      .get(ownerPath)
      .set('Authorization', lecturerBAuthorization);
    const foreignDetail = await request(app)
      .get(detailPath)
      .set('Authorization', lecturerBAuthorization);
    const mismatched = await request(app)
      .get(`/api/exams/${mainExam.id}/submissions/${objectiveSubmission.id}`)
      .set('Authorization', lecturerAAuthorization);

    expect(foreignList.status).toBe(404);
    expect(foreignDetail.status).toBe(404);
    expect(mismatched.status).toBe(404);
    expect(foreignList.body).toEqual({ error: 'Exam not found.' });
    expect(mismatched.body).toEqual({ error: 'Submission not found.' });
  });
});

describe('draft grading snapshots', () => {
  test('saves a full snapshot with trusted objective marks and normalized feedback', async () => {
    const response = await saveMainDraft();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      grading_state: 'in_progress',
      total_score: null,
      percentage: null,
      graded_by: null,
      grading_completed_at: null,
      result_published_at: null,
    });
    const byId = new Map(response.body.questions.map((question) => [question.id, question]));
    expect(byId.get(mcqCorrect.id).awarded_points).toBe(1);
    expect(byId.get(mcqIncorrect.id)).toMatchObject({
      awarded_points: 0,
      feedback: null,
    });
    expect(byId.get(trueFalseCorrectFalse.id).awarded_points).toBe(1);
    expect(byId.get(shortAnswered.id)).toMatchObject({
      awarded_points: 0.75,
      feedback: 'Useful partial-credit explanation.',
    });
    expect(byId.get(shortUnanswered.id).awarded_points).toBe(0);

    const persisted = await readPersistedGrading();
    expect(persisted.submission).toMatchObject({
      grading_state: 'in_progress',
      total_score: null,
      graded_by: null,
      grading_completed_at: null,
      result_published_at: null,
    });
    expect(persisted.answers.find(
      (answer) => answer.question_id === shortUnanswered.id,
    ).awarded_points).toBe('0');
  });

  test('allows an answered short answer to remain ungraded during a draft', async () => {
    const response = await saveMainDraft(mainSnapshot({ answeredShortMark: null }));

    expect(response.status).toBe(200);
    const shortAnswer = response.body.questions.find(
      (question) => question.id === shortAnswered.id,
    );
    expect(shortAnswer.awarded_points).toBeNull();
    expect(response.body.grading_state).toBe('in_progress');
  });

  test('treats omitted and explicit-null objective marks consistently on repeat saves', async () => {
    const omittedObjectiveMarks = mainSnapshot();

    for (const answer of omittedObjectiveMarks) {
      if (![shortAnswered.id, shortUnanswered.id].includes(answer.questionId)) {
        delete answer.awardedPoints;
      }
    }

    const first = await saveMainDraft(omittedObjectiveMarks);
    const second = await saveMainDraft(mainSnapshot({
      answeredShortMark: 0.5,
      answeredFeedback: 'Updated in-progress feedback',
    }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.grading_state).toBe('in_progress');
    expect(second.body.grading_state).toBe('in_progress');
    const firstById = new Map(first.body.questions.map((question) => [question.id, question]));
    const secondById = new Map(second.body.questions.map((question) => [question.id, question]));
    expect(firstById.get(mcqCorrect.id).awarded_points).toBe(1);
    expect(secondById.get(mcqCorrect.id).awarded_points).toBe(1);
    expect(secondById.get(shortAnswered.id)).toMatchObject({
      awarded_points: 0.5,
      feedback: 'Updated in-progress feedback',
    });
  });

  test('rejects client objective marks and nonzero unanswered short-answer marks', async () => {
    const objectiveOverride = mainSnapshot();
    objectiveOverride.find(({ questionId }) => questionId === mcqCorrect.id)
      .awardedPoints = 1;
    const unansweredOverride = mainSnapshot({ unansweredShortMark: 0.25 });

    const objectiveResponse = await saveMainDraft(objectiveOverride);
    const unansweredResponse = await saveMainDraft(unansweredOverride);

    expect(objectiveResponse.status).toBe(400);
    expect(objectiveResponse.body.error).toMatch(/calculated by the server/i);
    expect(unansweredResponse.status).toBe(400);
    expect(unansweredResponse.body.error).toMatch(/unanswered short-answer/i);
    await expectMainGradingUntouched();
  });

  test('rejects duplicate, missing, extra, and foreign question IDs', async () => {
    const valid = mainSnapshot();
    const duplicate = valid.map((answer) => ({ ...answer }));
    duplicate[duplicate.length - 1].questionId = duplicate[0].questionId;
    const cases = [
      duplicate,
      valid.slice(0, -1),
      [...valid, { questionId: foreignQuestion.id, awardedPoints: null }],
      [
        ...valid.slice(0, -1),
        { questionId: foreignQuestion.id, awardedPoints: null },
      ],
    ];

    for (const answers of cases) {
      const response = await saveMainDraft(answers);
      expect(response.status).toBe(400);
    }

    await expectMainGradingUntouched();
  });

  test('rejects invalid marks, malformed feedback, and unsupported fields', async () => {
    const belowZero = mainSnapshot({ answeredShortMark: -0.01 });
    const aboveOne = mainSnapshot({ answeredShortMark: 1.01 });
    const nonNumber = mainSnapshot({ answeredShortMark: '0.5' });
    const malformedFeedback = mainSnapshot();
    malformedFeedback[0].feedback = 42;
    const longFeedback = mainSnapshot({ answeredFeedback: 'x'.repeat(5001) });
    const unsupportedEntry = mainSnapshot();
    unsupportedEntry[0].isCorrect = true;
    const missingQuestionId = mainSnapshot();
    delete missingQuestionId[0].questionId;
    const nonFiniteJson = JSON.stringify({
      answers: mainSnapshot({ answeredShortMark: 0.5 }),
    }).replace('"awardedPoints":0.5', '"awardedPoints":1e400');
    const requests = [
      saveMainDraft(belowZero),
      saveMainDraft(aboveOne),
      saveMainDraft(nonNumber),
      saveMainDraft(malformedFeedback),
      saveMainDraft(longFeedback),
      saveMainDraft(unsupportedEntry),
      saveMainDraft(missingQuestionId),
      request(app)
        .put(gradingPath())
        .set('Authorization', lecturerAAuthorization)
        .send({ answers: [null, ...mainSnapshot().slice(1)] }),
      request(app)
        .put(gradingPath())
        .set('Authorization', lecturerAAuthorization)
        .type('application/json')
        .send(nonFiniteJson),
      request(app)
        .put(gradingPath())
        .set('Authorization', lecturerAAuthorization)
        .send({ answers: mainSnapshot(), total_score: 7 }),
    ];

    for (const gradingRequest of requests) {
      const response = await gradingRequest;
      expect(response.status).toBe(400);
    }

    await expectMainGradingUntouched();
  });

  test('rejects malformed snapshot bodies and invalid question ID types', async () => {
    const invalidIds = [
      0,
      -1,
      1.5,
      '1',
      Number.MAX_SAFE_INTEGER + 1,
    ];
    const requests = [
      request(app).put(gradingPath()).set('Authorization', lecturerAAuthorization),
      request(app)
        .put(gradingPath())
        .set('Authorization', lecturerAAuthorization)
        .send([]),
      request(app)
        .put(gradingPath())
        .set('Authorization', lecturerAAuthorization)
        .send({}),
      request(app)
        .put(gradingPath())
        .set('Authorization', lecturerAAuthorization)
        .send({ answers: {} }),
    ];

    for (const invalidId of invalidIds) {
      const answers = mainSnapshot();
      answers[0].questionId = invalidId;
      requests.push(saveMainDraft(answers));
    }

    for (const gradingRequest of requests) {
      const response = await gradingRequest;
      expect(response.status).toBe(400);
    }

    await expectMainGradingUntouched();
  });

  test('hides grading mutations from students and non-owning lecturers', async () => {
    const student = await request(app)
      .put(gradingPath())
      .set('Authorization', studentAAuthorization)
      .send({ answers: mainSnapshot() });
    const nonOwner = await request(app)
      .put(gradingPath())
      .set('Authorization', lecturerBAuthorization)
      .send({ answers: mainSnapshot() });
    const mismatch = await request(app)
      .put(gradingPath(mainExam.id, objectiveSubmission.id))
      .set('Authorization', lecturerAAuthorization)
      .send({ answers: mainSnapshot() });

    expect(student.status).toBe(403);
    expect(nonOwner.status).toBe(404);
    expect(nonOwner.body).toEqual({ error: 'Exam not found.' });
    expect(mismatch.status).toBe(404);
    expect(mismatch.body).toEqual({ error: 'Submission not found.' });
  });
});

describe('grading completion', () => {
  test('converts PostgreSQL NUMERIC strings to finite JSON numbers deliberately', async () => {
    const draft = await saveMainDraft();
    expect(draft.status).toBe(200);
    const storedAnswer = await pool.query(
      `SELECT awarded_points, PG_TYPEOF(awarded_points)::TEXT AS value_type
       FROM submission_answers
       WHERE submission_id = $1 AND question_id = $2`,
      [mainSubmission.id, shortAnswered.id],
    );

    expect(storedAnswer.rows[0]).toEqual({
      awarded_points: '0.75',
      value_type: 'numeric',
    });
    expect(typeof draft.body.questions.find(
      (question) => question.id === shortAnswered.id,
    ).awarded_points).toBe('number');

    const completed = await completeMain();
    expect(completed.status).toBe(200);
    const storedSubmission = await pool.query(
      `SELECT total_score, PG_TYPEOF(total_score)::TEXT AS value_type
       FROM exam_submissions
       WHERE id = $1`,
      [mainSubmission.id],
    );
    expect(storedSubmission.rows[0]).toEqual({
      total_score: '2.75',
      value_type: 'numeric',
    });
    expect(typeof completed.body.total_score).toBe('number');

    await expect(pool.query(
      `UPDATE submission_answers
       SET awarded_points = 'NaN'::NUMERIC
       WHERE submission_id = $1 AND question_id = $2`,
      [mainSubmission.id, shortAnswered.id],
    )).rejects.toMatchObject({ code: '23514' });

    await pool.query(
      `UPDATE exam_submissions
       SET total_score = 'NaN'::NUMERIC
       WHERE id = $1`,
      [mainSubmission.id],
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const invalidStoredTotal = await request(app)
        .get(`/api/exams/${mainExam.id}/submissions`)
        .set('Authorization', lecturerAAuthorization);
      expect(invalidStoredTotal.status).toBe(500);
      expect(invalidStoredTotal.body).toEqual({ error: 'Internal server error.' });
    } finally {
      consoleError.mockRestore();
    }
  });

  test('completes an objective-only submission directly from trusted answers', async () => {
    const response = await request(app)
      .post(`${gradingPath(objectiveExam.id, objectiveSubmission.id)}/complete`)
      .set('Authorization', lecturerAAuthorization);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      grading_state: 'completed',
      total_score: 2,
      maximum_score: 2,
      percentage: 100,
      graded_by: lecturerA.id,
      result_published_at: null,
    });
    expect(Number.isNaN(Date.parse(response.body.grading_completed_at))).toBe(false);

    const persisted = await readPersistedGrading(objectiveSubmission.id);
    expect(persisted.answers.map((answer) => answer.awarded_points)).toEqual(['1', '1']);
  });

  test('blocks an ungraded answered short answer without leaving partial writes', async () => {
    const response = await completeMain();

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/answered short-answer/i);
    const persisted = await readPersistedGrading();
    expect(persisted.submission.grading_state).toBe('ungraded');
    expect(persisted.answers.every((answer) => answer.awarded_points === null)).toBe(true);
  });

  test('completes mixed grading with unanswered zero, totals, and lecturer metadata', async () => {
    const response = await completeMainWithDraft(mainSnapshot({
      answeredShortMark: 0.5,
      answeredFeedback: 'Preserved completion feedback',
    }));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      grading_state: 'completed',
      total_score: 2.5,
      maximum_score: 7,
      percentage: 35.71,
      graded_by: lecturerA.id,
      result_published_at: null,
    });
    expect(Number.isNaN(Date.parse(response.body.grading_completed_at))).toBe(false);

    const persisted = await readPersistedGrading();
    expect(persisted.submission).toMatchObject({
      grading_state: 'completed',
      total_score: '2.5',
      graded_by: lecturerA.id,
    });
    expect(persisted.answers.find(
      (answer) => answer.question_id === shortUnanswered.id,
    ).awarded_points).toBe('0');

    const listed = await request(app)
      .get(`/api/exams/${mainExam.id}/submissions`)
      .set('Authorization', lecturerAAuthorization);
    expect(listed.body[0]).toMatchObject({
      total_score: 2.5,
      maximum_score: 7,
      percentage: 35.71,
    });
  });

  test('serializes concurrent completion requests without a silent overwrite', async () => {
    const draft = await saveMainDraft();
    expect(draft.status).toBe(200);

    const responses = await Promise.all([completeMain(), completeMain()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409).body.error)
      .toMatch(/already completed/i);

    const persisted = await readPersistedGrading();
    expect(persisted.submission).toMatchObject({
      grading_state: 'completed',
      total_score: '2.75',
      graded_by: lecturerA.id,
      result_published_at: null,
    });
  });

  test('rejects repeated completion and editing until grading is reopened', async () => {
    const completed = await completeMainWithDraft();
    expect(completed.status).toBe(200);

    const repeated = await completeMain();
    const edited = await saveMainDraft();

    expect(repeated.status).toBe(409);
    expect(repeated.body.error).toMatch(/already completed/i);
    expect(edited.status).toBe(409);
    expect(edited.body.error).toMatch(/reopened/i);
  });

  test('enforces bodyless completion and lecturer ownership', async () => {
    const withBody = await request(app)
      .post(`${gradingPath()}/complete`)
      .set('Authorization', lecturerAAuthorization)
      .send({ total_score: 7 });
    const student = await request(app)
      .post(`${gradingPath()}/complete`)
      .set('Authorization', studentAAuthorization);
    const nonOwner = await request(app)
      .post(`${gradingPath()}/complete`)
      .set('Authorization', lecturerBAuthorization);
    const mismatch = await request(app)
      .post(`${gradingPath(mainExam.id, objectiveSubmission.id)}/complete`)
      .set('Authorization', lecturerAAuthorization);

    expect(withBody.status).toBe(400);
    expect(student.status).toBe(403);
    expect(nonOwner.status).toBe(404);
    expect(mismatch.status).toBe(404);
    expect(mismatch.body).toEqual({ error: 'Submission not found.' });
  });
});

describe('individual result publication', () => {
  test('publishes completed grading without changing scores, metadata, answers, marks, or feedback', async () => {
    const completed = await completeMainWithDraft(mainSnapshot({
      answeredShortMark: 0.625,
      answeredFeedback: 'Publication must preserve this feedback.',
    }));
    expect(completed.status).toBe(200);
    const before = await readPersistedGrading();

    const response = await publishMain();

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'exam_id',
      'graded_by',
      'grading_completed_at',
      'grading_state',
      'id',
      'maximum_score',
      'percentage',
      'result_published_at',
      'total_score',
    ]);
    expect(response.body).toMatchObject({
      id: mainSubmission.id,
      exam_id: mainExam.id,
      grading_state: 'completed',
      total_score: 2.625,
      maximum_score: 7,
      percentage: 37.5,
      graded_by: lecturerA.id,
      grading_completed_at: before.submission.grading_completed_at.toISOString(),
    });
    expect(typeof response.body.total_score).toBe('number');
    expect(typeof response.body.maximum_score).toBe('number');
    expect(typeof response.body.percentage).toBe('number');
    expect(Number.isNaN(Date.parse(response.body.result_published_at))).toBe(false);

    const after = await readPersistedGrading();
    expect(after.submission).toMatchObject({
      grading_state: before.submission.grading_state,
      total_score: before.submission.total_score,
      graded_by: before.submission.graded_by,
      grading_completed_at: before.submission.grading_completed_at,
    });
    expect(after.submission.result_published_at.toISOString())
      .toBe(response.body.result_published_at);
    expect(after.answers).toEqual(before.answers);
  });

  test('enforces authentication, role, safe ownership, and submission membership', async () => {
    const unauthenticated = await request(app).post(publicationPath());
    const student = await request(app)
      .post(publicationPath())
      .set('Authorization', studentAAuthorization);
    const nonOwner = await request(app)
      .post(publicationPath())
      .set('Authorization', lecturerBAuthorization);
    const mismatch = await request(app)
      .post(publicationPath(mainExam.id, foreignSubmission.id))
      .set('Authorization', lecturerAAuthorization);

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toEqual({ error: 'Authentication required.' });
    expect(student.status).toBe(403);
    expect(student.body).toEqual({ error: 'Access forbidden.' });
    expect(nonOwner.status).toBe(404);
    expect(nonOwner.body).toEqual({ error: 'Exam not found.' });
    expect(mismatch.status).toBe(404);
    expect(mismatch.body).toEqual({ error: 'Submission not found.' });
  });

  test('returns clear conflicts for ungraded, in-progress, and already-published results', async () => {
    const ungraded = await publishMain();
    expect(ungraded.status).toBe(409);
    expect(ungraded.body.error).toMatch(/ungraded/i);

    const draft = await saveMainDraft();
    expect(draft.status).toBe(200);
    const inProgress = await publishMain();
    expect(inProgress.status).toBe(409);
    expect(inProgress.body.error).toMatch(/in-progress/i);

    const completed = await completeMain();
    expect(completed.status).toBe(200);
    const published = await publishMain();
    const repeated = await publishMain();
    expect(published.status).toBe(200);
    expect(repeated.status).toBe(409);
    expect(repeated.body.error).toMatch(/already published/i);
  });

  test('rejects a non-empty body and leaves completed grading unpublished', async () => {
    const completed = await completeMainWithDraft();
    expect(completed.status).toBe(200);
    const before = await readPersistedGrading();

    const response = await request(app)
      .post(publicationPath())
      .set('Authorization', lecturerAAuthorization)
      .send({ force: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/does not accept client-controlled fields/i);
    const after = await readPersistedGrading();
    expect(after).toEqual(before);
    expect(after.submission.result_published_at).toBeNull();
  });

  test('serializes simultaneous publication so exactly one attempt succeeds', async () => {
    const completed = await completeMainWithDraft();
    expect(completed.status).toBe(200);

    const responses = await Promise.all([publishMain(), publishMain()]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409).body.error)
      .toMatch(/already published/i);
    const persisted = await readPersistedGrading();
    expect(persisted.submission.result_published_at).not.toBeNull();
    expect(persisted.submission.grading_state).toBe('completed');
  });

  test('prevents reopening or draft edits after publication', async () => {
    const completed = await completeMainWithDraft();
    expect(completed.status).toBe(200);
    const published = await publishMain();
    expect(published.status).toBe(200);
    const before = await readPersistedGrading();

    const [reopened, edited] = await Promise.all([
      request(app)
        .post(`${gradingPath()}/reopen`)
        .set('Authorization', lecturerAAuthorization),
      saveMainDraft(mainSnapshot({ answeredShortMark: 0.25 })),
    ]);

    expect(reopened.status).toBe(409);
    expect(reopened.body.error).toMatch(/published/i);
    expect(edited.status).toBe(409);
    expect(edited.body.error).toMatch(/reopened/i);
    expect(await readPersistedGrading()).toEqual(before);
  });
});

describe('grading reopening', () => {
  test('reopens unpublished grading while preserving marks and feedback', async () => {
    const completed = await completeMainWithDraft(mainSnapshot({
      answeredShortMark: 0.625,
      answeredFeedback: 'Keep this feedback',
    }));
    expect(completed.status).toBe(200);
    const before = await readPersistedGrading();

    const response = await request(app)
      .post(`${gradingPath()}/reopen`)
      .set('Authorization', lecturerAAuthorization);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      grading_state: 'in_progress',
      total_score: null,
      percentage: null,
      graded_by: null,
      grading_completed_at: null,
      result_published_at: null,
    });
    const after = await readPersistedGrading();
    expect(after.submission).toMatchObject({
      grading_state: 'in_progress',
      total_score: null,
      graded_by: null,
      grading_completed_at: null,
    });
    expect(after.answers).toEqual(before.answers);
  });

  test('rejects reopening invalid states, published grading, and request bodies', async () => {
    const invalidState = await request(app)
      .post(`${gradingPath()}/reopen`)
      .set('Authorization', lecturerAAuthorization);
    expect(invalidState.status).toBe(409);

    const draft = await saveMainDraft();
    expect(draft.status).toBe(200);
    const inProgress = await request(app)
      .post(`${gradingPath()}/reopen`)
      .set('Authorization', lecturerAAuthorization);
    expect(inProgress.status).toBe(409);

    const completed = await completeMain();
    expect(completed.status).toBe(200);
    await pool.query(
      `UPDATE exam_submissions
       SET result_published_at = grading_completed_at
       WHERE id = $1`,
      [mainSubmission.id],
    );

    const published = await request(app)
      .post(`${gradingPath()}/reopen`)
      .set('Authorization', lecturerAAuthorization);
    const withBody = await request(app)
      .post(`${gradingPath()}/reopen`)
      .set('Authorization', lecturerAAuthorization)
      .send({ force: true });

    expect(published.status).toBe(409);
    expect(published.body.error).toMatch(/published/i);
    expect(withBody.status).toBe(400);
  });

  test('enforces role, ownership, and submission membership on reopening', async () => {
    const student = await request(app)
      .post(`${gradingPath()}/reopen`)
      .set('Authorization', studentAAuthorization);
    const nonOwner = await request(app)
      .post(`${gradingPath()}/reopen`)
      .set('Authorization', lecturerBAuthorization);
    const mismatch = await request(app)
      .post(`${gradingPath(mainExam.id, foreignSubmission.id)}/reopen`)
      .set('Authorization', lecturerAAuthorization);

    expect(student.status).toBe(403);
    expect(nonOwner.status).toBe(404);
    expect(mismatch.status).toBe(404);
  });
});
