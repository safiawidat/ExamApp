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
  createQuestion,
  deleteQuestion,
  listQuestions,
  reorderQuestions,
  updateQuestion,
} from './questionService';

vi.mock('./apiClient', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: vi.fn(),
}));

const commonQuestion = {
  exam_id: 31,
  prompt: 'A valid question?',
  points: 5,
  created_at: '2026-07-15T08:00:00.000Z',
  updated_at: '2026-07-15T08:00:00.000Z',
};

const multipleChoiceQuestion = {
  ...commonQuestion,
  id: 101,
  question_type: 'multiple_choice',
  position: 1,
  options: [
    { id: 201, text: 'No', is_correct: false, position: 1 },
    { id: 202, text: 'Yes', is_correct: true, position: 2 },
  ],
};

const trueFalseQuestion = {
  ...commonQuestion,
  id: 102,
  question_type: 'true_false',
  position: 2,
  correct_answer: false,
};

const shortAnswerQuestion = {
  ...commonQuestion,
  id: 103,
  question_type: 'short_answer',
  position: 3,
  reference_answer: 'A reference answer',
};

const questionList = [
  multipleChoiceQuestion,
  trueFalseQuestion,
  shortAnswerQuestion,
];

let fetchSpy;

const expectInvalidResponse = async (promise) => {
  try {
    await promise;
    throw new Error('Expected the service to reject an invalid response.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500 });
    expect(error.message).toMatch(/invalid/i);
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('question service requests', () => {
  test('lists and maps every supported question response type', async () => {
    apiRequest.mockResolvedValue(questionList);

    await expect(listQuestions(commonQuestion.exam_id)).resolves.toEqual(questionList);
    expect(apiRequest).toHaveBeenCalledWith(
      `/exams/${commonQuestion.exam_id}/questions`,
      { auth: true },
    );
  });

  test('creates a question with the supplied payload', async () => {
    const payload = {
      question_type: 'true_false',
      prompt: 'A valid question?',
      points: 5,
      correct_answer: false,
    };
    apiRequest.mockResolvedValue(trueFalseQuestion);

    await expect(createQuestion(commonQuestion.exam_id, payload))
      .resolves.toEqual(trueFalseQuestion);
    expect(apiRequest).toHaveBeenCalledWith(
      `/exams/${commonQuestion.exam_id}/questions`,
      {
        auth: true,
        method: 'POST',
        body: payload,
      },
    );
  });

  test('updates a question with both route IDs and the supplied patch', async () => {
    const payload = { reference_answer: 'An updated reference answer' };
    const updated = { ...shortAnswerQuestion, reference_answer: payload.reference_answer };
    apiRequest.mockResolvedValue(updated);

    await expect(updateQuestion(commonQuestion.exam_id, shortAnswerQuestion.id, payload))
      .resolves.toEqual(updated);
    expect(apiRequest).toHaveBeenCalledWith(
      `/exams/${commonQuestion.exam_id}/questions/${shortAnswerQuestion.id}`,
      {
        auth: true,
        method: 'PATCH',
        body: payload,
      },
    );
  });

  test('handles an empty 204 response when deleting a question', async () => {
    apiRequest.mockResolvedValue(null);

    await deleteQuestion(commonQuestion.exam_id, multipleChoiceQuestion.id);
    expect(apiRequest).toHaveBeenCalledWith(
      `/exams/${commonQuestion.exam_id}/questions/${multipleChoiceQuestion.id}`,
      {
        auth: true,
        method: 'DELETE',
      },
    );
  });

  test('reorders questions with the server question_ids payload', async () => {
    const questionIds = [103, 101, 102];
    const reordered = [
      { ...shortAnswerQuestion, position: 1 },
      { ...multipleChoiceQuestion, position: 2 },
      { ...trueFalseQuestion, position: 3 },
    ];
    apiRequest.mockResolvedValue(reordered);

    await expect(reorderQuestions(commonQuestion.exam_id, questionIds))
      .resolves.toEqual(reordered);
    expect(apiRequest).toHaveBeenCalledWith(
      `/exams/${commonQuestion.exam_id}/questions/reorder`,
      {
        auth: true,
        method: 'PUT',
        body: { question_ids: questionIds },
      },
    );
  });
});

describe('question response safety', () => {
  test.each([
    ['a non-array list', () => listQuestions(31), { questions: questionList }],
    [
      'a malformed multiple-choice option',
      () => listQuestions(31),
      [{
        ...multipleChoiceQuestion,
        options: [{ ...multipleChoiceQuestion.options[0], is_correct: 'false' }],
      }],
    ],
    [
      'a non-boolean true/false answer',
      () => createQuestion(31, {}),
      { ...trueFalseQuestion, correct_answer: 'false' },
    ],
    [
      'an empty short-answer reference',
      () => updateQuestion(31, 103, {}),
      { ...shortAnswerQuestion, reference_answer: '' },
    ],
    ['an unsupported question type', () => reorderQuestions(31, [101]), [{
      ...multipleChoiceQuestion,
      question_type: 'open_text',
    }]],
  ])('rejects %s', async (_label, requestService, response) => {
    apiRequest.mockResolvedValue(response);
    await expectInvalidResponse(requestService());
  });

  test('preserves safe API errors from the shared client', async () => {
    const apiError = new ApiError(409, 'Published exams must be unpublished before modifying.');
    apiRequest.mockRejectedValue(apiError);

    await expect(deleteQuestion(31, 101)).rejects.toBe(apiError);
  });
});
