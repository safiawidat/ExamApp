import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import StudentResult from './StudentResult';

const exam = { id: 31, title: 'Algorithms midterm' };
const result = {
  exam_id: 31,
  exam_title: 'Algorithms midterm',
  submission_id: 501,
  submitted_at: '2026-07-16T09:00:00.000Z',
  result_published_at: '2026-07-18T12:00:00.000Z',
  total_score: 1.5,
  maximum_score: 4,
  percentage: 37.5,
  questions: [
    {
      id: 101,
      position: 1,
      question_type: 'multiple_choice',
      prompt: 'Choose the stable sort.',
      is_unanswered: false,
      awarded_points: 0,
      maximum_points: 1,
      feedback: null,
      selected_option_id: 201,
      correct_option_id: 202,
      options: [
        { id: 201, text: 'Student selection', position: 1 },
        { id: 202, text: 'Correct selection', position: 2 },
      ],
    },
    {
      id: 102,
      position: 2,
      question_type: 'true_false',
      prompt: 'The submitted answer is false.',
      is_unanswered: false,
      awarded_points: 1,
      maximum_points: 1,
      feedback: 'False was preserved.',
      boolean_answer: false,
      correct_answer: false,
    },
    {
      id: 103,
      position: 3,
      question_type: 'short_answer',
      prompt: 'Explain the runtime.',
      is_unanswered: false,
      awarded_points: 0.5,
      maximum_points: 1,
      feedback: 'Partial credit.',
      text_answer: 'O(n squared)',
      reference_answer: 'O(n log n)',
    },
    {
      id: 104,
      position: 4,
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

const baseProps = {
  exam,
  result,
  isLoading: false,
  error: '',
  onRetry: vi.fn(),
  onBack: vi.fn(),
};

describe('StudentResult', () => {
  test('renders the complete published result read-only with text answer labels', () => {
    const { container } = render(<StudentResult {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Algorithms midterm Result' }))
      .toBeInTheDocument();
    expect(screen.getByText('1.5 / 4')).toBeInTheDocument();
    expect(screen.getByText('37.5%')).toBeInTheDocument();
    expect(screen.getByText(new Date(result.submitted_at).toLocaleString()))
      .toHaveAttribute('datetime', result.submitted_at);
    expect(screen.getByText(new Date(result.result_published_at).toLocaleString()))
      .toHaveAttribute('datetime', result.result_published_at);

    const mcq = screen.getByRole('article', { name: /Choose the stable sort/ });
    expect(within(within(mcq).getByText('Student selection').closest('li'))
      .getByText('Your answer')).toBeInTheDocument();
    expect(within(within(mcq).getByText('Correct selection').closest('li'))
      .getByText('Correct answer')).toBeInTheDocument();
    expect(within(mcq).getByText('No lecturer feedback')).toBeInTheDocument();

    const trueFalse = screen.getByRole('article', { name: /submitted answer is false/ });
    expect(within(trueFalse).getAllByText('False')).toHaveLength(2);
    expect(within(trueFalse).getByText('False was preserved.')).toBeInTheDocument();

    const answeredShort = screen.getByRole('article', { name: /Explain the runtime/ });
    expect(within(answeredShort).getByText('O(n squared)')).toBeInTheDocument();
    expect(within(answeredShort).getByText('O(n log n)')).toBeInTheDocument();
    expect(within(answeredShort).getByText('0.5 / 1')).toBeInTheDocument();
    expect(within(answeredShort).getByText('Partial credit.')).toBeInTheDocument();

    const unansweredShort = screen.getByRole('article', { name: /Name the invariant/ });
    expect(within(unansweredShort).getAllByText('Unanswered')).toHaveLength(2);
    expect(within(unansweredShort).getByText('0 / 1')).toBeInTheDocument();
    expect(within(unansweredShort).getByText('The prefix remains sorted.'))
      .toBeInTheDocument();
    expect(within(unansweredShort).getByText('No lecturer feedback')).toBeInTheDocument();

    expect(container.querySelectorAll('input, textarea, select, form')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /edit|resubmit|reopen|publish|grade|dispute/i }))
      .not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Back to Exams' })).toBeInTheDocument();
  });

  test('shows loading and permits back navigation', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <StudentResult
        {...baseProps}
        result={null}
        isLoading
        onBack={onBack}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading result...');
    await user.click(screen.getByRole('button', { name: 'Back to Exams' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('shows a safe error with retry and back controls', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onBack = vi.fn();
    render(
      <StudentResult
        {...baseProps}
        result={null}
        error="Result service unavailable."
        onRetry={onRetry}
        onBack={onBack}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Result service unavailable.');
    await user.click(screen.getByRole('button', { name: 'Retry Result' }));
    await user.click(screen.getByRole('button', { name: 'Back to Exams' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
