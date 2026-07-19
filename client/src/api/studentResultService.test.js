import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError, apiRequest } from './apiClient';
import { getStudentExamResult } from './studentExamService';

vi.mock('./apiClient', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: vi.fn(),
}));

const publishedResult = {
  exam_id: 31,
  exam_title: 'Algorithms midterm',
  submission_id: 501,
  submitted_at: '2026-07-16T09:00:00.000Z',
  result_published_at: '2026-07-18T12:00:00.000Z',
  total_score: 2.5,
  maximum_score: 4,
  percentage: 62.5,
  questions: [
    {
      id: 101,
      position: 10,
      question_type: 'multiple_choice',
      prompt: 'Choose the stable sort.',
      is_unanswered: false,
      awarded_points: 1,
      maximum_points: 1,
      feedback: null,
      selected_option_id: 201,
      correct_option_id: 201,
      options: [
        { id: 201, text: 'Merge sort', position: 1 },
        { id: 202, text: 'Selection sort', position: 2 },
      ],
    },
    {
      id: 102,
      position: 20,
      question_type: 'true_false',
      prompt: 'The answer is false.',
      is_unanswered: false,
      awarded_points: 1,
      maximum_points: 1,
      feedback: 'Correctly preserved false.',
      boolean_answer: false,
      correct_answer: false,
    },
    {
      id: 103,
      position: 30,
      question_type: 'short_answer',
      prompt: 'Explain the runtime.',
      is_unanswered: false,
      awarded_points: 0.5,
      maximum_points: 1,
      feedback: 'Partially correct.',
      text_answer: 'O(n squared)',
      reference_answer: 'O(n log n)',
    },
    {
      id: 104,
      position: 40,
      question_type: 'short_answer',
      prompt: 'Name the invariant.',
      is_unanswered: true,
      awarded_points: 0,
      maximum_points: 1,
      feedback: null,
      text_answer: null,
      reference_answer: 'The prefix remains sorted.',
    },
  ],
};

const copy = (value) => structuredClone(value);

const replaceQuestion = (result, index, replacement) => ({
  ...result,
  questions: result.questions.map((question, questionIndex) => (
    questionIndex === index ? replacement : question
  )),
});

const expectInvalidResult = async (response) => {
  apiRequest.mockResolvedValue(response);
  await expect(getStudentExamResult(publishedResult.exam_id)).rejects.toMatchObject({
    name: 'ApiError',
    status: 500,
    message: 'The server returned an invalid student result response.',
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('student result request', () => {
  test('uses the authenticated result GET and returns a strict projected copy', async () => {
    const response = copy(publishedResult);
    apiRequest.mockResolvedValue(response);

    const result = await getStudentExamResult(publishedResult.exam_id);

    expect(apiRequest).toHaveBeenCalledWith(
      `/student/exams/${publishedResult.exam_id}/result`,
      { auth: true },
    );
    expect(apiRequest.mock.calls[0][1]).not.toHaveProperty('method');
    expect(apiRequest.mock.calls[0][1]).not.toHaveProperty('body');
    expect(result).toEqual(publishedResult);
    expect(result).not.toBe(response);
    expect(result.questions[0]).not.toBe(response.questions[0]);
    expect(result.questions[0].options[0]).not.toBe(response.questions[0].options[0]);
    expect(typeof result.total_score).toBe('number');
    expect(result.questions[1].boolean_answer).toBe(false);
    expect(result.questions[0].feedback).toBeNull();
    expect(result.questions[3].awarded_points).toBe(0);
  });

  test.each([0, -1, 1.5, '31', 2147483648, Number.NaN])(
    'rejects invalid exam ID %s before making a request',
    async (examId) => {
      await expect(getStudentExamResult(examId))
        .rejects.toThrow('Exam ID must be a positive integer.');
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );

  test('preserves the shared ApiError object', async () => {
    const error = new ApiError(404, 'Result not found.');
    apiRequest.mockRejectedValue(error);

    await expect(getStudentExamResult(publishedResult.exam_id)).rejects.toBe(error);
  });
});

describe('student result response validation', () => {
  test.each([
    ['an unknown top-level field', { ...publishedResult, grading_state: 'completed' }],
    ['an invalid exam ID', { ...publishedResult, exam_id: 0 }],
    ['an invalid submission ID', { ...publishedResult, submission_id: '501' }],
    ['a malformed total', { ...publishedResult, total_score: '2.5' }],
    ['a non-finite total', { ...publishedResult, total_score: Number.NaN }],
    ['an infinite total', { ...publishedResult, total_score: Number.POSITIVE_INFINITY }],
    ['a negative total', { ...publishedResult, total_score: -1 }],
    ['an out-of-range total', { ...publishedResult, total_score: 5 }],
    ['a malformed maximum', { ...publishedResult, maximum_score: '4' }],
    ['a malformed percentage', { ...publishedResult, percentage: '62.5' }],
    ['a non-finite percentage', { ...publishedResult, percentage: Number.NaN }],
    ['an inconsistent percentage', { ...publishedResult, percentage: 62.49 }],
    ['a malformed submitted timestamp', { ...publishedResult, submitted_at: 'not-a-date' }],
    [
      'a malformed publication timestamp',
      { ...publishedResult, result_published_at: 'not-a-date' },
    ],
    [
      'publication before submission',
      { ...publishedResult, result_published_at: '2026-07-15T12:00:00.000Z' },
    ],
    ['an empty question list', { ...publishedResult, questions: [] }],
    [
      'duplicate questions',
      replaceQuestion(publishedResult, 1, {
        ...publishedResult.questions[1],
        id: publishedResult.questions[0].id,
      }),
    ],
    [
      'duplicate positions',
      replaceQuestion(publishedResult, 1, {
        ...publishedResult.questions[1],
        position: publishedResult.questions[0].position,
      }),
    ],
    [
      'unordered questions',
      { ...publishedResult, questions: [...publishedResult.questions].reverse() },
    ],
    [
      'an unknown question type',
      replaceQuestion(publishedResult, 2, {
        ...publishedResult.questions[2],
        question_type: 'essay',
      }),
    ],
    [
      'an invalid question ID',
      replaceQuestion(publishedResult, 2, {
        ...publishedResult.questions[2],
        id: 0,
      }),
    ],
    [
      'an invalid question position',
      replaceQuestion(publishedResult, 2, {
        ...publishedResult.questions[2],
        position: 0,
      }),
    ],
    [
      'an invalid maximum mark',
      replaceQuestion(publishedResult, 2, {
        ...publishedResult.questions[2],
        maximum_points: 2,
      }),
    ],
    [
      'an invalid awarded mark',
      replaceQuestion(publishedResult, 2, {
        ...publishedResult.questions[2],
        awarded_points: 1.5,
      }),
    ],
    [
      'a null awarded mark',
      replaceQuestion(publishedResult, 2, {
        ...publishedResult.questions[2],
        awarded_points: null,
      }),
    ],
    [
      'a negative awarded mark',
      replaceQuestion(publishedResult, 2, {
        ...publishedResult.questions[2],
        awarded_points: -0.1,
      }),
    ],
    [
      'invalid feedback',
      replaceQuestion(publishedResult, 2, {
        ...publishedResult.questions[2],
        feedback: { private: true },
      }),
    ],
    [
      'an unknown question field',
      replaceQuestion(publishedResult, 2, {
        ...publishedResult.questions[2],
        graded_by: 9,
      }),
    ],
  ])('rejects %s', async (_label, response) => {
    await expectInvalidResult(response);
  });

  test.each([
    [
      'duplicate MCQ option IDs',
      {
        ...publishedResult.questions[0],
        options: [
          publishedResult.questions[0].options[0],
          { ...publishedResult.questions[0].options[1], id: 201 },
        ],
      },
    ],
    [
      'unordered MCQ options',
      {
        ...publishedResult.questions[0],
        options: [...publishedResult.questions[0].options].reverse(),
      },
    ],
    [
      'a selected MCQ option not in the list',
      { ...publishedResult.questions[0], selected_option_id: 999 },
    ],
    [
      'a correct MCQ option not in the list',
      { ...publishedResult.questions[0], correct_option_id: 999 },
    ],
    [
      'an invalid MCQ option position',
      {
        ...publishedResult.questions[0],
        options: [
          { ...publishedResult.questions[0].options[0], position: 0 },
          publishedResult.questions[0].options[1],
        ],
      },
    ],
    [
      'an inconsistent MCQ mark',
      { ...publishedResult.questions[0], awarded_points: 0 },
    ],
  ])('rejects %s', async (_label, question) => {
    await expectInvalidResult(replaceQuestion(publishedResult, 0, question));
  });

  test.each([
    [
      'false marked unanswered',
      { ...publishedResult.questions[1], is_unanswered: true },
    ],
    [
      'an unanswered Boolean marked answered',
      {
        ...publishedResult.questions[1],
        boolean_answer: null,
        awarded_points: 0,
      },
    ],
    [
      'an unanswered short answer with a nonzero mark',
      { ...publishedResult.questions[3], awarded_points: 0.5 },
    ],
    [
      'an answered short answer marked unanswered',
      { ...publishedResult.questions[2], is_unanswered: true },
    ],
    [
      'an unanswered short answer marked answered',
      { ...publishedResult.questions[3], is_unanswered: false },
    ],
    [
      'an empty answered short answer',
      { ...publishedResult.questions[2], text_answer: '   ' },
    ],
  ])('rejects %s', async (_label, question) => {
    const index = question.question_type === 'true_false'
      ? 1
      : question.id === publishedResult.questions[3].id ? 3 : 2;
    await expectInvalidResult(replaceQuestion(publishedResult, index, question));
  });
});
