import {
  act,
  render,
  screen,
  waitFor,
  within,
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
import {
  createExamType,
  deleteExamType,
  listExamTypes,
  updateExamType,
} from '../api/examTypeService';
import { ApiError } from '../api/apiClient';
import {
  createLecturerExam,
  deleteLecturerExam,
  listLecturerExams,
  publishLecturerExam,
  updateLecturerExam,
} from '../api/lecturerExamService';
import { listQuestions } from '../api/questionService';
import TeacherDashboard from './TeacherDashboard';

vi.mock('../api/examTypeService', () => ({
  createExamType: vi.fn(),
  deleteExamType: vi.fn(),
  listExamTypes: vi.fn(),
  updateExamType: vi.fn(),
}));

vi.mock('../api/lecturerExamService', () => ({
  createLecturerExam: vi.fn(),
  deleteLecturerExam: vi.fn(),
  listLecturerExams: vi.fn(),
  publishLecturerExam: vi.fn(),
  updateLecturerExam: vi.fn(),
}));

vi.mock('../api/questionService', () => ({
  createQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
  listQuestions: vi.fn(),
  reorderQuestions: vi.fn(),
  updateQuestion: vi.fn(),
}));

const lecturer = {
  id: 19,
  username: 'lecturer_one',
  role: 'lecturer',
};

const ownedType = {
  id: 7,
  name: 'Algorithms',
  description: 'Owned type',
  created_by: lecturer.id,
  created_at: '2026-07-15T08:00:00.000Z',
  updated_at: '2026-07-15T09:00:00.000Z',
};

const sharedType = {
  ...ownedType,
  id: 8,
  name: 'Shared assessment',
  description: 'Available to every lecturer',
  created_by: 77,
};

const draftExam = {
  id: 31,
  lecturer_id: lecturer.id,
  exam_type_id: ownedType.id,
  title: 'Algorithms midterm',
  description: 'Core algorithms',
  status: 'draft',
  created_at: '2026-07-15T08:00:00.000Z',
  updated_at: '2026-07-15T09:00:00.000Z',
  published_at: null,
  exam_type: {
    id: ownedType.id,
    name: ownedType.name,
  },
  question_count: 2,
};

const zeroQuestionExam = {
  ...draftExam,
  id: 32,
  title: 'Empty algorithms draft',
  question_count: 0,
};

const publishedExam = {
  ...draftExam,
  status: 'published',
  updated_at: '2026-07-15T10:00:00.000Z',
  published_at: '2026-07-15T10:00:00.000Z',
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

const renderDashboard = (props = {}) => render(
  <TeacherDashboard currentUser={lecturer} {...props} />,
);

const loadDashboard = async ({
  examTypes = [],
  exams = [],
  props = {},
} = {}) => {
  listExamTypes.mockResolvedValue(examTypes);
  listLecturerExams.mockResolvedValue(exams);
  const result = renderDashboard(props);
  await screen.findByRole('heading', { name: 'Exam types' });
  return result;
};

let fetchSpy;

beforeEach(() => {
  vi.clearAllMocks();
  listQuestions.mockResolvedValue([]);
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

describe('lecturer exam-authoring workspace', () => {
  test('shows a loading state until both server-backed lists resolve', async () => {
    const examTypesRequest = deferred();
    const examsRequest = deferred();
    listExamTypes.mockReturnValue(examTypesRequest.promise);
    listLecturerExams.mockReturnValue(examsRequest.promise);

    renderDashboard();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading exam authoring workspace',
    );
    expect(screen.queryByText('No exam types are available yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('No exams have been created yet.')).not.toBeInTheDocument();

    await act(async () => {
      examTypesRequest.resolve([]);
      examsRequest.resolve([]);
    });

    expect(await screen.findByText('No exam types are available yet.')).toBeInTheDocument();
  });

  test('shows separate empty states for exam types and exams', async () => {
    await loadDashboard();

    expect(screen.getByText('No exam types are available yet.')).toBeInTheDocument();
    expect(screen.getByText('No exams have been created yet.')).toBeInTheDocument();
    expect(listExamTypes).toHaveBeenCalledTimes(1);
    expect(listLecturerExams).toHaveBeenCalledTimes(1);
  });

  test('renders ownership, exam projections, and draft publishing controls', async () => {
    await loadDashboard({
      examTypes: [ownedType, sharedType],
      exams: [draftExam],
    });

    const typeRegion = screen.getByRole('region', { name: 'Exam types' });
    expect(within(typeRegion).getByText(ownedType.name)).toBeInTheDocument();
    expect(within(typeRegion).getByText('Created by you')).toBeInTheDocument();
    expect(within(typeRegion).getByText(sharedType.name)).toBeInTheDocument();
    expect(within(typeRegion).getByText('Shared type')).toBeInTheDocument();

    const examRegion = screen.getByRole('region', { name: 'Exams' });
    expect(within(examRegion).getByRole('heading', { name: draftExam.title }))
      .toBeInTheDocument();
    expect(within(examRegion).getByText(draftExam.description)).toBeInTheDocument();
    expect(within(examRegion).getByText(draftExam.exam_type.name)).toBeInTheDocument();
    expect(within(examRegion).getByText(draftExam.status)).toBeInTheDocument();
    expect(within(examRegion).getByText(String(draftExam.question_count))).toBeInTheDocument();
    expect(within(examRegion).getByText(
      new Date(draftExam.updated_at).toLocaleDateString(),
    )).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Publish ${draftExam.title}` }))
      .toBeEnabled();
  });

  test('shared exam types cannot be changed but remain selectable for an exam', async () => {
    await loadDashboard({ examTypes: [ownedType, sharedType] });

    expect(screen.getByRole('button', { name: `Edit ${ownedType.name}` }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete ${ownedType.name}` }))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Edit ${sharedType.name}` }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Delete ${sharedType.name}` }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: `${sharedType.name} (shared)` }))
      .toBeInTheDocument();
  });

  test('recovers from a safe initial-load failure', async () => {
    listExamTypes
      .mockRejectedValueOnce(new ApiError(503, 'Unable to load exam types safely.'))
      .mockResolvedValueOnce([]);
    listLecturerExams.mockResolvedValue([]);
    const user = userEvent.setup();

    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load exam types safely.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No exam types are available yet.')).toBeInTheDocument();
    expect(listExamTypes).toHaveBeenCalledTimes(2);
    expect(listLecturerExams).toHaveBeenCalledTimes(2);
  });
});

describe('exam-type management', () => {
  test('creates an exam type with normalized input and success feedback', async () => {
    const createdType = {
      ...ownedType,
      id: 10,
      name: 'Databases',
      description: null,
    };
    createExamType.mockResolvedValue(createdType);
    const user = userEvent.setup();
    await loadDashboard();

    await user.type(screen.getByLabelText('Exam type name'), '  Databases  ');
    await user.type(screen.getByLabelText('Exam type description'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create exam type' }));

    expect(createExamType).toHaveBeenCalledWith({
      name: 'Databases',
      description: null,
    });
    expect(await screen.findByText(createdType.name)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Databases.*created/);
  });

  test('edits an owned exam type and can cancel without saving', async () => {
    const updatedType = {
      ...ownedType,
      name: 'Advanced algorithms',
      description: 'Updated curriculum',
    };
    updateExamType.mockResolvedValue(updatedType);
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType] });

    await user.click(screen.getByRole('button', { name: `Edit ${ownedType.name}` }));
    const nameInput = screen.getByLabelText('Edit exam type name');
    expect(nameInput).toHaveValue(ownedType.name);
    await user.clear(nameInput);
    await user.type(nameInput, 'Discarded edit');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(updateExamType).not.toHaveBeenCalled();
    expect(screen.getByText(ownedType.name)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Edit ${ownedType.name}` }));
    await user.clear(screen.getByLabelText('Edit exam type name'));
    await user.type(screen.getByLabelText('Edit exam type name'), ' Advanced algorithms ');
    await user.clear(screen.getByLabelText('Edit exam type description'));
    await user.type(screen.getByLabelText('Edit exam type description'), ' Updated curriculum ');
    await user.click(screen.getByRole('button', { name: 'Save exam type' }));

    expect(updateExamType).toHaveBeenCalledWith(ownedType.id, {
      name: updatedType.name,
      description: updatedType.description,
    });
    expect(await screen.findByText(updatedType.name)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Advanced algorithms.*updated/);
  });

  test('validates an exam type before calling the service', async () => {
    const user = userEvent.setup();
    await loadDashboard();

    await user.type(screen.getByLabelText('Exam type name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create exam type' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Exam type name is required.');
    expect(createExamType).not.toHaveBeenCalled();
  });

  test('cancels and confirms deletion through an accessible confirmation', async () => {
    deleteExamType.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType] });

    await user.click(screen.getByRole('button', { name: `Delete ${ownedType.name}` }));
    expect(screen.getByRole('alert')).toHaveTextContent(ownedType.name);
    await user.click(screen.getByRole('button', { name: 'Cancel delete' }));
    expect(deleteExamType).not.toHaveBeenCalled();
    expect(screen.getByText(ownedType.name)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Delete ${ownedType.name}` }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(deleteExamType).toHaveBeenCalledWith(ownedType.id);
    await waitFor(() => {
      expect(screen.queryByText(ownedType.name)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('status')).toHaveTextContent(/Algorithms.*deleted/);
  });

  test('keeps the type visible when deletion returns a safe API error', async () => {
    deleteExamType.mockRejectedValue(
      new ApiError(409, 'Exam types in use by an exam cannot be deleted.'),
    );
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType] });

    await user.click(screen.getByRole('button', { name: `Delete ${ownedType.name}` }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));

    expect(await screen.findByText(
      'Exam types in use by an exam cannot be deleted.',
    )).toBeInTheDocument();
    expect(screen.getByText(ownedType.name)).toBeInTheDocument();
  });
});

describe('draft exam management', () => {
  test('creates a draft with a shared type and prevents duplicate submission', async () => {
    const createdExam = {
      ...draftExam,
      id: 32,
      exam_type_id: sharedType.id,
      title: 'Shared final',
      description: 'Cross-team assessment',
      exam_type: { id: sharedType.id, name: sharedType.name },
      question_count: 0,
    };
    const request = deferred();
    createLecturerExam.mockReturnValue(request.promise);
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType, sharedType] });

    await user.type(screen.getByLabelText('Exam title'), '  Shared final  ');
    await user.selectOptions(screen.getByLabelText('Exam type'), String(sharedType.id));
    await user.type(screen.getByLabelText('Exam description'), ' Cross-team assessment ');
    await user.click(screen.getByRole('button', { name: 'Create exam' }));

    expect(createLecturerExam).toHaveBeenCalledWith({
      title: createdExam.title,
      description: createdExam.description,
      exam_type_id: sharedType.id,
    });
    const pendingButton = screen.getByRole('button', { name: /Creating/ });
    expect(pendingButton).toBeDisabled();
    await user.click(pendingButton);
    expect(createLecturerExam).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve(createdExam);
    });
    expect(await screen.findByRole('heading', { name: createdExam.title }))
      .toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Shared final.*created/);
  });

  test('validates a draft before calling the service', async () => {
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType] });

    await user.selectOptions(screen.getByLabelText('Exam type'), String(ownedType.id));
    await user.click(screen.getByRole('button', { name: 'Create exam' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Exam title is required.');
    expect(createLecturerExam).not.toHaveBeenCalled();
  });

  test('edits a draft, supports cancel, and updates its projection', async () => {
    const updatedExam = {
      ...draftExam,
      title: 'Revised algorithms midterm',
      description: null,
      exam_type_id: sharedType.id,
      exam_type: { id: sharedType.id, name: sharedType.name },
    };
    updateLecturerExam.mockResolvedValue(updatedExam);
    const user = userEvent.setup();
    await loadDashboard({
      examTypes: [ownedType, sharedType],
      exams: [draftExam],
    });

    await user.click(screen.getByRole('button', { name: `Edit ${draftExam.title}` }));
    expect(screen.getByLabelText('Edit exam title')).toHaveValue(draftExam.title);
    await user.clear(screen.getByLabelText('Edit exam title'));
    await user.type(screen.getByLabelText('Edit exam title'), 'Discarded exam title');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(updateLecturerExam).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: `Edit ${draftExam.title}` }));
    await user.clear(screen.getByLabelText('Edit exam title'));
    await user.type(
      screen.getByLabelText('Edit exam title'),
      ` ${updatedExam.title} `,
    );
    await user.clear(screen.getByLabelText('Edit exam description'));
    await user.type(screen.getByLabelText('Edit exam description'), '   ');
    await user.selectOptions(
      screen.getByLabelText('Edit exam type'),
      String(sharedType.id),
    );
    await user.click(screen.getByRole('button', { name: 'Save exam' }));

    expect(updateLecturerExam).toHaveBeenCalledWith(draftExam.id, {
      title: updatedExam.title,
      description: null,
      exam_type_id: sharedType.id,
    });
    expect(await screen.findByRole('heading', { name: updatedExam.title }))
      .toBeInTheDocument();
    expect(screen.getByText(sharedType.name, { selector: 'dd' })).toBeInTheDocument();
  });

  test('cancels and confirms draft deletion', async () => {
    deleteLecturerExam.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType], exams: [draftExam] });

    await user.click(screen.getByRole('button', { name: `Delete ${draftExam.title}` }));
    await user.click(screen.getByRole('button', { name: 'Cancel delete' }));
    expect(deleteLecturerExam).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: draftExam.title })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Delete ${draftExam.title}` }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(deleteLecturerExam).toHaveBeenCalledWith(draftExam.id);
    expect(await screen.findByText('No exams have been created yet.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Algorithms midterm.*deleted/);
  });

  test('shows a safe mutation error and preserves the original draft', async () => {
    updateLecturerExam.mockRejectedValue(new ApiError(404, 'Exam not found.'));
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType], exams: [draftExam] });

    await user.click(screen.getByRole('button', { name: `Edit ${draftExam.title}` }));
    await user.clear(screen.getByLabelText('Edit exam title'));
    await user.type(screen.getByLabelText('Edit exam title'), 'Missing draft');
    await user.click(screen.getByRole('button', { name: 'Save exam' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Exam not found.');
    expect(screen.getByLabelText('Edit exam title')).toHaveValue('Missing draft');
    expect(updateLecturerExam).toHaveBeenCalledTimes(1);
  });

  test('passes a selected draft to the question-editor callback', async () => {
    const onOpenQuestionEditor = vi.fn();
    const user = userEvent.setup();
    await loadDashboard({
      examTypes: [ownedType],
      exams: [draftExam],
      props: { onOpenQuestionEditor },
    });

    await user.click(screen.getByRole('button', {
      name: `Manage questions for ${draftExam.title}`,
    }));

    expect(onOpenQuestionEditor).toHaveBeenCalledWith(draftExam);
    expect(onOpenQuestionEditor).toHaveBeenCalledTimes(1);
  });

  test('opens an internal question-editor shell when no callback is supplied', async () => {
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType], exams: [draftExam] });

    await user.click(screen.getByRole('button', {
      name: `Manage questions for ${draftExam.title}`,
    }));

    expect(screen.getByRole('heading', { name: 'Question editor' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: draftExam.title })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to exams' }));
    expect(screen.getByRole('heading', { name: 'Teacher Dashboard' })).toBeInTheDocument();
  });
});

describe('lecturer exam publication', () => {
  test('disables publication for a zero-question draft and explains why', async () => {
    const user = userEvent.setup();
    await loadDashboard({
      examTypes: [ownedType],
      exams: [zeroQuestionExam],
    });

    const publishButton = screen.getByRole('button', {
      name: `Publish ${zeroQuestionExam.title}`,
    });
    expect(publishButton).toBeDisabled();
    expect(screen.getByText('Add at least one question before publishing.'))
      .toBeInTheDocument();

    await user.click(publishButton);
    expect(publishLecturerExam).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Confirm publish' }))
      .not.toBeInTheDocument();
  });

  test('opens and cancels inline publication confirmation without calling the API', async () => {
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType], exams: [draftExam] });

    await user.click(screen.getByRole('button', {
      name: `Publish ${draftExam.title}`,
    }));

    const confirmation = screen.getByRole('alert');
    expect(confirmation).toHaveTextContent('available as published');
    expect(confirmation).toHaveTextContent('content will become read-only');
    expect(confirmation).toHaveTextContent('cannot currently be undone');
    expect(publishLecturerExam).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel publish' }));
    expect(screen.queryByRole('button', { name: 'Confirm publish' }))
      .not.toBeInTheDocument();
    expect(publishLecturerExam).not.toHaveBeenCalled();
  });

  test('locks competing actions while publishing and renders the exact server response', async () => {
    const request = deferred();
    publishLecturerExam.mockReturnValue(request.promise);
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType], exams: [draftExam] });

    await user.click(screen.getByRole('button', {
      name: `Publish ${draftExam.title}`,
    }));
    await user.click(screen.getByRole('button', { name: 'Confirm publish' }));

    expect(publishLecturerExam).toHaveBeenCalledWith(draftExam.id);
    expect(publishLecturerExam).toHaveBeenCalledTimes(1);
    const pendingButton = screen.getByRole('button', { name: 'Publishing…' });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create exam' })).toBeDisabled();
    expect(screen.getByRole('button', {
      name: `Manage questions for ${draftExam.title}`,
    })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Edit ${draftExam.title}` }))
      .toBeDisabled();
    expect(screen.getByRole('button', { name: `Delete ${draftExam.title}` }))
      .toBeDisabled();
    expect(screen.getByText('draft')).toBeInTheDocument();

    await user.click(pendingButton);
    expect(publishLecturerExam).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve(publishedExam);
    });

    expect(await screen.findByText('published')).toBeInTheDocument();
    expect(screen.getByText('Published exams are read-only in the authoring workspace.'))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Publish ${draftExam.title}` }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Edit ${draftExam.title}` }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Delete ${draftExam.title}` }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('button', {
      name: `Manage questions for ${draftExam.title}`,
    })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      `Exam “${publishedExam.title}” was published.`,
    );
  });

  test('keeps confirmation and the draft intact after failure, then allows retry', async () => {
    publishLecturerExam
      .mockRejectedValueOnce(new ApiError(409, 'Exam needs at least one valid question.'))
      .mockResolvedValueOnce(publishedExam);
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType], exams: [draftExam] });

    await user.click(screen.getByRole('button', {
      name: `Publish ${draftExam.title}`,
    }));
    await user.click(screen.getByRole('button', { name: 'Confirm publish' }));

    expect(await screen.findByText('Exam needs at least one valid question.'))
      .toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm publish' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel publish' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Confirm publish' }));
    expect(publishLecturerExam).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('published')).toBeInTheDocument();
  });

  test('keeps edit, delete, and publication confirmations isolated', async () => {
    const user = userEvent.setup();
    await loadDashboard({ examTypes: [ownedType], exams: [draftExam] });

    await user.click(screen.getByRole('button', { name: `Delete ${draftExam.title}` }));
    expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', {
      name: `Publish ${draftExam.title}`,
    }));
    expect(screen.getByRole('button', { name: 'Confirm publish' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm delete' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Delete ${draftExam.title}` }));
    expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm publish' }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole('button', {
      name: `Publish ${draftExam.title}`,
    }));
    await user.click(screen.getByRole('button', { name: `Edit ${draftExam.title}` }));
    expect(screen.getByLabelText('Edit exam title')).toHaveValue(draftExam.title);
    expect(screen.queryByRole('button', { name: 'Confirm publish' }))
      .not.toBeInTheDocument();
  });
});
