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
  completeLecturerSubmissionGrading,
  getLecturerSubmission,
  listLecturerSubmissions,
  publishLecturerSubmissionResult,
  reopenLecturerSubmissionGrading,
  saveLecturerSubmissionGrading,
} from './lecturerGradingService';
import {
  validateLecturerSubmissionDetail,
  validateLecturerSubmissionList,
} from './lecturerGradingValidation';

vi.mock('./apiClient', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: vi.fn(),
}));

const summary = {
  id: 81,
  exam_id: 31,
  student_id: 42,
  student_username: 'student_one',
  submitted_at: '2026-07-18T08:00:00.000Z',
  grading_state: 'in_progress',
  total_score: null,
  maximum_score: 4,
  percentage: null,
  graded_by: null,
  grading_lecturer_username: null,
  grading_completed_at: null,
  result_published_at: null,
};

const detail = {
  ...summary,
  student: { id: summary.student_id, username: summary.student_username },
  questions: [
    {
      id: 101,
      question_type: 'multiple_choice',
      prompt: 'Choose one',
      position: 1,
      grading_mode: 'automatic',
      is_unanswered: false,
      awarded_points: 1,
      feedback: null,
      submitted_answer: { selected_option_id: 1001 },
      selected_option_id: 1001,
      correct_option_id: 1001,
      options: [
        { id: 1001, text: 'Correct', position: 1, is_correct: true },
        { id: 1002, text: 'Incorrect', position: 2, is_correct: false },
      ],
    },
    {
      id: 102,
      question_type: 'true_false',
      prompt: 'False is correct',
      position: 2,
      grading_mode: 'automatic',
      is_unanswered: false,
      awarded_points: 1,
      feedback: 'Automatic feedback',
      submitted_answer: { boolean_answer: false },
      boolean_answer: false,
      correct_answer: false,
    },
    {
      id: 103,
      question_type: 'short_answer',
      prompt: 'Explain it',
      position: 3,
      grading_mode: 'manual',
      is_unanswered: false,
      awarded_points: null,
      feedback: null,
      submitted_answer: { text_answer: 'Student response' },
      text_answer: 'Student response',
      reference_answer: 'Reference response',
    },
    {
      id: 104,
      question_type: 'short_answer',
      prompt: 'Optional explanation',
      position: 4,
      grading_mode: 'manual',
      is_unanswered: true,
      awarded_points: 0,
      feedback: null,
      submitted_answer: { text_answer: null },
      text_answer: null,
      reference_answer: 'Second reference',
    },
  ],
};

const snapshot = {
  answers: detail.questions.map((question) => ({
    questionId: question.id,
    awardedPoints: question.question_type === 'short_answer'
      ? question.awarded_points
      : null,
    feedback: question.feedback,
  })),
};

const completedAction = {
  id: detail.id,
  exam_id: detail.exam_id,
  grading_state: 'completed',
  total_score: 3.5,
  maximum_score: 4,
  percentage: 87.5,
  graded_by: 19,
  grading_completed_at: '2026-07-18T09:00:00.000Z',
  result_published_at: null,
};

const reopenedAction = {
  id: detail.id,
  exam_id: detail.exam_id,
  grading_state: 'in_progress',
  total_score: null,
  maximum_score: 4,
  percentage: null,
  graded_by: null,
  grading_completed_at: null,
  result_published_at: null,
};

const publishedAction = {
  ...completedAction,
  result_published_at: '2026-07-18T10:30:00.000Z',
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

describe('lecturer grading service requests', () => {
  test('uses authenticated GET requests for list and detail paths', async () => {
    apiRequest.mockResolvedValueOnce([summary]).mockResolvedValueOnce(detail);

    await expect(listLecturerSubmissions(31)).resolves.toEqual([summary]);
    await expect(getLecturerSubmission(31, 81)).resolves.toEqual(detail);
    expect(apiRequest).toHaveBeenNthCalledWith(1, '/exams/31/submissions', { auth: true });
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/exams/31/submissions/81', { auth: true });
  });

  test('serializes the complete draft snapshot with authenticated PUT', async () => {
    apiRequest.mockResolvedValue(detail);
    const withWhitespace = {
      answers: snapshot.answers.map((answer, index) => ({
        ...answer,
        feedback: index === 0 ? '   ' : answer.feedback,
      })),
    };

    await saveLecturerSubmissionGrading(31, 81, withWhitespace);

    expect(apiRequest).toHaveBeenCalledWith('/exams/31/submissions/81/grading', {
      auth: true,
      method: 'PUT',
      body: {
        answers: snapshot.answers,
      },
    });
  });

  test('uses bodyless authenticated POST requests for complete, reopen, and publication', async () => {
    apiRequest
      .mockResolvedValueOnce(completedAction)
      .mockResolvedValueOnce(reopenedAction)
      .mockResolvedValueOnce(publishedAction);

    await completeLecturerSubmissionGrading(31, 81);
    await reopenLecturerSubmissionGrading(31, 81);
    await expect(publishLecturerSubmissionResult(31, 81)).resolves.toEqual(publishedAction);

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      '/exams/31/submissions/81/grading/complete',
      { auth: true, method: 'POST' },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      '/exams/31/submissions/81/grading/reopen',
      { auth: true, method: 'POST' },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      '/exams/31/submissions/81/result/publish',
      { auth: true, method: 'POST' },
    );
    for (const call of apiRequest.mock.calls) {
      if (call[1].method === 'POST') {
        expect(call[1]).not.toHaveProperty('body');
      }
    }
  });

  test.each([
    ['list exam', () => listLecturerSubmissions(0)],
    ['detail exam', () => getLecturerSubmission('31', 81)],
    ['detail submission', () => getLecturerSubmission(31, -1)],
    ['save submission', () => saveLecturerSubmissionGrading(31, 1.5, snapshot)],
    ['complete exam', () => completeLecturerSubmissionGrading(Number.MAX_SAFE_INTEGER, 81)],
    ['reopen submission', () => reopenLecturerSubmissionGrading(31, null)],
    ['publication exam', () => publishLecturerSubmissionResult(-1, 81)],
    ['publication submission', () => publishLecturerSubmissionResult(31, '81')],
  ])('rejects an invalid %s ID before requesting', async (_label, request) => {
    await expect(request()).rejects.toThrow(/positive integer/i);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  test('preserves shared-client status and message errors', async () => {
    const apiError = new ApiError(409, 'Submission result is already published.');
    apiRequest.mockRejectedValue(apiError);
    await expect(publishLecturerSubmissionResult(31, 81)).rejects.toBe(apiError);
  });
});

describe('lecturer grading response validation', () => {
  test('projects known list and detail fields, including lecturer-only correctness data', () => {
    const projectedList = validateLecturerSubmissionList([{ ...summary, ignored: 'field' }]);
    const projectedDetail = validateLecturerSubmissionDetail({
      ...detail,
      ignored: 'field',
      questions: detail.questions.map((question) => ({ ...question, ignored: 'field' })),
    });

    expect(projectedList).toEqual([summary]);
    expect(projectedDetail).toEqual(detail);
    expect(projectedDetail.questions[0].options[0].is_correct).toBe(true);
    expect(projectedDetail.questions[2].reference_answer).toBe('Reference response');
  });

  test('preserves Boolean false and answered-null versus unanswered-zero marks', () => {
    const projected = validateLecturerSubmissionDetail(detail);
    expect(projected.questions[1].boolean_answer).toBe(false);
    expect(projected.questions[1].submitted_answer.boolean_answer).toBe(false);
    expect(projected.questions[2].awarded_points).toBeNull();
    expect(projected.questions[3].awarded_points).toBe(0);
  });

  test.each([
    ['grading state', { ...summary, grading_state: 'pending' }],
    ['numeric total', { ...summary, total_score: '0' }],
    ['numeric maximum', { ...summary, maximum_score: 4.5 }],
    ['numeric percentage', { ...summary, percentage: Number.NaN }],
  ])('rejects malformed %s fields', (_label, malformed) => {
    expect(() => validateLecturerSubmissionList([malformed])).toThrow(ApiError);
  });

  test.each([
    ['question collection', { ...detail, questions: {} }],
    ['question ordering', { ...detail, questions: [...detail.questions].reverse() }],
    ['question type', {
      ...detail,
      questions: detail.questions.map((question, index) => (
        index === 0 ? { ...question, question_type: 'essay' } : question
      )),
    }],
    ['MCQ correctness', {
      ...detail,
      questions: detail.questions.map((question, index) => (
        index === 0 ? { ...question, correct_option_id: 1002 } : question
      )),
    }],
    ['true/false answer consistency', {
      ...detail,
      questions: detail.questions.map((question, index) => (
        index === 1 ? { ...question, is_unanswered: true } : question
      )),
    }],
    ['unanswered short-answer mark', {
      ...detail,
      questions: detail.questions.map((question, index) => (
        index === 3 ? { ...question, awarded_points: 0.5 } : question
      )),
    }],
  ])('rejects malformed %s structures', (_label, malformed) => {
    expect(() => validateLecturerSubmissionDetail(malformed)).toThrow(ApiError);
  });

  test('rejects malformed mutation response states', async () => {
    apiRequest.mockResolvedValue({ ...completedAction, grading_state: 'in_progress' });
    await expect(completeLecturerSubmissionGrading(31, 81)).rejects.toThrow(ApiError);
  });

  test.each([
    ['malformed score', { ...publishedAction, total_score: '3.5' }],
    ['missing publication timestamp', { ...publishedAction, result_published_at: null }],
    ['non-completed state', { ...publishedAction, grading_state: 'in_progress' }],
    ['unexpected field', { ...publishedAction, unexpected: true }],
  ])('rejects a %s publication response', async (_label, malformed) => {
    apiRequest.mockResolvedValue(malformed);
    await expect(publishLecturerSubmissionResult(31, 81)).rejects.toThrow(ApiError);
  });
});

export { completedAction, detail, publishedAction, reopenedAction, snapshot, summary };
