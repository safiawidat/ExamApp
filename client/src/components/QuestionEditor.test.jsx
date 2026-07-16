import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
import { ApiError } from '../api/apiClient';
import {
  createQuestion,
  deleteQuestion,
  listQuestions,
  reorderQuestions,
  updateQuestion,
} from '../api/questionService';
import QuestionEditor from './QuestionEditor';

vi.mock('../api/questionService', () => ({
  createQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
  listQuestions: vi.fn(),
  reorderQuestions: vi.fn(),
  updateQuestion: vi.fn(),
}));

const exam = {
  id: 31,
  lecturer_id: 19,
  exam_type_id: 7,
  title: 'Algorithms midterm',
  description: 'Core algorithms',
  status: 'draft',
  question_count: 3,
};

const commonQuestion = {
  exam_id: exam.id,
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

const allQuestions = [
  multipleChoiceQuestion,
  trueFalseQuestion,
  shortAnswerQuestion,
];

const multipleChoicePayload = {
  question_type: 'multiple_choice',
  prompt: multipleChoiceQuestion.prompt,
  points: multipleChoiceQuestion.points,
  options: [
    { text: 'No', is_correct: false },
    { text: 'Yes', is_correct: true },
  ],
};

const trueFalsePayload = {
  question_type: 'true_false',
  prompt: trueFalseQuestion.prompt,
  points: trueFalseQuestion.points,
  correct_answer: false,
};

const shortAnswerPayload = {
  question_type: 'short_answer',
  prompt: shortAnswerQuestion.prompt,
  points: shortAnswerQuestion.points,
  reference_answer: shortAnswerQuestion.reference_answer,
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

const renderedPromptOrder = () => screen.getAllByRole('heading', { level: 4 })
  .map((heading) => heading.textContent);

const renderEditor = (props = {}) => {
  const onBack = props.onBack ?? vi.fn();
  const onQuestionCountChange = props.onQuestionCountChange ?? vi.fn();
  const result = render(
    <QuestionEditor
      exam={exam}
      onBack={onBack}
      onQuestionCountChange={onQuestionCountChange}
    />,
  );

  return { ...result, onBack, onQuestionCountChange };
};

const loadEditor = async (questions = allQuestions, props = {}) => {
  listQuestions.mockResolvedValue(questions);
  const result = renderEditor(props);
  await screen.findByRole('heading', { name: 'Add question' });
  return result;
};

let fetchSpy;

beforeEach(() => {
  vi.clearAllMocks();
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

describe('question editor loading and rendering', () => {
  test('shows loading, then an empty state and zero count', async () => {
    const request = deferred();
    listQuestions.mockReturnValue(request.promise);
    const { onQuestionCountChange } = renderEditor();

    expect(screen.getByRole('status')).toHaveTextContent('Loading questions');
    expect(screen.queryByText('No questions have been added yet.')).not.toBeInTheDocument();
    expect(listQuestions).toHaveBeenCalledWith(exam.id);

    await act(async () => {
      request.resolve([]);
    });

    expect(await screen.findByText('No questions have been added yet.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Questions (0)' })).toBeInTheDocument();
    expect(screen.getByText(/0 questions/)).toBeInTheDocument();
    expect(onQuestionCountChange).toHaveBeenLastCalledWith(0);
  });

  test('orders the question list by position and renders every answer type', async () => {
    const { onQuestionCountChange } = await loadEditor([
      shortAnswerQuestion,
      multipleChoiceQuestion,
      trueFalseQuestion,
    ]);

    expect(renderedPromptOrder()).toEqual([
      multipleChoiceQuestion.prompt,
      trueFalseQuestion.prompt,
      shortAnswerQuestion.prompt,
    ]);
    expect(screen.getByRole('heading', { name: 'Questions (3)' })).toBeInTheDocument();
    expect(screen.getByText(/Yes.*correct/)).toBeInTheDocument();
    expect(screen.getByText('Correct answer: False')).toBeInTheDocument();
    expect(screen.getByText('Reference answer: HTTP')).toBeInTheDocument();
    expect(onQuestionCountChange).toHaveBeenLastCalledWith(3);
  });

  test('uses a safe fallback for an unexpected load error and retries', async () => {
    listQuestions
      .mockRejectedValueOnce(new Error('postgres://hidden-credential'))
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderEditor();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load questions.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('hidden-credential');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No questions have been added yet.')).toBeInTheDocument();
    expect(listQuestions).toHaveBeenCalledTimes(2);
  });
});

describe('question creation and updates', () => {
  test('creates all three question types with exact payloads and updates the count', async () => {
    createQuestion
      .mockResolvedValueOnce(multipleChoiceQuestion)
      .mockResolvedValueOnce(trueFalseQuestion)
      .mockResolvedValueOnce(shortAnswerQuestion);
    const user = userEvent.setup();
    const { onQuestionCountChange } = await loadEditor([]);

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: multipleChoiceQuestion.prompt },
    });
    fireEvent.change(screen.getByLabelText('Points'), {
      target: { value: String(multipleChoiceQuestion.points) },
    });
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'No' } });
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'Yes' } });
    await user.click(screen.getByLabelText('Mark option 2 correct'));
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(await screen.findByRole('heading', { name: multipleChoiceQuestion.prompt }))
      .toBeInTheDocument();

    expect(createQuestion).toHaveBeenNthCalledWith(1, exam.id, multipleChoicePayload);

    await user.selectOptions(screen.getByLabelText('Question type'), 'true_false');
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: trueFalseQuestion.prompt },
    });
    fireEvent.change(screen.getByLabelText('Points'), {
      target: { value: String(trueFalseQuestion.points) },
    });
    await user.selectOptions(screen.getByLabelText('Correct answer'), 'false');
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(await screen.findByRole('heading', { name: trueFalseQuestion.prompt }))
      .toBeInTheDocument();

    expect(createQuestion).toHaveBeenNthCalledWith(2, exam.id, trueFalsePayload);
    expect(createQuestion.mock.calls[1][1].correct_answer).toBe(false);

    await user.selectOptions(screen.getByLabelText('Question type'), 'short_answer');
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: shortAnswerQuestion.prompt },
    });
    fireEvent.change(screen.getByLabelText('Points'), {
      target: { value: String(shortAnswerQuestion.points) },
    });
    fireEvent.change(screen.getByLabelText('Reference answer'), {
      target: { value: shortAnswerQuestion.reference_answer },
    });
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(await screen.findByRole('heading', { name: shortAnswerQuestion.prompt }))
      .toBeInTheDocument();

    expect(createQuestion).toHaveBeenNthCalledWith(3, exam.id, shortAnswerPayload);
    expect(screen.getByRole('heading', { name: 'Questions (3)' })).toBeInTheDocument();
    expect(onQuestionCountChange).toHaveBeenLastCalledWith(3);
  });

  test.each([
    ['multiple choice', multipleChoiceQuestion, multipleChoicePayload],
    ['true/false', trueFalseQuestion, trueFalsePayload],
    ['short answer', shortAnswerQuestion, shortAnswerPayload],
  ])('updates a %s question through the service with a clean final payload', async (
    _label,
    question,
    payload,
  ) => {
    updateQuestion.mockResolvedValue(question);
    const user = userEvent.setup();
    await loadEditor([question]);

    await user.click(screen.getByRole('button', {
      name: `Edit question ${question.position}`,
    }));
    await user.click(screen.getByRole('button', { name: 'Save question' }));

    expect(updateQuestion).toHaveBeenCalledWith(exam.id, question.id, payload);
    expect(await screen.findByRole('heading', { name: question.prompt })).toBeInTheDocument();
  });

  test('shows a published-exam conflict safely and preserves the create form', async () => {
    createQuestion.mockRejectedValue(
      new ApiError(409, 'Published exams cannot be modified.'),
    );
    const user = userEvent.setup();
    await loadEditor([]);

    await user.selectOptions(screen.getByLabelText('Question type'), 'true_false');
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Still a draft?' },
    });
    await user.click(screen.getByRole('button', { name: 'Add question' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Published exams cannot be modified.',
    );
    expect(screen.getByLabelText('Prompt')).toHaveValue('Still a draft?');
    expect(screen.getByRole('heading', { name: 'Questions (0)' })).toBeInTheDocument();
  });

  test('locks edit, delete, and reorder controls and blocks rapid create/delete overlap', async () => {
    const request = deferred();
    const created = {
      ...trueFalseQuestion,
      id: 104,
      position: 4,
      prompt: 'Pending create',
    };
    createQuestion.mockReturnValue(request.promise);
    const user = userEvent.setup();
    const { onQuestionCountChange } = await loadEditor(allQuestions);

    await user.click(screen.getByRole('button', { name: 'Delete question 1' }));
    await user.selectOptions(screen.getByLabelText('Question type'), 'true_false');
    await user.type(screen.getByLabelText('Prompt'), created.prompt);
    const createForm = screen.getByRole('button', { name: 'Add question' }).closest('form');
    fireEvent.submit(createForm);
    fireEvent.submit(createForm);

    const savingButton = screen.getByRole('button', { name: /Saving/ });
    expect(savingButton).toBeDisabled();
    expect(screen.getByLabelText('Question type')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit question 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete question 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move question 2 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(createQuestion).toHaveBeenCalledTimes(1);
    expect(deleteQuestion).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve(created);
    });

    expect(await screen.findByRole('heading', { name: created.prompt })).toBeInTheDocument();
    expect(onQuestionCountChange).toHaveBeenLastCalledWith(4);
  });

  test('disables create and other mutation controls while an edit is pending', async () => {
    const request = deferred();
    updateQuestion.mockReturnValue(request.promise);
    const user = userEvent.setup();
    await loadEditor(allQuestions);

    await user.click(screen.getByRole('button', { name: 'Edit question 1' }));
    await user.click(screen.getByRole('button', { name: 'Save question' }));

    expect(screen.getByRole('button', { name: 'Add question' })).toBeDisabled();
    expect(screen.getAllByLabelText('Question type').every((control) => control.disabled)).toBe(true);
    expect(screen.getByRole('button', { name: 'Delete question 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move question 2 down' })).toBeDisabled();

    await act(async () => {
      request.resolve(multipleChoiceQuestion);
    });

    expect(await screen.findByRole('heading', { name: multipleChoiceQuestion.prompt }))
      .toBeInTheDocument();
  });

  test('preserves a question loaded during an in-flight create and reports the final count', async () => {
    const request = deferred();
    const created = {
      ...shortAnswerQuestion,
      id: 104,
      position: 3,
      prompt: 'Created after refresh',
    };
    createQuestion.mockReturnValue(request.promise);
    const user = userEvent.setup();
    const { rerender } = await loadEditor([multipleChoiceQuestion]);

    await user.selectOptions(screen.getByLabelText('Question type'), 'true_false');
    await user.type(screen.getByLabelText('Prompt'), created.prompt);
    await user.click(screen.getByRole('button', { name: 'Add question' }));

    listQuestions.mockResolvedValueOnce([multipleChoiceQuestion, trueFalseQuestion]);
    const refreshedCount = vi.fn();
    rerender(
      <QuestionEditor
        exam={exam}
        onBack={vi.fn()}
        onQuestionCountChange={refreshedCount}
      />,
    );
    expect(await screen.findByRole('heading', { name: trueFalseQuestion.prompt }))
      .toBeInTheDocument();

    await act(async () => {
      request.resolve(created);
    });

    expect(await screen.findByRole('heading', { name: created.prompt })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: multipleChoiceQuestion.prompt }))
      .toBeInTheDocument();
    expect(screen.getByRole('heading', { name: trueFalseQuestion.prompt }))
      .toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Questions (3)' })).toBeInTheDocument();
    expect(refreshedCount).toHaveBeenLastCalledWith(3);
  });

  test('keeps the stored question unchanged when an edit fails', async () => {
    updateQuestion.mockRejectedValue(new ApiError(409, 'Question update was rejected.'));
    const user = userEvent.setup();
    await loadEditor([multipleChoiceQuestion]);

    await user.click(screen.getByRole('button', { name: 'Edit question 1' }));
    const editPrompt = screen.getAllByLabelText('Prompt')[1];
    await user.clear(editPrompt);
    await user.type(editPrompt, 'Changed only in the failed form');
    await user.click(screen.getByRole('button', { name: 'Save question' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Question update was rejected.');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: multipleChoiceQuestion.prompt }))
      .toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Changed only in the failed form' }))
      .not.toBeInTheDocument();
  });
});

describe('question deletion and reordering', () => {
  test('cancels deletion, then confirms it atomically with a saving state', async () => {
    const request = deferred();
    deleteQuestion.mockReturnValue(request.promise);
    const user = userEvent.setup();
    const { onQuestionCountChange } = await loadEditor(allQuestions);

    await user.click(screen.getByRole('button', { name: 'Delete question 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent(multipleChoiceQuestion.prompt);
    await user.click(screen.getByRole('button', { name: 'Cancel delete' }));
    expect(deleteQuestion).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: multipleChoiceQuestion.prompt }))
      .toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete question 1' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(deleteQuestion).toHaveBeenCalledWith(exam.id, multipleChoiceQuestion.id);
    expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit question 2' })).toBeDisabled();

    await act(async () => {
      request.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: multipleChoiceQuestion.prompt }))
        .not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Questions (2)' })).toBeInTheDocument();
    expect(onQuestionCountChange).toHaveBeenLastCalledWith(2);
  });

  test('disables boundary moves and sends exact IDs for up and down reorders', async () => {
    const firstRequest = deferred();
    const reordered = [
      { ...trueFalseQuestion, position: 1 },
      { ...multipleChoiceQuestion, position: 2 },
      shortAnswerQuestion,
    ];
    reorderQuestions
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(allQuestions);
    const user = userEvent.setup();
    await loadEditor(allQuestions);

    expect(screen.getByRole('button', { name: 'Move question 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move question 3 down' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move question 2 up' }));
    expect(reorderQuestions).toHaveBeenNthCalledWith(1, exam.id, [102, 101, 103]);
    expect(screen.getByRole('button', { name: 'Move question 1 down' })).toBeDisabled();

    await act(async () => {
      firstRequest.resolve(reordered);
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Question order was updated.',
    );
    expect(renderedPromptOrder()).toEqual([
      trueFalseQuestion.prompt,
      multipleChoiceQuestion.prompt,
      shortAnswerQuestion.prompt,
    ]);

    await user.click(screen.getByRole('button', { name: 'Move question 1 down' }));
    expect(reorderQuestions).toHaveBeenNthCalledWith(2, exam.id, [101, 102, 103]);
    await waitFor(() => {
      expect(renderedPromptOrder()).toEqual([
        multipleChoiceQuestion.prompt,
        trueFalseQuestion.prompt,
        shortAnswerQuestion.prompt,
      ]);
    });
  });

  test('keeps the prior order and shows a safe error when reorder fails', async () => {
    reorderQuestions.mockRejectedValue(
      new ApiError(409, 'Published exams cannot be modified.'),
    );
    const user = userEvent.setup();
    await loadEditor(allQuestions);

    await user.click(screen.getByRole('button', { name: 'Move question 2 up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Published exams cannot be modified.',
    );
    expect(renderedPromptOrder()).toEqual([
      multipleChoiceQuestion.prompt,
      trueFalseQuestion.prompt,
      shortAnswerQuestion.prompt,
    ]);
    expect(reorderQuestions).toHaveBeenCalledWith(exam.id, [102, 101, 103]);
  });

  test('uses a safe fallback and preserves the question when deletion fails', async () => {
    deleteQuestion.mockRejectedValue(new Error('sensitive server detail'));
    const user = userEvent.setup();
    await loadEditor(allQuestions);

    await user.click(screen.getByRole('button', { name: 'Delete question 1' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));

    expect(await screen.findByText('Unable to delete the question.')).toBeInTheDocument();
    expect(screen.queryByText('sensitive server detail')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: multipleChoiceQuestion.prompt }))
      .toBeInTheDocument();
  });
});
