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
  deleteQuestionNotice,
  getQuestionNotice,
  saveQuestionNotice,
} from '../api/questionNoticeService';
import { listQuestions } from '../api/questionService';
import QuestionNoticeEditor from './QuestionNoticeEditor';

vi.mock('../api/questionService', () => ({
  listQuestions: vi.fn(),
}));

vi.mock('../api/questionNoticeService', () => ({
  deleteQuestionNotice: vi.fn(),
  getQuestionNotice: vi.fn(),
  saveQuestionNotice: vi.fn(),
}));

const exam = {
  id: 31,
  title: 'Algorithms midterm',
  status: 'published',
};

const questionOne = {
  id: 101,
  exam_id: exam.id,
  position: 1,
  question_type: 'multiple_choice',
  prompt: 'Which structure provides FIFO access?',
  points: 2,
};

const questionTwo = {
  id: 102,
  exam_id: exam.id,
  position: 2,
  question_type: 'short_answer',
  prompt: 'Explain stable sorting.',
  points: 1,
};

const aboveNotice = {
  exam_id: exam.id,
  question_id: questionOne.id,
  message: 'Assume the queue is initially empty.',
  placement: 'above',
  created_at: '2026-07-16T08:00:00.000Z',
  updated_at: '2026-07-16T08:00:00.000Z',
};

const belowNotice = {
  ...aboveNotice,
  question_id: questionTwo.id,
  message: 'A concise explanation is sufficient.',
  placement: 'below',
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

const noNotice = () => new ApiError(404, 'Question notice not found.');

const renderEditor = (props = {}) => render(
  <QuestionNoticeEditor exam={exam} onBack={vi.fn()} {...props} />,
);

const loadWithoutNotices = async (questions = [questionOne, questionTwo]) => {
  listQuestions.mockResolvedValue(questions);
  getQuestionNotice.mockRejectedValue(noNotice());
  const result = renderEditor();
  await screen.findByRole('heading', { name: 'Questions (2)' });
  return result;
};

const openAddForm = async (position = 1) => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {
    name: `Add notice for question ${position}`,
  }));
  return user;
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

describe('question-notice loading and rendering', () => {
  test('shows loading before questions resolve and renders the empty fallback safely', async () => {
    const request = deferred();
    listQuestions.mockReturnValue(request.promise);

    renderEditor();

    expect(screen.getByRole('status')).toHaveTextContent('Loading question notices');

    await act(async () => request.resolve([]));

    expect(await screen.findByText('No questions are available for this published exam.'))
      .toBeInTheDocument();
    expect(getQuestionNotice).not.toHaveBeenCalled();
  });

  test('orders questions by position then ID and loads each notice with exact IDs', async () => {
    const tiedQuestion = {
      ...questionOne,
      id: 99,
      prompt: 'First tied question',
    };
    const laterTiedQuestion = {
      ...questionOne,
      id: 100,
      prompt: 'Second tied question',
    };
    const finalQuestion = {
      ...questionTwo,
      position: 3,
      prompt: 'Final question',
    };
    listQuestions.mockResolvedValue([finalQuestion, laterTiedQuestion, tiedQuestion]);
    getQuestionNotice.mockRejectedValue(noNotice());

    renderEditor();

    await screen.findByText(tiedQuestion.prompt);
    const prompts = screen.getAllByRole('heading', { level: 4 }).map((heading) => (
      heading.textContent
    ));
    expect(prompts).toEqual([
      tiedQuestion.prompt,
      laterTiedQuestion.prompt,
      finalQuestion.prompt,
    ]);
    expect(getQuestionNotice.mock.calls).toEqual([
      [exam.id, tiedQuestion.id],
      [exam.id, laterTiedQuestion.id],
      [exam.id, finalQuestion.id],
    ]);
  });

  test('treats only 404 as no notice and displays above and below notices', async () => {
    listQuestions.mockResolvedValue([questionOne, questionTwo]);
    getQuestionNotice
      .mockResolvedValueOnce(aboveNotice)
      .mockResolvedValueOnce(belowNotice);

    renderEditor();

    expect(await screen.findByText(aboveNotice.message)).toBeInTheDocument();
    expect(screen.getByText('Above question')).toBeInTheDocument();
    expect(screen.getByText(belowNotice.message)).toBeInTheDocument();
    expect(screen.getByText('Below question')).toBeInTheDocument();

    getQuestionNotice.mockReset();
  });

  test('renders an explicit no-notice state for a notice GET 404', async () => {
    await loadWithoutNotices();

    expect(screen.getAllByText('No notice')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Add notice for question 1' }))
      .toBeInTheDocument();
  });

  test('shows a safe load error for non-404 failures and retry reloads everything', async () => {
    listQuestions.mockResolvedValue([questionOne]);
    getQuestionNotice
      .mockRejectedValueOnce(new ApiError(409, 'Published exam ownership changed.'))
      .mockRejectedValueOnce(noNotice());
    const user = userEvent.setup();

    renderEditor();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Published exam ownership changed.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No notice')).toBeInTheDocument();
    expect(listQuestions).toHaveBeenCalledTimes(2);
    expect(getQuestionNotice).toHaveBeenCalledTimes(2);
  });

  test('does not expose unexpected error details', async () => {
    listQuestions.mockRejectedValue(new Error('secret URL and stack details'));

    renderEditor();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load question notices.',
    );
    expect(screen.queryByText(/secret URL/)).not.toBeInTheDocument();
  });

  test('does not update rendered state after unmount', async () => {
    const request = deferred();
    listQuestions.mockReturnValue(request.promise);
    getQuestionNotice.mockRejectedValue(noNotice());
    const { container, unmount } = renderEditor();

    unmount();
    await act(async () => request.resolve([questionOne]));

    expect(container).toBeEmptyDOMElement();
    expect(getQuestionNotice).toHaveBeenCalledWith(exam.id, questionOne.id);
  });

  test('shows read-only metadata without question-authoring controls', async () => {
    await loadWithoutNotices();

    expect(screen.getByRole('heading', { name: 'Question notices' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: exam.title })).toBeInTheDocument();
    expect(screen.getByText(/Published exam and question content is read-only/))
      .toBeInTheDocument();
    expect(screen.getByText(/Question 1 · Multiple choice · 2 points/)).toBeInTheDocument();
    expect(screen.getByText(/Question 2 · Short answer · 1 point/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move question/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit question/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete question/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/correct answer|reference answer|question prompt/i))
      .not.toBeInTheDocument();
  });
});

describe('adding and editing question notices', () => {
  test('opens one new form with an empty message and above placement', async () => {
    await loadWithoutNotices();
    const user = await openAddForm(1);

    expect(screen.getByLabelText('Notice message for question 1')).toHaveValue('');
    expect(screen.getByLabelText('Notice placement for question 1')).toHaveValue('above');
    expect(screen.getByText('0 / 1000 characters')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add notice for question 2' }));
    expect(screen.queryByLabelText('Notice message for question 1')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Notice message for question 2')).toBeInTheDocument();
  });

  test('saves an above notice with the exact trimmed payload', async () => {
    const saved = { ...aboveNotice, message: 'Trimmed clarification' };
    saveQuestionNotice.mockResolvedValue(saved);
    await loadWithoutNotices();
    const user = await openAddForm(1);

    await user.type(
      screen.getByLabelText('Notice message for question 1'),
      '  Trimmed clarification  ',
    );
    await user.click(screen.getByRole('button', { name: 'Save notice for question 1' }));

    expect(saveQuestionNotice).toHaveBeenCalledWith(exam.id, questionOne.id, {
      message: 'Trimmed clarification',
      placement: 'above',
    });
    expect(saveQuestionNotice).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(saved.message)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Notice for question 1 was saved.');
  });

  test('saves a below notice and updates only the targeted question', async () => {
    const saved = { ...belowNotice, message: 'New notice for question two' };
    listQuestions.mockResolvedValue([questionOne, questionTwo]);
    getQuestionNotice
      .mockRejectedValueOnce(noNotice())
      .mockResolvedValueOnce(belowNotice);
    saveQuestionNotice.mockResolvedValue(saved);
    const user = userEvent.setup();
    renderEditor();
    await screen.findByText(belowNotice.message);

    await user.click(screen.getByRole('button', { name: 'Add notice for question 1' }));
    await user.type(screen.getByLabelText('Notice message for question 1'), saved.message);
    await user.selectOptions(screen.getByLabelText('Notice placement for question 1'), 'below');
    await user.click(screen.getByRole('button', { name: 'Save notice for question 1' }));

    expect(saveQuestionNotice).toHaveBeenCalledWith(exam.id, questionOne.id, {
      message: saved.message,
      placement: 'below',
    });
    expect(await screen.findByText(saved.message)).toBeInTheDocument();
    expect(screen.getByText(belowNotice.message)).toBeInTheDocument();
  });

  test('prefills editing exactly and cancel preserves the stored notice', async () => {
    listQuestions.mockResolvedValue([questionOne]);
    getQuestionNotice.mockResolvedValue(aboveNotice);
    const user = userEvent.setup();
    renderEditor();
    await screen.findByText(aboveNotice.message);

    await user.click(screen.getByRole('button', { name: 'Edit notice for question 1' }));
    expect(screen.getByLabelText('Notice message for question 1'))
      .toHaveValue(aboveNotice.message);
    expect(screen.getByLabelText('Notice placement for question 1')).toHaveValue('above');
    await user.clear(screen.getByLabelText('Notice message for question 1'));
    await user.type(screen.getByLabelText('Notice message for question 1'), 'Discarded');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(saveQuestionNotice).not.toHaveBeenCalled();
    expect(screen.getByText(aboveNotice.message)).toBeInTheDocument();
    expect(screen.queryByText('Discarded')).not.toBeInTheDocument();
  });

  test('preserves failed-save values and permits retry', async () => {
    const saved = { ...belowNotice, question_id: questionOne.id };
    saveQuestionNotice
      .mockRejectedValueOnce(new ApiError(409, 'Notice could not be saved yet.'))
      .mockResolvedValueOnce(saved);
    await loadWithoutNotices();
    const user = await openAddForm(1);

    await user.type(screen.getByLabelText('Notice message for question 1'), saved.message);
    await user.selectOptions(screen.getByLabelText('Notice placement for question 1'), 'below');
    await user.click(screen.getByRole('button', { name: 'Save notice for question 1' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Notice could not be saved yet.');
    expect(screen.getByLabelText('Notice message for question 1')).toHaveValue(saved.message);
    expect(screen.getByLabelText('Notice placement for question 1')).toHaveValue('below');

    await user.click(screen.getByRole('button', { name: 'Save notice for question 1' }));
    expect(saveQuestionNotice).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(saved.message)).toBeInTheDocument();
  });
});

describe('notice validation', () => {
  test.each([
    ['', 'Notice message is required.'],
    ['   \n\t ', 'Notice message is required.'],
  ])('rejects blank input %j locally', async (message, expectedError) => {
    await loadWithoutNotices();
    await openAddForm(1);
    fireEvent.change(screen.getByLabelText('Notice message for question 1'), {
      target: { value: message },
    });

    fireEvent.submit(screen.getByLabelText('Notice message for question 1').closest('form'));

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedError);
    expect(saveQuestionNotice).not.toHaveBeenCalled();
  });

  test('rejects more than 1000 Unicode code points but accepts exactly 1000', async () => {
    const acceptedMessage = '😀'.repeat(1000);
    const saved = { ...aboveNotice, message: acceptedMessage };
    saveQuestionNotice.mockResolvedValue(saved);
    await loadWithoutNotices();
    await openAddForm(1);
    const messageField = screen.getByLabelText('Notice message for question 1');

    fireEvent.change(messageField, { target: { value: `${acceptedMessage}x` } });
    expect(screen.getByText('1001 / 1000 characters')).toBeInTheDocument();
    fireEvent.submit(messageField.closest('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Notice message must be 1000 characters or fewer.',
    );
    expect(saveQuestionNotice).not.toHaveBeenCalled();

    fireEvent.change(messageField, { target: { value: acceptedMessage } });
    expect(screen.getByText('1000 / 1000 characters')).toBeInTheDocument();
    fireEvent.submit(messageField.closest('form'));

    await waitFor(() => expect(saveQuestionNotice).toHaveBeenCalledWith(
      exam.id,
      questionOne.id,
      { message: acceptedMessage, placement: 'above' },
    ));
  });

  test('counts a surrogate-pair emoji as one code point', async () => {
    await loadWithoutNotices();
    await openAddForm(1);

    fireEvent.change(screen.getByLabelText('Notice message for question 1'), {
      target: { value: '😀' },
    });

    expect(screen.getByText('1 / 1000 characters')).toBeInTheDocument();
  });

  test('rejects an invalid placement before service invocation', async () => {
    await loadWithoutNotices();
    await openAddForm(1);
    fireEvent.change(screen.getByLabelText('Notice message for question 1'), {
      target: { value: 'A valid message' },
    });
    fireEvent.change(screen.getByLabelText('Notice placement for question 1'), {
      target: { value: 'sideways' },
    });

    fireEvent.submit(screen.getByLabelText('Notice message for question 1').closest('form'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Notice placement must be above or below the question.',
    );
    expect(saveQuestionNotice).not.toHaveBeenCalled();
  });
});

describe('notice deletion', () => {
  const loadExistingNotice = async () => {
    listQuestions.mockResolvedValue([questionOne]);
    getQuestionNotice.mockResolvedValue(aboveNotice);
    renderEditor();
    await screen.findByText(aboveNotice.message);
  };

  test('requires confirmation and cancellation preserves the notice', async () => {
    const user = userEvent.setup();
    await loadExistingNotice();

    await user.click(screen.getByRole('button', { name: 'Delete notice for question 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Delete the notice for question 1?');
    expect(deleteQuestionNotice).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel delete' }));

    expect(deleteQuestionNotice).not.toHaveBeenCalled();
    expect(screen.getByText(aboveNotice.message)).toBeInTheDocument();
  });

  test('confirms with exact arguments and success changes the question to no notice', async () => {
    deleteQuestionNotice.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await loadExistingNotice();

    await user.click(screen.getByRole('button', { name: 'Delete notice for question 1' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete notice' }));

    expect(deleteQuestionNotice).toHaveBeenCalledWith(exam.id, questionOne.id);
    expect(deleteQuestionNotice).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('No notice')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Notice for question 1 was deleted.');
  });

  test('failure retains the notice and confirmation, shows a safe error, and permits retry', async () => {
    deleteQuestionNotice
      .mockRejectedValueOnce(new ApiError(409, 'Notice deletion is temporarily blocked.'))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    await loadExistingNotice();

    await user.click(screen.getByRole('button', { name: 'Delete notice for question 1' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete notice' }));

    expect(await screen.findByText('Notice deletion is temporarily blocked.'))
      .toBeInTheDocument();
    expect(screen.getByText(aboveNotice.message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm delete notice' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Confirm delete notice' }));
    expect(deleteQuestionNotice).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('No notice')).toBeInTheDocument();
  });
});

describe('pending mutation and navigation safety', () => {
  test('a rapid duplicate save starts only one request', async () => {
    const request = deferred();
    saveQuestionNotice.mockReturnValue(request.promise);
    await loadWithoutNotices();
    await openAddForm(1);
    const messageField = screen.getByLabelText('Notice message for question 1');
    fireEvent.change(messageField, { target: { value: 'One request only' } });
    const form = messageField.closest('form');

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(saveQuestionNotice).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve({
      ...aboveNotice,
      message: 'One request only',
    }));
  });

  test('blocks rapid save/delete overlap and disables all notice controls and back', async () => {
    const request = deferred();
    listQuestions.mockResolvedValue([questionOne, questionTwo]);
    getQuestionNotice
      .mockRejectedValueOnce(noNotice())
      .mockResolvedValueOnce(belowNotice);
    saveQuestionNotice.mockReturnValue(request.promise);
    const onBack = vi.fn();
    renderEditor({ onBack });
    await screen.findByText(belowNotice.message);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add notice for question 1' }));
    const messageField = screen.getByLabelText('Notice message for question 1');
    fireEvent.change(messageField, { target: { value: 'Pending save' } });

    fireEvent.submit(messageField.closest('form'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete notice for question 2' }));

    expect(saveQuestionNotice).toHaveBeenCalledTimes(1);
    expect(deleteQuestionNotice).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save notice for question 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete notice for question 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit notice for question 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to exams' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Back to exams' }));
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => request.resolve({ ...aboveNotice, message: 'Pending save' }));
  });

  test('disables add controls while deletion is pending', async () => {
    const request = deferred();
    listQuestions.mockResolvedValue([questionOne, questionTwo]);
    getQuestionNotice
      .mockResolvedValueOnce(aboveNotice)
      .mockRejectedValueOnce(noNotice());
    deleteQuestionNotice.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderEditor();
    await screen.findByText(aboveNotice.message);

    await user.click(screen.getByRole('button', { name: 'Delete notice for question 1' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete notice' }));

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add notice for question 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to exams' })).toBeDisabled();

    await act(async () => request.resolve());
  });

  test('back calls onBack once when no mutation is pending', async () => {
    const onBack = vi.fn();
    listQuestions.mockResolvedValue([]);
    renderEditor({ onBack });
    await screen.findByText('No questions are available for this published exam.');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Back to exams' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
