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
  createExamType,
  deleteExamType,
  listExamTypes,
  updateExamType,
} from './examTypeService';

vi.mock('./apiClient', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: vi.fn(),
}));

const examType = {
  id: 7,
  name: 'Algorithms',
  description: null,
  created_by: 19,
  created_at: '2026-07-15T08:00:00.000Z',
  updated_at: '2026-07-15T08:00:00.000Z',
};

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

describe('exam type service requests', () => {
  test('lists exam types with authenticated GET and maps valid nullable fields', async () => {
    apiRequest.mockResolvedValue([examType]);

    await expect(listExamTypes()).resolves.toEqual([examType]);
    expect(apiRequest).toHaveBeenCalledWith('/exam-types', { auth: true });
  });

  test('creates an exam type with the supplied payload', async () => {
    const payload = { name: 'Algorithms', description: null };
    apiRequest.mockResolvedValue(examType);

    await expect(createExamType(payload)).resolves.toEqual(examType);
    expect(apiRequest).toHaveBeenCalledWith('/exam-types', {
      auth: true,
      method: 'POST',
      body: payload,
    });
  });

  test('updates an exam type with its ID and supplied patch', async () => {
    const payload = { description: 'Updated description' };
    const updated = { ...examType, description: payload.description };
    apiRequest.mockResolvedValue(updated);

    await expect(updateExamType(examType.id, payload)).resolves.toEqual(updated);
    expect(apiRequest).toHaveBeenCalledWith(`/exam-types/${examType.id}`, {
      auth: true,
      method: 'PATCH',
      body: payload,
    });
  });

  test('handles an empty 204 response when deleting an exam type', async () => {
    apiRequest.mockResolvedValue(null);

    await deleteExamType(examType.id);
    expect(apiRequest).toHaveBeenCalledWith(`/exam-types/${examType.id}`, {
      auth: true,
      method: 'DELETE',
    });
  });
});

describe('exam type response safety', () => {
  test.each([
    ['a non-array list', () => listExamTypes(), { exam_types: [examType] }],
    ['a malformed list item', () => listExamTypes(), [{ ...examType, created_by: null }]],
    ['a malformed create response', () => createExamType({ name: 'Algorithms' }), null],
    ['a malformed update response', () => updateExamType(7, { name: 'Updated' }), { ...examType, id: 0 }],
  ])('rejects %s', async (_label, requestService, response) => {
    apiRequest.mockResolvedValue(response);
    await expectInvalidResponse(requestService());
  });

  test('preserves safe API errors from the shared client', async () => {
    const apiError = new ApiError(409, 'Exam types in use by an exam cannot be deleted.');
    apiRequest.mockRejectedValue(apiError);

    await expect(deleteExamType(examType.id)).rejects.toBe(apiError);
  });
});
