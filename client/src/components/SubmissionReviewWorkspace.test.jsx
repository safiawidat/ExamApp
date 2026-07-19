import {
  act,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { ApiError } from '../api/apiClient';
import {
  completeLecturerSubmissionGrading,
  getLecturerSubmission,
  listLecturerSubmissions,
  reopenLecturerSubmissionGrading,
  saveLecturerSubmissionGrading,
} from '../api/lecturerGradingService';
import SubmissionReviewWorkspace from './SubmissionReviewWorkspace';

vi.mock('../api/lecturerGradingService', () => ({
  completeLecturerSubmissionGrading: vi.fn(),
  getLecturerSubmission: vi.fn(),
  listLecturerSubmissions: vi.fn(),
  reopenLecturerSubmissionGrading: vi.fn(),
  saveLecturerSubmissionGrading: vi.fn(),
}));

const exam = { id: 31, title: 'Algorithms midterm', status: 'published' };
const baseSummary = {
  id: 81,
  exam_id: exam.id,
  student_id: 42,
  student_username: 'student_one',
  submitted_at: '2026-07-18T08:00:00.000Z',
  grading_state: 'ungraded',
  total_score: null,
  maximum_score: 4,
  percentage: null,
  graded_by: null,
  grading_lecturer_username: null,
  grading_completed_at: null,
  result_published_at: null,
};

const inProgressSummary = {
  ...baseSummary,
  id: 82,
  student_id: 43,
  student_username: 'student_two',
  grading_state: 'in_progress',
};

const completedSummary = {
  ...baseSummary,
  id: 83,
  student_id: 44,
  student_username: 'student_three',
  grading_state: 'completed',
  total_score: 3.5,
  percentage: 87.5,
  graded_by: 19,
  grading_lecturer_username: 'lecturer_one',
  grading_completed_at: '2026-07-18T09:00:00.000Z',
};

const questions = [
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
      { id: 1001, text: 'Correct choice', position: 1, is_correct: true },
      { id: 1002, text: 'Wrong choice', position: 2, is_correct: false },
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
    feedback: null,
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
];

const detailFor = (summary = baseSummary) => ({
  ...summary,
  student: { id: summary.student_id, username: summary.student_username },
  questions: questions.map((question) => ({ ...question })),
});

const completedAction = {
  id: baseSummary.id,
  exam_id: exam.id,
  grading_state: 'completed',
  total_score: 3.75,
  maximum_score: 4,
  percentage: 93.75,
  graded_by: 19,
  grading_completed_at: '2026-07-18T10:00:00.000Z',
  result_published_at: null,
};

const reopenedAction = {
  id: baseSummary.id,
  exam_id: exam.id,
  grading_state: 'in_progress',
  total_score: null,
  maximum_score: 4,
  percentage: null,
  graded_by: null,
  grading_completed_at: null,
  result_published_at: null,
};

const deferred = () => {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

const renderWorkspace = (props = {}) => render(
  <SubmissionReviewWorkspace exam={exam} onBack={vi.fn()} {...props} />,
);

const openFirstSubmission = async (summary = baseSummary, detail = detailFor(summary)) => {
  listLecturerSubmissions.mockResolvedValue([summary]);
  getLecturerSubmission.mockResolvedValue(detail);
  const user = userEvent.setup();
  renderWorkspace();
  await user.click(await screen.findByRole('button', {
    name: `Review grading for ${summary.student_username}`,
  }));
  await screen.findByRole('heading', { name: `Grade ${summary.student_username}` });
  return user;
};

beforeEach(() => {
  vi.clearAllMocks();
  listLecturerSubmissions.mockResolvedValue([]);
});

describe('lecturer submission list', () => {
  test('shows loading, then the empty state and refresh action', async () => {
    const request = deferred();
    listLecturerSubmissions.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderWorkspace();

    expect(screen.getByRole('status')).toHaveTextContent('Loading submissions');
    await act(async () => request.resolve([]));
    expect(await screen.findByText('No submissions have been received yet.'))
      .toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(listLecturerSubmissions).toHaveBeenCalledTimes(2);
    expect(listLecturerSubmissions).toHaveBeenLastCalledWith(exam.id);
  });

  test('renders human-readable ungraded, in-progress, completed, and publication states', async () => {
    listLecturerSubmissions.mockResolvedValue([
      baseSummary,
      inProgressSummary,
      completedSummary,
      { ...completedSummary, id: 84, student_username: 'published_student', result_published_at: '2026-07-18T11:00:00.000Z' },
    ]);
    renderWorkspace();

    const list = await screen.findByRole('region', { name: 'Submissions' });
    expect(within(list).getAllByText('Not graded').length).toBeGreaterThan(0);
    expect(within(list).getAllByText('In progress').length).toBeGreaterThan(0);
    expect(within(list).getAllByText('Completed').length).toBeGreaterThan(0);
    expect(within(list).getAllByText('3.5 / 4 (87.5%)').length).toBe(2);
    expect(within(list).getAllByText('Not published').length).toBe(3);
    expect(within(list).getByText('Published to student')).toBeInTheDocument();
  });

  test('opens a selected submission and does not display stale list data while loading', async () => {
    const detailRequest = deferred();
    listLecturerSubmissions.mockResolvedValue([baseSummary]);
    getLecturerSubmission.mockReturnValue(detailRequest.promise);
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(await screen.findByRole('button', {
      name: `Review grading for ${baseSummary.student_username}`,
    }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading submission');
    expect(screen.queryByText('No submissions have been received yet.')).not.toBeInTheDocument();

    await act(async () => detailRequest.resolve(detailFor()));
    expect(await screen.findByRole('heading', { name: 'Grade student_one' }))
      .toBeInTheDocument();
    expect(getLecturerSubmission).toHaveBeenCalledWith(exam.id, baseSummary.id);
  });

  test('shows a safe server error and retries the list', async () => {
    listLecturerSubmissions
      .mockRejectedValueOnce(new ApiError(503, 'Grading service unavailable.'))
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderWorkspace();

    expect(await screen.findByRole('alert')).toHaveTextContent('Grading service unavailable.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No submissions have been received yet.'))
      .toBeInTheDocument();
  });
});

describe('submission detail and draft grading', () => {
  test('renders MCQ selected/correct labels, false answers, and short-answer states', async () => {
    await openFirstSubmission();

    expect(screen.getByText(/Correct choice/)).toHaveTextContent('Selected answer; Correct answer');
    expect(screen.getAllByText('False')).toHaveLength(2);
    expect(screen.getByText('Student response')).toBeInTheDocument();
    expect(screen.getByText('Reference response')).toBeInTheDocument();
    expect(screen.getByText('Unanswered')).toBeInTheDocument();
    expect(screen.getAllByText('1 / 1')).toHaveLength(2);
    expect(screen.getByText('0 / 1')).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
    expect(screen.getByLabelText('Awarded mark for question 3 (0–1)')).toHaveValue(null);
  });

  test('accepts zero and partial credit, normalizes feedback, and saves every question', async () => {
    const user = await openFirstSubmission();
    const mark = screen.getByLabelText('Awarded mark for question 3 (0–1)');
    await user.type(mark, '0');
    await user.type(screen.getByLabelText('Lecturer feedback for question 1'), '   ');
    await user.type(screen.getByLabelText('Lecturer feedback for question 3'), 'Helpful explanation');
    const saved = detailFor({ ...baseSummary, grading_state: 'in_progress' });
    saved.questions[2].awarded_points = 0;
    saved.questions[2].feedback = 'Helpful explanation';
    saveLecturerSubmissionGrading.mockResolvedValue(saved);

    await user.click(screen.getByRole('button', { name: 'Save grading' }));

    expect(saveLecturerSubmissionGrading).toHaveBeenCalledWith(exam.id, baseSummary.id, {
      answers: [
        { questionId: 101, awardedPoints: null, feedback: null },
        { questionId: 102, awardedPoints: null, feedback: null },
        { questionId: 103, awardedPoints: 0, feedback: 'Helpful explanation' },
        { questionId: 104, awardedPoints: 0, feedback: null },
      ],
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Grading draft saved.');
    expect(mark).toHaveValue(0);

    await user.clear(mark);
    await user.type(mark, '0.625');
    saved.questions[2].awarded_points = 0.625;
    saveLecturerSubmissionGrading.mockResolvedValue(saved);
    await user.click(screen.getByRole('button', { name: 'Save grading' }));
    expect(saveLecturerSubmissionGrading.mock.calls[1][2].answers[2].awardedPoints).toBe(0.625);
  });

  test('blocks invalid marks and exposes the 5,000-character feedback limit', async () => {
    const user = await openFirstSubmission();
    const mark = screen.getByLabelText('Awarded mark for question 3 (0–1)');
    await user.type(mark, '1.5');
    await user.click(screen.getByRole('button', { name: 'Save grading' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('between 0 and 1');
    expect(saveLecturerSubmissionGrading).not.toHaveBeenCalled();
    const feedback = screen.getByLabelText('Lecturer feedback for question 3');
    expect(feedback).toHaveAttribute('maxlength', '5000');
    expect(screen.getAllByText('0 / 5000 characters')).toHaveLength(4);
  });

  test('locks all grading actions while saving and replaces form state from the server', async () => {
    const user = await openFirstSubmission();
    const request = deferred();
    saveLecturerSubmissionGrading.mockReturnValue(request.promise);
    const mark = screen.getByLabelText('Awarded mark for question 3 (0–1)');
    await user.type(mark, '0.5');
    await user.click(screen.getByRole('button', { name: 'Save grading' }));

    expect(screen.getByRole('button', { name: 'Saving grading…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Complete grading' })).toBeDisabled();
    expect(mark).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Saving grading…' }));
    expect(saveLecturerSubmissionGrading).toHaveBeenCalledTimes(1);

    const saved = detailFor({ ...baseSummary, grading_state: 'in_progress' });
    saved.questions[2].awarded_points = 0.75;
    saved.questions[2].feedback = 'Server-normalized feedback';
    await act(async () => request.resolve(saved));
    expect(await screen.findByRole('status')).toHaveTextContent('Grading draft saved.');
    expect(mark).toHaveValue(0.75);
    expect(screen.getByLabelText('Lecturer feedback for question 3'))
      .toHaveValue('Server-normalized feedback');
  });
});

describe('completion, reopening, and unsaved work', () => {
  test('blocks completion until answered short answers are marked', async () => {
    const user = await openFirstSubmission();
    await user.click(screen.getByRole('button', { name: 'Complete grading' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Every answered short-answer question needs a mark',
    );
    expect(screen.queryByRole('button', { name: 'Confirm completion' }))
      .not.toBeInTheDocument();
    expect(completeLecturerSubmissionGrading).not.toHaveBeenCalled();
  });

  test('requires confirmation, saves dirty grading, then shows completed read-only totals', async () => {
    const user = await openFirstSubmission();
    await user.type(screen.getByLabelText('Awarded mark for question 3 (0–1)'), '0.75');
    const saved = detailFor({ ...baseSummary, grading_state: 'in_progress' });
    saved.questions[2].awarded_points = 0.75;
    saveLecturerSubmissionGrading.mockResolvedValue(saved);
    completeLecturerSubmissionGrading.mockResolvedValue(completedAction);

    await user.click(screen.getByRole('button', { name: 'Complete grading' }));
    expect(screen.getByRole('alert')).toHaveTextContent('does not publish the result');
    expect(completeLecturerSubmissionGrading).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm completion' }));

    expect(saveLecturerSubmissionGrading).toHaveBeenCalledTimes(1);
    expect(completeLecturerSubmissionGrading).toHaveBeenCalledWith(exam.id, baseSummary.id);
    expect(await screen.findByText(/3.75 \/ 4/)).toBeInTheDocument();
    expect(screen.getByText(/93.75%/)).toBeInTheDocument();
    expect(screen.getByLabelText('Awarded mark for question 3 (0–1)')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Complete grading' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish result/i })).not.toBeInTheDocument();
  });

  test('reopens unpublished completion only after confirmation and preserves grading', async () => {
    const completedDetail = detailFor(completedSummary);
    completedDetail.questions[2].awarded_points = 0.5;
    completedDetail.questions[2].feedback = 'Keep this feedback';
    const user = await openFirstSubmission(completedSummary, completedDetail);
    reopenLecturerSubmissionGrading.mockResolvedValue({
      ...reopenedAction,
      id: completedSummary.id,
    });

    await user.click(screen.getByRole('button', { name: 'Reopen grading' }));
    expect(reopenLecturerSubmissionGrading).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm reopening' }));

    expect(reopenLecturerSubmissionGrading).toHaveBeenCalledWith(exam.id, completedSummary.id);
    expect(await screen.findByRole('status')).toHaveTextContent('Existing marks and feedback were preserved');
    expect(screen.getByLabelText('Awarded mark for question 3 (0–1)')).toHaveValue(0.5);
    expect(screen.getByLabelText('Lecturer feedback for question 3'))
      .toHaveValue('Keep this feedback');
    expect(screen.getByRole('button', { name: 'Save grading' })).toBeEnabled();
  });

  test('does not offer reopening for a published result', async () => {
    const published = {
      ...completedSummary,
      result_published_at: '2026-07-18T11:00:00.000Z',
    };
    await openFirstSubmission(published, detailFor(published));
    expect(screen.getByText(/published to the student.*cannot be reopened/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reopen grading' })).not.toBeInTheDocument();
  });

  test('requires confirmation before switching submissions and cancel retains work', async () => {
    listLecturerSubmissions.mockResolvedValue([baseSummary, inProgressSummary]);
    getLecturerSubmission
      .mockResolvedValueOnce(detailFor())
      .mockResolvedValueOnce(detailFor(inProgressSummary));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: 'Review grading for student_one' }));
    await user.type(await screen.findByLabelText('Awarded mark for question 3 (0–1)'), '0.5');

    await user.selectOptions(screen.getByLabelText('Choose submission'), String(inProgressSummary.id));
    expect(confirmSpy).toHaveBeenCalledWith('Discard unsaved grading changes?');
    expect(screen.getByRole('heading', { name: 'Grade student_one' })).toBeInTheDocument();
    expect(screen.getByLabelText('Awarded mark for question 3 (0–1)')).toHaveValue(0.5);
    expect(getLecturerSubmission).toHaveBeenCalledTimes(1);

    await user.selectOptions(screen.getByLabelText('Choose submission'), String(inProgressSummary.id));
    expect(await screen.findByRole('heading', { name: 'Grade student_two' })).toBeInTheDocument();
    expect(getLecturerSubmission).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });

  test('requires confirmation before leaving detail and the workspace', async () => {
    const onBack = vi.fn();
    listLecturerSubmissions.mockResolvedValue([baseSummary]);
    getLecturerSubmission.mockResolvedValue(detailFor());
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = userEvent.setup();
    renderWorkspace({ onBack });
    await user.click(await screen.findByRole('button', { name: 'Review grading for student_one' }));
    await user.type(await screen.findByLabelText('Awarded mark for question 3 (0–1)'), '0.25');

    await user.click(screen.getByRole('button', { name: 'Back to submissions' }));
    expect(screen.getByRole('heading', { name: 'Grade student_one' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to submissions' }));
    expect(await screen.findByRole('heading', { name: 'Submission review' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to exams' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});
