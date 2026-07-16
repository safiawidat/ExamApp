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
  deleteQuestionNotice,
  getQuestionNotice,
  saveQuestionNotice,
} from './questionNoticeService';

vi.mock('./apiClient', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: vi.fn(),
}));

const validNotice = {
  question_id: 101,
  exam_id: 31,
  message: 'Read this before answering.',
  placement: 'above',
  created_at: '2026-07-16T08:00:00.000Z',
  updated_at: '2026-07-16T09:00:00.000Z',
};

const withoutField = (value, field) => Object.fromEntries(
  Object.entries(value).filter(([key]) => key !== field),
);

const expectInvalidResponse = async (promise) => {
  try {
    await promise;
    throw new Error('Expected the service to reject an invalid response.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500 });
    expect(error.message).toMatch(/invalid question-notice response/i);
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

describe('question notice service requests', () => {
  test('gets a notice from the exact authenticated endpoint', async () => {
    apiRequest.mockResolvedValue(validNotice);

    await expect(getQuestionNotice(validNotice.exam_id, validNotice.question_id))
      .resolves.toEqual(validNotice);
    expect(apiRequest).toHaveBeenCalledWith(
      `/exams/${validNotice.exam_id}/questions/${validNotice.question_id}/notice`,
      { auth: true },
    );
  });

  test('saves a notice with PUT, authentication, and the same payload object', async () => {
    const payload = {
      message: '  The server will trim this message.  ',
      placement: 'below',
    };
    const originalPayload = { ...payload };
    const storedNotice = {
      ...validNotice,
      message: payload.message.trim(),
      placement: payload.placement,
    };
    apiRequest.mockResolvedValue(storedNotice);

    await expect(saveQuestionNotice(
      validNotice.exam_id,
      validNotice.question_id,
      payload,
    )).resolves.toEqual(storedNotice);
    expect(apiRequest).toHaveBeenCalledWith(
      `/exams/${validNotice.exam_id}/questions/${validNotice.question_id}/notice`,
      {
        method: 'PUT',
        auth: true,
        body: payload,
      },
    );
    expect(apiRequest.mock.calls[0][1].body).toBe(payload);
    expect(payload).toEqual(originalPayload);
  });

  test('deletes a notice with DELETE and accepts an empty response', async () => {
    apiRequest.mockResolvedValue(null);

    await expect(deleteQuestionNotice(validNotice.exam_id, validNotice.question_id))
      .resolves.toBeUndefined();
    expect(apiRequest).toHaveBeenCalledWith(
      `/exams/${validNotice.exam_id}/questions/${validNotice.question_id}/notice`,
      {
        method: 'DELETE',
        auth: true,
      },
    );
  });
});

describe.each([
  ['getQuestionNotice', (examId, questionId) => getQuestionNotice(examId, questionId)],
  [
    'saveQuestionNotice',
    (examId, questionId) => saveQuestionNotice(examId, questionId, {
      message: 'Notice',
      placement: 'above',
    }),
  ],
  ['deleteQuestionNotice', (examId, questionId) => deleteQuestionNotice(examId, questionId)],
])('%s local ID validation', (_name, operation) => {
  test('rejects an invalid exam ID before requesting the API', async () => {
    await expect(operation(0, validNotice.question_id)).rejects.toThrow(/exam id.*positive integer/i);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  test('rejects an invalid question ID before requesting the API', async () => {
    await expect(operation(validNotice.exam_id, -1))
      .rejects.toThrow(/question id.*positive integer/i);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('question notice payload validation', () => {
  test.each([
    ['null', null],
    ['an array', []],
    ['a string', 'notice'],
    ['a number', 42],
    ['undefined', undefined],
  ])('rejects %s before requesting the API', async (_label, payload) => {
    await expect(saveQuestionNotice(validNotice.exam_id, validNotice.question_id, payload))
      .rejects.toThrow(/payload must be an object/i);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('question notice response validation', () => {
  test('returns a complete valid above notice', async () => {
    apiRequest.mockResolvedValue(validNotice);

    await expect(getQuestionNotice(validNotice.exam_id, validNotice.question_id))
      .resolves.toEqual(validNotice);
  });

  test('returns a complete valid below notice', async () => {
    const belowNotice = { ...validNotice, placement: 'below' };
    apiRequest.mockResolvedValue(belowNotice);

    await expect(getQuestionNotice(validNotice.exam_id, validNotice.question_id))
      .resolves.toEqual(belowNotice);
  });

  test('returns only the public notice projection', async () => {
    apiRequest.mockResolvedValue({
      ...validNotice,
      internal_flag: true,
      raw_question: { correct_answer: 'private' },
    });

    const result = await getQuestionNotice(validNotice.exam_id, validNotice.question_id);

    expect(result).toEqual(validNotice);
    expect(Object.keys(result)).toEqual([
      'question_id',
      'exam_id',
      'message',
      'placement',
      'created_at',
      'updated_at',
    ]);
  });

  test.each([
    ['a null response', null],
    ['an array response', []],
    ['a missing question ID', withoutField(validNotice, 'question_id')],
    ['a non-integer question ID', { ...validNotice, question_id: 1.5 }],
    ['a zero question ID', { ...validNotice, question_id: 0 }],
    ['a negative question ID', { ...validNotice, question_id: -1 }],
    ['a missing exam ID', withoutField(validNotice, 'exam_id')],
    ['a non-integer exam ID', { ...validNotice, exam_id: 1.5 }],
    ['a zero exam ID', { ...validNotice, exam_id: 0 }],
    ['a negative exam ID', { ...validNotice, exam_id: -1 }],
    ['a non-string message', { ...validNotice, message: 123 }],
    ['a blank message', { ...validNotice, message: '   ' }],
    ['an overlong message', { ...validNotice, message: 'x'.repeat(1001) }],
    ['an unsupported placement', { ...validNotice, placement: 'aside' }],
    ['a missing created timestamp', withoutField(validNotice, 'created_at')],
    ['a non-string created timestamp', { ...validNotice, created_at: 123 }],
    ['a blank created timestamp', { ...validNotice, created_at: '   ' }],
    ['a missing updated timestamp', withoutField(validNotice, 'updated_at')],
    ['a non-string updated timestamp', { ...validNotice, updated_at: false }],
    ['a blank updated timestamp', { ...validNotice, updated_at: '' }],
  ])('rejects %s with a safe status-500 ApiError', async (_label, response) => {
    apiRequest.mockResolvedValue(response);
    await expectInvalidResponse(
      getQuestionNotice(validNotice.exam_id, validNotice.question_id),
    );
  });

  test('measures the 1000-character message limit by Unicode character', async () => {
    const supplementaryCharacter = String.fromCodePoint(0x1F600);
    const accepted = { ...validNotice, message: supplementaryCharacter.repeat(1000) };
    const rejected = { ...validNotice, message: supplementaryCharacter.repeat(1001) };
    apiRequest
      .mockResolvedValueOnce(accepted)
      .mockResolvedValueOnce(rejected);

    await expect(getQuestionNotice(validNotice.exam_id, validNotice.question_id))
      .resolves.toEqual(accepted);
    await expectInvalidResponse(
      getQuestionNotice(validNotice.exam_id, validNotice.question_id),
    );
  });
});

describe('question notice API error preservation', () => {
  test('preserves a GET 404 ApiError when no notice exists', async () => {
    const apiError = new ApiError(404, 'Question notice not found.');
    apiRequest.mockRejectedValue(apiError);

    await expect(getQuestionNotice(validNotice.exam_id, validNotice.question_id))
      .rejects.toBe(apiError);
  });

  test('preserves a PUT 409 ApiError for a draft exam', async () => {
    const apiError = new ApiError(409, 'Question notices are available only for published exams.');
    apiRequest.mockRejectedValue(apiError);

    await expect(saveQuestionNotice(
      validNotice.exam_id,
      validNotice.question_id,
      { message: 'Notice', placement: 'above' },
    )).rejects.toBe(apiError);
  });

  test('preserves a DELETE 404 ApiError', async () => {
    const apiError = new ApiError(404, 'Question notice not found.');
    apiRequest.mockRejectedValue(apiError);

    await expect(deleteQuestionNotice(validNotice.exam_id, validNotice.question_id))
      .rejects.toBe(apiError);
  });

  test('rethrows another safe ApiError unchanged', async () => {
    const apiError = new ApiError(401, 'Authentication required.');
    apiRequest.mockRejectedValue(apiError);

    await expect(getQuestionNotice(validNotice.exam_id, validNotice.question_id))
      .rejects.toBe(apiError);
  });
});
