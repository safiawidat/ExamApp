import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import StudentForm from './StudentForm';

const createExam = (overrides = {}) => ({
  id: 31,
  title: 'Algorithms midterm',
  description: 'Answer every question carefully.',
  published_at: '2026-07-15T10:00:00.000Z',
  exam_type: {
    id: 7,
    name: 'Algorithms',
  },
  question_count: 3,
  total_points: 12,
  has_submitted: false,
  questions: [
    {
      id: 101,
      question_type: 'short_answer',
      prompt: 'Explain the runtime.',
      points: 4,
      position: 1,
      notice: {
        message: 'Use asymptotic notation.',
        placement: 'above',
      },
    },
    {
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
    },
    {
      id: 103,
      question_type: 'true_false',
      prompt: 'A binary search requires sorted input.',
      points: 3,
      position: 3,
    },
  ],
  ...overrides,
});

const renderForm = (props = {}) => {
  const exam = props.exam ?? createExam();
  const onSubmitExam = props.onSubmitExam ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  const result = render(
    <StudentForm
      exam={exam}
      onSubmitExam={onSubmitExam}
      onCancel={onCancel}
      isSubmitting={props.isSubmitting}
      submissionError={props.submissionError}
    />,
  );

  return { ...result, exam, onSubmitExam, onCancel };
};

const submitAndConfirm = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Submit Exam' }));
  await user.click(screen.getByRole('button', { name: 'Confirm Final Submission' }));
};

describe('StudentForm', () => {
  test('renders exam details and student guidance without legacy or result fields', () => {
    renderForm();

    expect(screen.getByRole('heading', { name: 'Algorithms midterm', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Answer every question carefully.')).toBeInTheDocument();
    expect(screen.getByText('Algorithms')).toBeInTheDocument();
    expect(screen.getByText('3', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('12', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(
      'Every question is included in your final submission. Unanswered questions receive 0 points.',
    )).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /student name/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/feedback/i)).not.toBeInTheDocument();
  });

  test('renders questions and multiple-choice options in the supplied order', () => {
    renderForm();

    const questionGroups = screen.getAllByRole('group');
    expect(questionGroups).toHaveLength(3);
    expect(questionGroups[0]).toHaveTextContent('Question 1');
    expect(questionGroups[0]).toHaveTextContent('Explain the runtime.');
    expect(questionGroups[0]).toHaveTextContent('4 points');
    expect(questionGroups[1]).toHaveTextContent('Question 2');
    expect(questionGroups[1]).toHaveTextContent('Choose the stable sort.');
    expect(questionGroups[1]).toHaveTextContent('5 points');
    expect(questionGroups[2]).toHaveTextContent('Question 3');
    expect(questionGroups[2]).toHaveTextContent('A binary search requires sorted input.');
    expect(questionGroups[2]).toHaveTextContent('3 points');

    expect(screen.getByRole('textbox', { name: 'Your answer for question 1' })).toBeInTheDocument();
    expect(within(questionGroups[1]).getAllByRole('radio').map((radio) => radio.value)).toEqual([
      '201',
      '202',
    ]);
    expect(within(questionGroups[1]).getAllByText(/sort$/).map((label) => label.textContent)).toEqual([
      'Merge sort',
      'Selection sort',
    ]);
    expect(within(questionGroups[2]).getByRole('radio', { name: 'True' })).toBeInTheDocument();
    expect(within(questionGroups[2]).getByRole('radio', { name: 'False' })).toBeInTheDocument();
  });

  test('places only the supplied notices at their accessible positions', () => {
    renderForm();

    expect(screen.getByRole('note', { name: 'Notice above question 1' }))
      .toHaveTextContent('Use asymptotic notation.');
    expect(screen.queryByRole('note', { name: 'Notice below question 1' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Notice below question 2' }))
      .toHaveTextContent('Select one visible option.');
    expect(screen.queryByRole('note', { name: 'Notice above question 2' }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('note', { name: /question 3/ })).not.toBeInTheDocument();
  });

  test('stores a replacement multiple-choice selection as a numeric option ID', async () => {
    const user = userEvent.setup();
    const { onSubmitExam } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'Merge sort' }));
    await user.click(screen.getByRole('radio', { name: 'Selection sort' }));
    expect(screen.getByRole('radio', { name: 'Merge sort' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Selection sort' })).toBeChecked();

    await submitAndConfirm(user);

    expect(onSubmitExam).toHaveBeenCalledWith([
      { question_id: 101 },
      { question_id: 102, selected_option_id: 202 },
      { question_id: 103 },
    ]);
    expect(onSubmitExam.mock.calls[0][0][1].selected_option_id).toBeTypeOf('number');
    expect(JSON.stringify(onSubmitExam.mock.calls[0][0])).not.toContain('Selection sort');
  });

  test.each([
    ['True', true],
    ['False', false],
  ])('preserves the %s choice as Boolean %s', async (choice, expectedValue) => {
    const user = userEvent.setup();
    const { onSubmitExam } = renderForm();

    await user.click(screen.getByRole('radio', { name: choice }));
    await submitAndConfirm(user);

    const booleanAnswer = onSubmitExam.mock.calls[0][0][2].boolean_answer;
    expect(booleanAnswer).toBe(expectedValue);
    expect(typeof booleanAnswer).toBe('boolean');
  });

  test('keeps surrounding whitespace on a nonblank short answer', async () => {
    const user = userEvent.setup();
    const { onSubmitExam } = renderForm();

    await user.type(
      screen.getByRole('textbox', { name: 'Your answer for question 1' }),
      '  O(n log n)  ',
    );
    await submitAndConfirm(user);

    expect(onSubmitExam.mock.calls[0][0][0]).toEqual({
      question_id: 101,
      text_answer: '  O(n log n)  ',
    });
  });

  test('submits whitespace-only text as unanswered and does not mutate exam data', async () => {
    const user = userEvent.setup();
    const exam = createExam();
    const originalExam = structuredClone(exam);
    const { onSubmitExam } = renderForm({ exam });

    await user.type(screen.getByRole('textbox', { name: 'Your answer for question 1' }), '   ');
    await submitAndConfirm(user);

    const payload = onSubmitExam.mock.calls[0][0];
    expect(payload).toEqual([
      { question_id: 101 },
      { question_id: 102 },
      { question_id: 103 },
    ]);
    expect(payload).toHaveLength(exam.questions.length);
    expect(payload.map((answer) => answer.question_id)).toEqual([101, 102, 103]);
    expect(payload.every((answer) => Object.keys(answer).length === 1)).toBe(true);
    expect(exam).toEqual(originalExam);
  });

  test('opens confirmation before submission and continues editing without losing answers', async () => {
    const user = userEvent.setup();
    const { onSubmitExam } = renderForm();
    const shortAnswer = screen.getByRole('textbox', { name: 'Your answer for question 1' });

    await user.type(shortAnswer, 'Heap sort explanation');
    await user.click(screen.getByRole('radio', { name: 'Merge sort' }));
    await user.click(screen.getByRole('button', { name: 'Submit Exam' }));

    expect(onSubmitExam).not.toHaveBeenCalled();
    expect(screen.getByText(
      'This is your final submission. You will not be able to submit this exam again.',
    )).toBeInTheDocument();
    expect(screen.getByText('Answered: 2 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue Editing' }));
    expect(screen.queryByLabelText('Final submission confirmation')).not.toBeInTheDocument();
    expect(shortAnswer).toHaveValue('Heap sort explanation');
    expect(screen.getByRole('radio', { name: 'Merge sort' })).toBeChecked();
  });

  test('changing an answer closes an open confirmation', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Submit Exam' }));
    expect(screen.getByLabelText('Final submission confirmation')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'False' }));
    expect(screen.queryByLabelText('Final submission confirmation')).not.toBeInTheDocument();
  });

  test('confirms exactly once with one ordered, supported row per question', async () => {
    const user = userEvent.setup();
    const { onSubmitExam } = renderForm();

    await user.type(
      screen.getByRole('textbox', { name: 'Your answer for question 1' }),
      'Runtime answer',
    );
    await user.click(screen.getByRole('radio', { name: 'Merge sort' }));
    await user.click(screen.getByRole('radio', { name: 'False' }));
    await user.click(screen.getByRole('button', { name: 'Submit Exam' }));

    const finalButton = screen.getByRole('button', { name: 'Confirm Final Submission' });
    await user.click(finalButton);
    await user.click(finalButton);

    expect(onSubmitExam).toHaveBeenCalledTimes(1);
    expect(onSubmitExam).toHaveBeenCalledWith([
      { question_id: 101, text_answer: 'Runtime answer' },
      { question_id: 102, selected_option_id: 201 },
      { question_id: 103, boolean_answer: false },
    ]);
    expect(Object.keys(onSubmitExam.mock.calls[0][0][2])).toEqual([
      'question_id',
      'boolean_answer',
    ]);
  });

  test('disables every control and prevents repeated submission while pending', async () => {
    const user = userEvent.setup();
    const onSubmitExam = vi.fn();
    const exam = createExam();
    const { rerender } = renderForm({ exam, onSubmitExam });

    await user.click(screen.getByRole('button', { name: 'Submit Exam' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Final Submission' }));
    expect(onSubmitExam).toHaveBeenCalledTimes(1);

    rerender(
      <StudentForm
        exam={exam}
        onSubmitExam={onSubmitExam}
        onCancel={vi.fn()}
        isSubmitting
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Your answer for question 1' })).toBeDisabled();
    screen.getAllByRole('radio').forEach((radio) => expect(radio).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Back to Exams' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit Exam' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue Editing' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Submitting...' }));
    expect(onSubmitExam).toHaveBeenCalledTimes(1);
  });

  test('shows a safe error without clearing answers and permits editing and retry', async () => {
    const user = userEvent.setup();
    const exam = createExam();
    const onSubmitExam = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = renderForm({ exam, onSubmitExam, onCancel });
    const shortAnswer = screen.getByRole('textbox', { name: 'Your answer for question 1' });

    await user.type(shortAnswer, 'Keep this answer');
    await user.click(screen.getByRole('radio', { name: 'Merge sort' }));
    await user.click(screen.getByRole('button', { name: 'Submit Exam' }));
    rerender(
      <StudentForm
        exam={exam}
        onSubmitExam={onSubmitExam}
        onCancel={onCancel}
        isSubmitting
      />,
    );
    rerender(
      <StudentForm
        exam={exam}
        onSubmitExam={onSubmitExam}
        onCancel={onCancel}
        submissionError="Submission failed safely."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Submission failed safely.');
    expect(shortAnswer).toHaveValue('Keep this answer');
    expect(shortAnswer).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Merge sort' })).toBeChecked();
    await user.type(shortAnswer, ' Updated');
    expect(shortAnswer).toHaveValue('Keep this answer Updated');
    expect(screen.queryByLabelText('Final submission confirmation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit Exam' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Final Submission' }));
    expect(onSubmitExam).toHaveBeenCalledTimes(1);
  });

  test('Back to Exams cancels without submitting and is unavailable while pending', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSubmitExam = vi.fn();
    const exam = createExam();
    const { rerender } = renderForm({ exam, onCancel, onSubmitExam });

    await user.type(
      screen.getByRole('textbox', { name: 'Your answer for question 1' }),
      'Do not clear before cancel',
    );
    await user.click(screen.getByRole('button', { name: 'Back to Exams' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmitExam).not.toHaveBeenCalled();

    rerender(
      <StudentForm
        exam={exam}
        onSubmitExam={onSubmitExam}
        onCancel={onCancel}
        isSubmitting
      />,
    );
    expect(screen.getByRole('button', { name: 'Back to Exams' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Back to Exams' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('resets answers and closes confirmation when the exam ID changes', async () => {
    const user = userEvent.setup();
    const exam = createExam();
    const { rerender, onSubmitExam, onCancel } = renderForm({ exam });

    await user.type(
      screen.getByRole('textbox', { name: 'Your answer for question 1' }),
      'Old answer',
    );
    await user.click(screen.getByRole('radio', { name: 'Merge sort' }));
    await user.click(screen.getByRole('radio', { name: 'False' }));
    await user.click(screen.getByRole('button', { name: 'Submit Exam' }));
    expect(screen.getByLabelText('Final submission confirmation')).toBeInTheDocument();

    const nextExam = createExam({ id: 32, title: 'Second exam' });
    rerender(
      <StudentForm exam={nextExam} onSubmitExam={onSubmitExam} onCancel={onCancel} />,
    );

    expect(screen.queryByLabelText('Final submission confirmation')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your answer for question 1' })).toHaveValue('');
    screen.getAllByRole('radio').forEach((radio) => expect(radio).not.toBeChecked());
  });
});
