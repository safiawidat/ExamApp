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
  createLecturerExam,
  deleteLecturerExam,
  getLecturerExam,
  listLecturerExams,
  updateLecturerExam,
} from './lecturerExamService';

vi.mock('./apiClient', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: vi.fn(),
}));

const exam = {
  id: 31,
  lecturer_id: 19,
  exam_type_id: 7,
  title: 'Algorithms midterm',
  description: null,
  status: 'draft',
  created_at: '2026-07-15T08:00:00.000Z',
  updated_at: '2026-07-15T09:00:00.000Z',
  published_at: null,
  exam_type: {
    id: 7,
    name: 'Algorithms',
  },
  question_count: 0,
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

describe('lecturer exam service requests', () => {
  test('lists lecturer exams with authenticated GET and maps valid projections', async () => {
    apiRequest.mockResolvedValue([exam]);

    await expect(listLecturerExams()).resolves.toEqual([exam]);
    expect(apiRequest).toHaveBeenCalledWith('/exams', { auth: true });
  });

  test('creates a lecturer exam with the supplied payload', async () => {
    const payload = {
      exam_type_id: exam.exam_type_id,
      title: exam.title,
      description: exam.description,
    };
    apiRequest.mockResolvedValue(exam);

    await expect(createLecturerExam(payload)).resolves.toEqual(exam);
    expect(apiRequest).toHaveBeenCalledWith('/exams', {
      auth: true,
      method: 'POST',
      body: payload,
    });
  });

  test('gets one lecturer exam by ID with authenticated GET', async () => {
    apiRequest.mockResolvedValue(exam);

    await expect(getLecturerExam(exam.id)).resolves.toEqual(exam);
    expect(apiRequest).toHaveBeenCalledWith(`/exams/${exam.id}`, { auth: true });
  });

  test('updates a lecturer exam with its ID and supplied patch', async () => {
    const payload = { title: 'Updated algorithms midterm' };
    const updated = { ...exam, title: payload.title };
    apiRequest.mockResolvedValue(updated);

    await expect(updateLecturerExam(exam.id, payload)).resolves.toEqual(updated);
    expect(apiRequest).toHaveBeenCalledWith(`/exams/${exam.id}`, {
      auth: true,
      method: 'PATCH',
      body: payload,
    });
  });

  test('handles an empty 204 response when deleting a lecturer exam', async () => {
    apiRequest.mockResolvedValue(null);

    await deleteLecturerExam(exam.id);
    expect(apiRequest).toHaveBeenCalledWith(`/exams/${exam.id}`, {
      auth: true,
      method: 'DELETE',
    });
  });
});

describe('lecturer exam response safety', () => {
  test.each([
    ['a non-array list', () => listLecturerExams(), { exams: [exam] }],
    ['a malformed list item', () => listLecturerExams(), [{ ...exam, question_count: -1 }]],
    ['a malformed create response', () => createLecturerExam({}), null],
    ['a malformed read response', () => getLecturerExam(31), { ...exam, exam_type: null }],
    ['a malformed update response', () => updateLecturerExam(31, { title: 'Updated' }), { ...exam, status: 'unknown' }],
  ])('rejects %s', async (_label, requestService, response) => {
    apiRequest.mockResolvedValue(response);
    await expectInvalidResponse(requestService());
  });

  test('preserves safe API errors from the shared client', async () => {
    const apiError = new ApiError(404, 'Exam not found.');
    apiRequest.mockRejectedValue(apiError);

    await expect(getLecturerExam(exam.id)).rejects.toBe(apiError);
  });
});
