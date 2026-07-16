import {
  act,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api/apiClient';
import {
  getStudentExam,
  listStudentExams,
  submitStudentExam,
} from '../api/studentExamService';
import StudentPortal from './StudentPortal';

const studentFormDouble = vi.hoisted(() => ({
  answers: [
    { question_id: 101, text_answer: '  O(n log n)  ' },
    { question_id: 102, selected_option_id: 201 },
    { question_id: 103, boolean_answer: false },
  ],
}));

vi.mock('../api/studentExamService', () => ({
  getStudentExam: vi.fn(),
  listStudentExams: vi.fn(),
  submitStudentExam: vi.fn(),
}));

vi.mock('./StudentForm', () => ({
  default: ({
    exam,
    onSubmitExam,
    onCancel,
    isSubmitting,
    submissionError,
  }) => (
    <section aria-label="Student form test double">
      <h2>Selected exam: {exam.title}</h2>
      <p>Selected question count: {exam.questions.length}</p>
      <p>{isSubmitting ? 'Form is submitting' : 'Form is editable'}</p>
      {submissionError && <div role="alert">{submissionError}</div>}
      <button
        type="button"
        onClick={() => onSubmitExam(studentFormDouble.answers)}
        disabled={isSubmitting}
      >
        Submit Test Answers
      </button>
      <button
        type="button"
        onClick={() => {
          onSubmitExam(studentFormDouble.answers);
          onSubmitExam(studentFormDouble.answers);
        }}
        disabled={isSubmitting}
      >
        Submit Test Answers Twice
      </button>
      <button type="button" onClick={onCancel} disabled={isSubmitting}>
        Back from Test Form
      </button>
    </section>
  ),
}));

const catalogExams = [
  {
    id: 31,
    title: 'Algorithms midterm',
    description: 'A published student exam.',
    published_at: '2026-07-15T10:00:00.000Z',
    exam_type: { id: 7, name: 'Algorithms' },
    question_count: 3,
    total_points: 12,
    has_submitted: false,
  },
  {
    id: 33,
    title: 'Networks quiz',
    description: null,
    published_at: '2026-07-14T11:00:00.000Z',
    exam_type: { id: 9, name: 'Networking' },
    question_count: 4,
    total_points: 20,
    has_submitted: false,
  },
  {
    id: 32,
    title: 'Databases quiz',
    description: 'Already completed.',
    published_at: '2026-07-14T10:00:00.000Z',
    exam_type: { id: 8, name: 'Databases' },
    question_count: 2,
    total_points: 8,
    has_submitted: true,
  },
];

const completeExam = {
  ...catalogExams[0],
  questions: [
    {
      id: 101,
      question_type: 'short_answer',
      prompt: 'Explain the runtime.',
      points: 4,
      position: 1,
    },
    {
      id: 102,
      question_type: 'multiple_choice',
      prompt: 'Choose the stable sort.',
      points: 5,
      position: 2,
      options: [
        { id: 201, text: 'Merge sort', position: 1 },
        { id: 202, text: 'Selection sort', position: 2 },
      ],
    },
    {
      id: 103,
      question_type: 'true_false',
      prompt: 'Binary search requires sorted input.',
      points: 3,
      position: 3,
    },
  ],
};

const refreshedCatalog = [
  {
    ...catalogExams[0],
    title: 'Algorithms midterm refreshed',
    has_submitted: true,
  },
  catalogExams[1],
  catalogExams[2],
];

const submissionConfirmation = {
  id: 501,
  exam_id: completeExam.id,
  submitted_at: '2026-07-16T09:00:00.000Z',
  answer_count: studentFormDouble.answers.length,
};

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const settle = async (callback) => {
  await act(async () => {
    callback();
    await Promise.resolve();
  });
};

const examCard = (title) => screen.getByRole('article', { name: title });

const takeExamButton = (title) => (
  within(examCard(title)).getByRole('button', { name: 'Take Exam' })
);

const renderCatalog = async (exams = catalogExams) => {
  listStudentExams.mockResolvedValueOnce(exams);
  render(<StudentPortal />);
  await screen.findByRole('heading', { name: 'Available Exams' });
};

const openCompleteExam = async (user) => {
  getStudentExam.mockResolvedValueOnce(completeExam);
  await user.click(takeExamButton(catalogExams[0].title));
  await screen.findByRole('heading', { name: `Selected exam: ${completeExam.title}` });
};

beforeEach(() => {
  vi.clearAllMocks();
  studentFormDouble.answers = [
    { question_id: 101, text_answer: '  O(n log n)  ' },
    { question_id: 102, selected_option_id: 201 },
    { question_id: 103, boolean_answer: false },
  ];
});

describe('StudentPortal catalog loading', () => {
  test('loads the catalog once on mount and shows an accessible pending status', async () => {
    const request = createDeferred();
    listStudentExams.mockReturnValueOnce(request.promise);

    render(<StudentPortal />);

    expect(screen.getByRole('heading', { name: 'Student Portal', level: 1 }))
      .toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading available exams...');
    expect(screen.queryByText('No published exams are available.')).not.toBeInTheDocument();
    expect(listStudentExams).toHaveBeenCalledTimes(1);

    await settle(() => request.resolve(catalogExams));
    expect(await screen.findByRole('heading', { name: 'Available Exams' })).toBeInTheDocument();
  });

  test('renders catalog cards in server order with catalog metadata and fallback text', async () => {
    await renderCatalog();

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent))
      .toEqual(['Algorithms midterm', 'Networks quiz', 'Databases quiz']);

    const algorithmsCard = examCard('Algorithms midterm');
    expect(algorithmsCard).toHaveTextContent('A published student exam.');
    expect(algorithmsCard).toHaveTextContent('Exam type: Algorithms');
    expect(algorithmsCard).toHaveTextContent('Questions: 3');
    expect(algorithmsCard).toHaveTextContent('Total points: 12');

    const networksCard = examCard('Networks quiz');
    expect(networksCard).toHaveTextContent('No description provided.');
    expect(networksCard).toHaveTextContent('Questions: 4');
    expect(networksCard).toHaveTextContent('Total points: 20');
    expect(screen.queryByRole('textbox', { name: /student name/i })).not.toBeInTheDocument();
  });

  test('renders the empty state only after a successful empty response', async () => {
    await renderCatalog([]);

    expect(screen.getByRole('heading', { name: 'Available Exams' })).toBeInTheDocument();
    expect(screen.getByText('No published exams are available.')).toBeInTheDocument();
  });

  test('preserves an exact API error and retries successfully', async () => {
    const user = userEvent.setup();
    listStudentExams
      .mockRejectedValueOnce(new ApiError(401, 'Authentication is required.'))
      .mockResolvedValueOnce(catalogExams);

    render(<StudentPortal />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication is required.');
    expect(screen.queryByText('No published exams are available.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry Exam List' }));

    expect(listStudentExams).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('heading', { name: 'Available Exams' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('uses the generic catalog fallback for a non-API error', async () => {
    listStudentExams.mockRejectedValueOnce(new Error('Private implementation detail'));

    render(<StudentPortal />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load available exams.');
    expect(screen.queryByText('Private implementation detail')).not.toBeInTheDocument();
  });
});

describe('StudentPortal exam opening', () => {
  test('keeps submitted exams disabled and never requests their detail', async () => {
    const user = userEvent.setup();
    await renderCatalog();

    const submittedButton = within(examCard('Databases quiz'))
      .getByRole('button', { name: 'Submitted' });
    expect(submittedButton).toBeDisabled();
    await user.click(submittedButton);
    expect(getStudentExam).not.toHaveBeenCalled();
  });

  test('loads complete detail with one pending opener and passes only the response to the form', async () => {
    const user = userEvent.setup();
    const request = createDeferred();
    getStudentExam.mockReturnValueOnce(request.promise);
    await renderCatalog();

    await user.click(takeExamButton('Algorithms midterm'));

    expect(getStudentExam).toHaveBeenCalledTimes(1);
    expect(getStudentExam).toHaveBeenCalledWith(31);
    expect(screen.queryByLabelText('Student form test double')).not.toBeInTheDocument();
    expect(within(examCard('Algorithms midterm')).getByRole('button', { name: 'Opening...' }))
      .toBeDisabled();
    expect(takeExamButton('Networks quiz')).toBeDisabled();
    await user.click(within(examCard('Algorithms midterm')).getByRole('button', {
      name: 'Opening...',
    }));
    expect(getStudentExam).toHaveBeenCalledTimes(1);

    await settle(() => request.resolve(completeExam));

    expect(await screen.findByRole('heading', {
      name: 'Selected exam: Algorithms midterm',
    })).toBeInTheDocument();
    expect(screen.getByText('Selected question count: 3')).toBeInTheDocument();
  });

  test('shows a safe detail error and permits retry', async () => {
    const user = userEvent.setup();
    getStudentExam
      .mockRejectedValueOnce(new ApiError(403, 'You cannot access this exam.'))
      .mockResolvedValueOnce(completeExam);
    await renderCatalog();

    await user.click(takeExamButton('Algorithms midterm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot access this exam.');
    expect(screen.getByRole('heading', { name: 'Available Exams' })).toBeInTheDocument();

    await user.click(takeExamButton('Algorithms midterm'));
    expect(getStudentExam).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText('Student form test double')).toBeInTheDocument();
  });

  test('uses a newer submitted detail to lock the local card without opening the form', async () => {
    const user = userEvent.setup();
    getStudentExam.mockResolvedValueOnce({ ...completeExam, has_submitted: true });
    await renderCatalog();

    await user.click(takeExamButton('Algorithms midterm'));

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('This exam has already been submitted.');
    expect(screen.queryByLabelText('Student form test double')).not.toBeInTheDocument();
    expect(within(examCard('Algorithms midterm')).getByRole('button', { name: 'Submitted' }))
      .toBeDisabled();
  });

  test('Back returns to the existing catalog without submitting or reloading', async () => {
    const user = userEvent.setup();
    await renderCatalog();
    await openCompleteExam(user);

    await user.click(screen.getByRole('button', { name: 'Back from Test Form' }));

    expect(screen.getByRole('heading', { name: 'Available Exams' })).toBeInTheDocument();
    expect(examCard('Algorithms midterm')).toBeInTheDocument();
    expect(submitStudentExam).not.toHaveBeenCalled();
    expect(listStudentExams).toHaveBeenCalledTimes(1);
  });
});

describe('StudentPortal submission workflow', () => {
  test('passes the same answer array once and exposes pending state during duplicate attempts', async () => {
    const user = userEvent.setup();
    const submission = createDeferred();
    const refresh = createDeferred();
    const originalAnswers = structuredClone(studentFormDouble.answers);
    submitStudentExam.mockReturnValueOnce(submission.promise);
    await renderCatalog();
    await openCompleteExam(user);

    await user.click(screen.getByRole('button', { name: 'Submit Test Answers Twice' }));

    expect(submitStudentExam).toHaveBeenCalledTimes(1);
    expect(submitStudentExam).toHaveBeenCalledWith(31, studentFormDouble.answers);
    expect(submitStudentExam.mock.calls[0][1]).toBe(studentFormDouble.answers);
    expect(studentFormDouble.answers).toEqual(originalAnswers);
    expect(screen.getByText('Form is submitting')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Test Answers' })).toBeDisabled();

    listStudentExams.mockReturnValueOnce(refresh.promise);
    await settle(() => submission.resolve(submissionConfirmation));
    expect(await screen.findByText('Exam submitted successfully.')).toBeInTheDocument();
    await settle(() => refresh.resolve(refreshedCatalog));
  });

  test('keeps the form open with an exact safe error and allows a later retry', async () => {
    const user = userEvent.setup();
    submitStudentExam
      .mockRejectedValueOnce(new ApiError(409, 'Exam has already been submitted.'))
      .mockResolvedValueOnce(submissionConfirmation);
    await renderCatalog();
    await openCompleteExam(user);

    await user.click(screen.getByRole('button', { name: 'Submit Test Answers' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Exam has already been submitted.');
    expect(screen.getByLabelText('Student form test double')).toBeInTheDocument();
    expect(screen.getByText('Form is editable')).toBeInTheDocument();
    expect(screen.queryByText('Exam submitted successfully.')).not.toBeInTheDocument();
    expect(listStudentExams).toHaveBeenCalledTimes(1);

    listStudentExams.mockResolvedValueOnce(refreshedCatalog);
    await user.click(screen.getByRole('button', { name: 'Submit Test Answers' }));
    expect(submitStudentExam).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Exam submitted successfully.')).toBeInTheDocument();
  });

  test('uses the generic submission fallback and Back clears it without service side effects', async () => {
    const user = userEvent.setup();
    submitStudentExam.mockRejectedValueOnce(new Error('Private failure detail'));
    await renderCatalog();
    await openCompleteExam(user);

    await user.click(screen.getByRole('button', { name: 'Submit Test Answers' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to submit the exam.');
    expect(screen.queryByText('Private failure detail')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back from Test Form' }));
    expect(screen.getByRole('heading', { name: 'Available Exams' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(submitStudentExam).toHaveBeenCalledTimes(1);
    expect(listStudentExams).toHaveBeenCalledTimes(1);
  });

  test('closes after success, locks locally, and replaces the catalog after refresh', async () => {
    const user = userEvent.setup();
    const submission = createDeferred();
    const refresh = createDeferred();
    submitStudentExam.mockReturnValueOnce(submission.promise);
    await renderCatalog();
    await openCompleteExam(user);

    await user.click(screen.getByRole('button', { name: 'Submit Test Answers' }));
    listStudentExams.mockReturnValueOnce(refresh.promise);
    await settle(() => submission.resolve(submissionConfirmation));

    expect(screen.queryByLabelText('Student form test double')).not.toBeInTheDocument();
    expect(screen.getByText('Exam submitted successfully.')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Refreshing exam list...')).toBeInTheDocument();
    expect(within(examCard('Algorithms midterm')).getByRole('button', { name: 'Submitted' }))
      .toBeDisabled();
    expect(listStudentExams).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('501')).not.toBeInTheDocument();
    expect(screen.queryByText('2026-07-16T09:00:00.000Z')).not.toBeInTheDocument();
    expect(screen.queryByText(/answer count/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/feedback/i)).not.toBeInTheDocument();

    await settle(() => refresh.resolve(refreshedCatalog));
    expect(await screen.findByRole('article', { name: 'Algorithms midterm refreshed' }))
      .toBeInTheDocument();
    expect(within(examCard('Algorithms midterm refreshed'))
      .getByRole('button', { name: 'Submitted' })).toBeDisabled();
    expect(screen.getByText('Exam submitted successfully.')).toBeInTheDocument();
  });

  test('separates refresh failure from success and retries only the catalog', async () => {
    const user = userEvent.setup();
    submitStudentExam.mockResolvedValueOnce(submissionConfirmation);
    await renderCatalog();
    await openCompleteExam(user);
    listStudentExams.mockRejectedValueOnce(new Error('Refresh unavailable'));

    await user.click(screen.getByRole('button', { name: 'Submit Test Answers' }));

    expect(await screen.findByText('Exam submitted successfully.')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Exam submitted successfully, but the exam list could not be refreshed.',
    );
    expect(within(examCard('Algorithms midterm')).getByRole('button', { name: 'Submitted' }))
      .toBeDisabled();
    expect(screen.queryByLabelText('Student form test double')).not.toBeInTheDocument();
    expect(submitStudentExam).toHaveBeenCalledTimes(1);

    listStudentExams.mockResolvedValueOnce(refreshedCatalog);
    await user.click(screen.getByRole('button', { name: 'Retry Exam List' }));

    await waitFor(() => {
      expect(screen.queryByText(
        'Exam submitted successfully, but the exam list could not be refreshed.',
      )).not.toBeInTheDocument();
    });
    expect(screen.getByText('Exam submitted successfully.')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Algorithms midterm refreshed' }))
      .toBeInTheDocument();
    expect(listStudentExams).toHaveBeenCalledTimes(3);
    expect(submitStudentExam).toHaveBeenCalledTimes(1);
  });
});
