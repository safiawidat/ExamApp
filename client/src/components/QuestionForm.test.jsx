import {
  act,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import QuestionForm from './QuestionForm';

const commonQuestion = {
  exam_id: 31,
  created_at: '2026-07-15T08:00:00.000Z',
  updated_at: '2026-07-15T09:00:00.000Z',
};

const multipleChoiceQuestion = {
  ...commonQuestion,
  id: 101,
  question_type: 'multiple_choice',
  prompt: 'Choose one',
  points: 5,
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
  prompt: 'The sky is blue',
  points: 3,
  position: 2,
  correct_answer: false,
};

const shortAnswerQuestion = {
  ...commonQuestion,
  id: 103,
  question_type: 'short_answer',
  prompt: 'Name the protocol',
  points: 4,
  position: 3,
  reference_answer: 'HTTP',
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

const replaceValue = async (user, label, value) => {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
};

let fetchSpy;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  try {
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

describe('question form', () => {
  test('creates a trimmed multiple-choice payload and supports option add/remove', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<QuestionForm onSubmit={onSubmit} />);

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Remove option 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove option 2' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add option' }));
    fireEvent.change(screen.getByLabelText('Option 3'), {
      target: { value: 'Discarded option' },
    });
    await user.click(screen.getByRole('button', { name: 'Remove option 3' }));
    expect(screen.queryByDisplayValue('Discarded option')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: '  Which value is correct?  ' },
    });
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Option 1'), {
      target: { value: '  First choice  ' },
    });
    fireEvent.change(screen.getByLabelText('Option 2'), {
      target: { value: '  Second choice  ' },
    });
    await user.click(screen.getByLabelText('Mark option 2 correct'));
    await user.click(screen.getByRole('button', { name: 'Add question' }));

    expect(onSubmit).toHaveBeenCalledWith({
      question_type: 'multiple_choice',
      prompt: 'Which value is correct?',
      points: 7,
      options: [
        { text: 'First choice', is_correct: false },
        { text: 'Second choice', is_correct: true },
      ],
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('validates multiple-choice option text, normalized duplicates, and one correct answer', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<QuestionForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Choose a value' },
    });
    fireEvent.change(screen.getByLabelText('Option 1'), {
      target: { value: 'Alpha' },
    });
    fireEvent.change(screen.getByLabelText('Option 2'), {
      target: { value: 'Beta' },
    });
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Select exactly one correct option.',
    );

    await user.click(screen.getByLabelText('Mark option 1 correct'));
    fireEvent.change(screen.getByLabelText('Option 2'), {
      target: { value: ' alpha ' },
    });
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Option text must be unique.');

    fireEvent.change(screen.getByLabelText('Option 2'), {
      target: { value: '   ' },
    });
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Every option requires text.');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Option 2'), {
      target: { value: 'Beta' },
    });
    await user.click(screen.getByLabelText('Mark option 2 correct'));
    expect(screen.getByLabelText('Mark option 1 correct')).not.toBeChecked();
    expect(screen.getByLabelText('Mark option 2 correct')).toBeChecked();
  });

  test.each([
    ['true', true],
    ['false', false],
  ])('creates a true/false question with the %s JSON boolean', async (selection, answer) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<QuestionForm onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Question type'), 'true_false');
    await replaceValue(user, 'Prompt', '  The statement is valid.  ');
    await replaceValue(user, 'Points', '2');
    await user.selectOptions(screen.getByLabelText('Correct answer'), selection);
    await user.click(screen.getByRole('button', { name: 'Add question' }));

    expect(onSubmit).toHaveBeenCalledWith({
      question_type: 'true_false',
      prompt: 'The statement is valid.',
      points: 2,
      correct_answer: answer,
    });
  });

  test('creates a trimmed short answer and rejects whitespace-only reference text', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<QuestionForm onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Question type'), 'short_answer');
    await replaceValue(user, 'Prompt', ' Name the protocol ');
    await replaceValue(user, 'Points', '4');
    await user.type(screen.getByLabelText('Reference answer'), '   ');
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Reference answer is required.');
    expect(onSubmit).not.toHaveBeenCalled();

    await replaceValue(user, 'Reference answer', '  HTTP  ');
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(onSubmit).toHaveBeenCalledWith({
      question_type: 'short_answer',
      prompt: 'Name the protocol',
      points: 4,
      reference_answer: 'HTTP',
    });
  });

  test.each([
    [
      'multiple choice',
      multipleChoiceQuestion,
      {
        question_type: 'multiple_choice',
        prompt: 'Choose one',
        points: 5,
        options: [
          { text: 'No', is_correct: false },
          { text: 'Yes', is_correct: true },
        ],
      },
    ],
    [
      'true/false',
      trueFalseQuestion,
      {
        question_type: 'true_false',
        prompt: 'The sky is blue',
        points: 3,
        correct_answer: false,
      },
    ],
    [
      'short answer',
      shortAnswerQuestion,
      {
        question_type: 'short_answer',
        prompt: 'Name the protocol',
        points: 4,
        reference_answer: 'HTTP',
      },
    ],
  ])('prefills and updates a %s question without response-only fields', async (
    _label,
    question,
    expectedPayload,
  ) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<QuestionForm question={question} onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByLabelText('Prompt')).toHaveValue(question.prompt);
    expect(screen.getByLabelText('Points')).toHaveValue(question.points);
    await user.click(screen.getByRole('button', { name: 'Save question' }));

    expect(onSubmit).toHaveBeenCalledWith(expectedPayload);
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('id');
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('position');
  });

  test('requires confirmation before discarding multiple-choice data and can cancel', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<QuestionForm question={multipleChoiceQuestion} onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Question type'), 'true_false');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Changing type will discard the current multiple-choice options.',
    );
    expect(screen.getByLabelText('Question type')).toHaveValue('multiple_choice');
    expect(screen.getByRole('button', { name: 'Save question' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Keep current type' }));
    expect(screen.getByLabelText('Question type')).toHaveValue('multiple_choice');
    expect(screen.getByLabelText('Option 1')).toHaveValue('No');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('Question type'), 'true_false');
    await user.click(screen.getByRole('button', { name: 'Confirm type change' }));
    expect(screen.queryByLabelText('Option 1')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Correct answer'), 'false');
    await user.click(screen.getByRole('button', { name: 'Save question' }));

    expect(onSubmit).toHaveBeenCalledWith({
      question_type: 'true_false',
      prompt: 'Choose one',
      points: 5,
      correct_answer: false,
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('options');
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('reference_answer');
  });

  test('resets incompatible fields when transitioning true/false to short answer', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<QuestionForm question={trueFalseQuestion} onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Question type'), 'short_answer');
    expect(screen.queryByLabelText('Correct answer')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Reference answer'), '  A new answer  ');
    await user.click(screen.getByRole('button', { name: 'Save question' }));

    expect(onSubmit).toHaveBeenCalledWith({
      question_type: 'short_answer',
      prompt: trueFalseQuestion.prompt,
      points: trueFalseQuestion.points,
      reference_answer: 'A new answer',
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('correct_answer');
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('options');
  });

  test('resets incompatible fields when transitioning short answer to multiple choice', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<QuestionForm question={shortAnswerQuestion} onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Question type'), 'multiple_choice');
    expect(screen.queryByLabelText('Reference answer')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Option 1'), 'One');
    await user.type(screen.getByLabelText('Option 2'), 'Two');
    await user.click(screen.getByLabelText('Mark option 1 correct'));
    await user.click(screen.getByRole('button', { name: 'Save question' }));

    expect(onSubmit).toHaveBeenCalledWith({
      question_type: 'multiple_choice',
      prompt: shortAnswerQuestion.prompt,
      points: shortAnswerQuestion.points,
      options: [
        { text: 'One', is_correct: true },
        { text: 'Two', is_correct: false },
      ],
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('reference_answer');
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('correct_answer');
  });

  test('locks the form while saving and prevents duplicate submissions', async () => {
    const request = deferred();
    const onSubmit = vi.fn().mockReturnValue(request.promise);
    const user = userEvent.setup();
    render(<QuestionForm question={trueFalseQuestion} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Save question' }));

    const savingButton = screen.getByRole('button', { name: /Saving/ });
    expect(savingButton).toBeDisabled();
    expect(screen.getByLabelText('Question type')).toBeDisabled();
    expect(screen.getByLabelText('Prompt')).toBeDisabled();
    expect(screen.getByLabelText('Points')).toBeDisabled();
    expect(screen.getByLabelText('Correct answer')).toBeDisabled();
    await user.click(savingButton);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve();
    });
    expect(screen.getByRole('button', { name: 'Save question' })).toBeEnabled();
  });

  test('respects an external mutation lock without submitting', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<QuestionForm question={trueFalseQuestion} onSubmit={onSubmit} disabled />);

    expect(screen.getByLabelText('Question type')).toBeDisabled();
    expect(screen.getByLabelText('Prompt')).toBeDisabled();
    expect(screen.getByLabelText('Points')).toBeDisabled();
    expect(screen.getByLabelText('Correct answer')).toBeDisabled();
    const saveButton = screen.getByRole('button', { name: 'Save question' });
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
