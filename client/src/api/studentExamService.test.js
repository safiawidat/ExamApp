import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { ApiError, apiRequest } from './apiClient';
import {
  getStudentExam,
  listStudentExams,
  submitStudentExam,
} from './studentExamService';

vi.mock('./apiClient', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: vi.fn(),
}));

const catalogExams = [
  {
    id: 31,
    title: 'Algorithms midterm',
    description: 'A published student exam.',
    published_at: '2026-07-15T10:00:00.000Z',
    exam_type: {
      id: 7,
      name: 'Algorithms',
    },
    question_count: 3,
    total_points: 12,
    has_submitted: false,
    result_available: false,
  },
  {
    id: 32,
    title: 'Databases quiz',
    description: null,
    published_at: '2026-07-14T10:00:00.000Z',
    exam_type: {
      id: 8,
      name: 'Databases',
    },
    question_count: 0,
    total_points: 0,
    has_submitted: true,
    result_available: false,
  },
];

const shortAnswerQuestion = {
  id: 101,
  question_type: 'short_answer',
  prompt: 'Explain the runtime.',
  points: 4,
  position: 1,
  notice: {
    message: 'Use asymptotic notation.',
    placement: 'above',
  },
};

const multipleChoiceQuestion = {
  id: 102,
  question_type: 'multiple_choice',
  prompt: 'Choose the stable sort.',
  points: 5,
  position: 2,
  notice: {
    message: 'Select one visible option.',
    placement: 'below',
  },
  options: [
    { id: 201, text: 'Merge sort', position: 1 },
    { id: 202, text: 'Selection sort', position: 2 },
  ],
};

const trueFalseQuestion = {
  id: 103,
  question_type: 'true_false',
  prompt: 'A binary search requires sorted input.',
  points: 3,
  position: 3,
};

const studentExam = {
  id: catalogExams[0].id,
  title: catalogExams[0].title,
  description: catalogExams[0].description,
  published_at: catalogExams[0].published_at,
  exam_type: catalogExams[0].exam_type,
  question_count: catalogExams[0].question_count,
  total_points: catalogExams[0].total_points,
  has_submitted: catalogExams[0].has_submitted,
  questions: [
    shortAnswerQuestion,
    multipleChoiceQuestion,
    trueFalseQuestion,
  ],
};

const submittedAnswers = [
  { question_id: 101, text_answer: '  O(n log n)  ' },
  { question_id: 102, selected_option_id: 201 },
  { question_id: 103, boolean_answer: false },
  { question_id: 104, text_answer: '   ' },
  { question_id: 105 },
];

const normalizedAnswers = [
  { question_id: 101, text_answer: 'O(n log n)' },
  { question_id: 102, selected_option_id: 201 },
  { question_id: 103, boolean_answer: false },
  { question_id: 104, text_answer: null },
  { question_id: 105 },
];

const submissionConfirmation = {
  id: 501,
  exam_id: studentExam.id,
  submitted_at: '2026-07-16T09:00:00.000Z',
  answer_count: submittedAnswers.length,
};

const copy = (value) => JSON.parse(JSON.stringify(value));

const omit = (value, key) => {
  const result = { ...value };
  delete result[key];
  return result;
};

const replaceQuestion = (index, question) => ({
  ...studentExam,
  questions: studentExam.questions.map((current, currentIndex) => (
    currentIndex === index ? question : current
  )),
});

const expectInvalidResponse = async (promise, resource) => {
  try {
    await promise;
    throw new Error('Expected the service to reject an invalid response.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 500,
      message: `The server returned an invalid ${resource} response.`,
    });
  }
};

let fetchSpy;

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('student exam service requests', () => {
  test('lists student exams with authenticated GET and no request body', async () => {
    apiRequest.mockResolvedValue(catalogExams);

    await expect(listStudentExams()).resolves.toEqual(catalogExams);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith('/student/exams', { auth: true });
    expect(apiRequest.mock.calls[0][1]).not.toHaveProperty('body');
  });

  test('loads one student exam with authenticated GET and no request body', async () => {
    apiRequest.mockResolvedValue(studentExam);

    await expect(getStudentExam(studentExam.id)).resolves.toEqual(studentExam);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith(`/student/exams/${studentExam.id}`, {
      auth: true,
    });
    expect(apiRequest.mock.calls[0][1]).not.toHaveProperty('body');
  });

  test('submits normalized answers while preserving false and caller input', async () => {
    const answers = copy(submittedAnswers);
    const originalAnswers = copy(answers);
    apiRequest.mockResolvedValue(submissionConfirmation);

    await expect(submitStudentExam(studentExam.id, answers))
      .resolves.toEqual(submissionConfirmation);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith(
      `/student/exams/${studentExam.id}/submissions`,
      {
        method: 'POST',
        auth: true,
        body: { answers: normalizedAnswers },
      },
    );
    expect(apiRequest.mock.calls[0][1].body.answers[2].boolean_answer).toBe(false);
    expect(apiRequest.mock.calls[0][1].body.answers[4])
      .toEqual({ question_id: 105 });
    expect(answers).toEqual(originalAnswers);
    expect(apiRequest.mock.calls[0][1].body.answers).not.toBe(answers);
  });
});

describe('student request validation', () => {
  test.each([
    0,
    -1,
    1.5,
    '31',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2147483648,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid exam ID %s before requesting the API', async (examId) => {
    await expect(getStudentExam(examId))
      .rejects.toThrow(new TypeError('Exam ID must be a positive integer.'));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  test.each([
    ['a non-array answer value', null],
    ['an empty answer array', []],
  ])('rejects %s before requesting the API', async (_label, answers) => {
    await expect(submitStudentExam(studentExam.id, answers))
      .rejects.toThrow(new TypeError('Answers must be a non-empty array.'));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  test.each([
    ['a non-object answer', [null], 'Each answer must be an object.'],
    ['a missing question ID', [{}], 'Question ID must be a positive integer.'],
    [
      'an invalid question ID',
      [{ question_id: 0 }],
      'Question ID must be a positive integer.',
    ],
    [
      'a numeric-string question ID',
      [{ question_id: '101' }],
      'Question ID must be a positive integer.',
    ],
    [
      'duplicate question IDs',
      [{ question_id: 101 }, { question_id: 101 }],
      'Submission answers must not contain duplicate question IDs.',
    ],
    [
      'an unsupported answer field',
      [{ question_id: 101, answer: true }],
      'Unsupported answer field: answer.',
    ],
    [
      'an invalid selected option',
      [{ question_id: 101, selected_option_id: '201' }],
      'Selected option ID must be a positive integer or null.',
    ],
    [
      'an out-of-range selected option',
      [{ question_id: 101, selected_option_id: 2147483648 }],
      'Selected option ID must be a positive integer or null.',
    ],
    [
      'an invalid Boolean answer',
      [{ question_id: 101, boolean_answer: 0 }],
      'Boolean answer must be true, false, or null.',
    ],
    [
      'an invalid text answer',
      [{ question_id: 101, text_answer: false }],
      'Text answer must be a string or null.',
    ],
    [
      'more than one non-null answer value',
      [{ question_id: 101, selected_option_id: 201, boolean_answer: false }],
      'Each question may contain at most one answer value.',
    ],
  ])('rejects %s before requesting the API', async (_label, answers, message) => {
    await expect(submitStudentExam(studentExam.id, answers))
      .rejects.toThrow(new TypeError(message));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  test('preserves explicitly present null answer fields without adding absent fields', async () => {
    const answers = [{
      question_id: 101,
      selected_option_id: null,
      boolean_answer: null,
      text_answer: null,
    }];
    apiRequest.mockResolvedValue({
      ...submissionConfirmation,
      answer_count: 1,
    });

    await submitStudentExam(studentExam.id, answers);

    expect(apiRequest.mock.calls[0][1].body.answers).toEqual(answers);
    expect(apiRequest.mock.calls[0][1].body.answers[0])
      .not.toHaveProperty('unsupported_field');
  });
});

describe('student exam catalog response validation', () => {
  test.each([
    ['a non-array list', { exams: catalogExams }],
    ['a malformed item', [{ ...catalogExams[0], title: '   ' }]],
    ['a negative question count', [{ ...catalogExams[0], question_count: -1 }]],
    ['a negative total point count', [{ ...catalogExams[0], total_points: -1 }]],
    ['an invalid nested exam type', [{ ...catalogExams[0], exam_type: null }]],
    [
      'an invalid nested exam type name',
      [{ ...catalogExams[0], exam_type: { id: 7, name: '' } }],
    ],
    ['an invalid submitted flag', [{ ...catalogExams[0], has_submitted: 0 }]],
    ['an invalid result flag', [{ ...catalogExams[0], result_available: 0 }]],
    ['an out-of-range exam ID', [{ ...catalogExams[0], id: 2147483648 }]],
    ['a forbidden top-level field', [{ ...catalogExams[0], lecturer_id: 9 }]],
    [
      'a recursively nested forbidden field',
      [{ ...catalogExams[0], future: [{ metadata: { feedback: 'private' } }] }],
    ],
  ])('rejects %s', async (_label, response) => {
    apiRequest.mockResolvedValue(response);
    await expectInvalidResponse(listStudentExams(), 'student exam list');
  });

  test('constructs a new safe catalog projection and ignores harmless unknown fields', async () => {
    const response = catalogExams.map((exam) => ({
      ...exam,
      future_server_field: 'ignored',
      exam_type: {
        ...exam.exam_type,
        future_type_field: 'ignored',
      },
    }));
    apiRequest.mockResolvedValue(response);

    const result = await listStudentExams();

    expect(result).toEqual(catalogExams);
    expect(result).not.toBe(response);
    expect(result[0]).not.toBe(response[0]);
    expect(result[0].exam_type).not.toBe(response[0].exam_type);
    expect(result[0]).not.toHaveProperty('future_server_field');
  });
});

describe('student exam detail response validation', () => {
  test.each([
    ['missing questions', omit(studentExam, 'questions')],
    ['a question count mismatch', { ...studentExam, question_count: 2 }],
    ['a total-points mismatch', { ...studentExam, total_points: 13 }],
    [
      'duplicate question IDs',
      replaceQuestion(2, { ...trueFalseQuestion, id: shortAnswerQuestion.id }),
    ],
    [
      'duplicate question positions',
      replaceQuestion(2, { ...trueFalseQuestion, position: shortAnswerQuestion.position }),
    ],
    [
      'incorrectly ordered questions',
      { ...studentExam, questions: [multipleChoiceQuestion, shortAnswerQuestion, trueFalseQuestion] },
    ],
    [
      'a malformed question',
      replaceQuestion(0, { ...shortAnswerQuestion, prompt: '' }),
    ],
    [
      'an unsupported question type',
      replaceQuestion(0, { ...shortAnswerQuestion, question_type: 'essay' }),
    ],
    [
      'a null notice',
      replaceQuestion(0, { ...shortAnswerQuestion, notice: null }),
    ],
    [
      'an invalid notice placement',
      replaceQuestion(0, {
        ...shortAnswerQuestion,
        notice: { ...shortAnswerQuestion.notice, placement: 'aside' },
      }),
    ],
    [
      'missing multiple-choice options',
      replaceQuestion(1, omit(multipleChoiceQuestion, 'options')),
    ],
    [
      'fewer than two multiple-choice options',
      replaceQuestion(1, {
        ...multipleChoiceQuestion,
        options: [multipleChoiceQuestion.options[0]],
      }),
    ],
    [
      'duplicate option IDs',
      replaceQuestion(1, {
        ...multipleChoiceQuestion,
        options: [
          multipleChoiceQuestion.options[0],
          { ...multipleChoiceQuestion.options[1], id: multipleChoiceQuestion.options[0].id },
        ],
      }),
    ],
    [
      'duplicate option positions',
      replaceQuestion(1, {
        ...multipleChoiceQuestion,
        options: [
          multipleChoiceQuestion.options[0],
          {
            ...multipleChoiceQuestion.options[1],
            position: multipleChoiceQuestion.options[0].position,
          },
        ],
      }),
    ],
    [
      'incorrectly ordered options',
      replaceQuestion(1, {
        ...multipleChoiceQuestion,
        options: [...multipleChoiceQuestion.options].reverse(),
      }),
    ],
    [
      'options on a true/false question',
      replaceQuestion(2, { ...trueFalseQuestion, options: [] }),
    ],
    [
      'options on a short-answer question',
      replaceQuestion(0, { ...shortAnswerQuestion, options: [] }),
    ],
    [
      'a nested answer-key field',
      replaceQuestion(1, {
        ...multipleChoiceQuestion,
        options: [
          { ...multipleChoiceQuestion.options[0], is_correct: true },
          multipleChoiceQuestion.options[1],
        ],
      }),
    ],
    [
      'a nested timestamp field',
      replaceQuestion(0, {
        ...shortAnswerQuestion,
        notice: { ...shortAnswerQuestion.notice, updated_at: '2026-07-16T09:00:00Z' },
      }),
    ],
  ])('rejects %s', async (_label, response) => {
    apiRequest.mockResolvedValue(response);
    await expectInvalidResponse(getStudentExam(studentExam.id), 'student exam');
  });

  test('constructs an exact safe detail projection and omits absent notices', async () => {
    const response = {
      ...studentExam,
      future_server_field: 'ignored',
      exam_type: { ...studentExam.exam_type, future_type_field: 'ignored' },
      questions: studentExam.questions.map((question) => ({
        ...question,
        future_question_field: 'ignored',
        ...(question.notice && {
          notice: { ...question.notice, future_notice_field: 'ignored' },
        }),
        ...(question.options && {
          options: question.options.map((option) => ({
            ...option,
            future_option_field: 'ignored',
          })),
        }),
      })),
    };
    apiRequest.mockResolvedValue(response);

    const result = await getStudentExam(studentExam.id);

    expect(result).toEqual(studentExam);
    expect(Object.keys(result).sort()).toEqual([
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
    expect(result.questions[0].notice).toEqual({
      message: shortAnswerQuestion.notice.message,
      placement: 'above',
    });
    expect(result.questions[1].notice).toEqual({
      message: multipleChoiceQuestion.notice.message,
      placement: 'below',
    });
    expect(result.questions[2]).not.toHaveProperty('notice');
    expect(result.questions[2]).not.toHaveProperty('options');
    expect(result.questions[1].options[0]).toEqual({
      id: 201,
      text: 'Merge sort',
      position: 1,
    });
  });
});

describe('student submission response validation', () => {
  test.each([
    ['a non-object confirmation', null],
    ['an invalid submission ID', { ...submissionConfirmation, id: 0 }],
    ['the wrong exam ID', { ...submissionConfirmation, exam_id: 999 }],
    ['the wrong answer count', { ...submissionConfirmation, answer_count: 4 }],
    ['an invalid timestamp', { ...submissionConfirmation, submitted_at: '   ' }],
    ['a non-positive answer count', { ...submissionConfirmation, answer_count: 0 }],
  ])('rejects %s', async (_label, response) => {
    apiRequest.mockResolvedValue(response);
    await expectInvalidResponse(
      submitStudentExam(studentExam.id, submittedAnswers),
      'student submission',
    );
  });

  test('returns only the safe confirmation projection', async () => {
    apiRequest.mockResolvedValue({
      ...submissionConfirmation,
      student_id: 88,
      score: 12,
      feedback: 'private',
      answers: submittedAnswers,
      future_server_field: 'ignored',
    });

    const result = await submitStudentExam(studentExam.id, submittedAnswers);

    expect(result).toEqual(submissionConfirmation);
    expect(Object.keys(result).sort()).toEqual([
      'answer_count',
      'exam_id',
      'id',
      'submitted_at',
    ]);
  });
});

describe('shared API error preservation', () => {
  test.each([
    [
      'detail 404',
      () => getStudentExam(studentExam.id),
      new ApiError(404, 'Exam not found.'),
    ],
    [
      'submission 409',
      () => submitStudentExam(studentExam.id, submittedAnswers),
      new ApiError(409, 'Exam has already been submitted.'),
    ],
    [
      'submission 400',
      () => submitStudentExam(studentExam.id, submittedAnswers),
      new ApiError(400, 'Selected option does not belong to the question.'),
    ],
  ])('preserves the exact %s error object', async (_label, requestService, error) => {
    apiRequest.mockRejectedValue(error);

    await expect(requestService()).rejects.toBe(error);
  });
});
