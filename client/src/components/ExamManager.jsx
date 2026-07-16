import { useState } from 'react';
import { normalizeDescription, safeApiMessage } from './authoringUi';

const emptyForm = { title: '', description: '', examTypeId: '' };

const ExamFields = ({
  form,
  setForm,
  examTypes,
  currentUserId,
  idPrefix,
  disabled,
}) => (
  <div className="row g-3">
    <div className="col-md-6">
      <label className="form-label" htmlFor={`${idPrefix}-title`}>
        {idPrefix === 'create-exam' ? 'Exam title' : 'Edit exam title'}
      </label>
      <input
        id={`${idPrefix}-title`}
        className="form-control"
        value={form.title}
        onChange={(event) => setForm((current) => ({
          ...current,
          title: event.target.value,
        }))}
        disabled={disabled}
        maxLength={150}
      />
    </div>
    <div className="col-md-6">
      <label className="form-label" htmlFor={`${idPrefix}-type`}>
        {idPrefix === 'create-exam' ? 'Exam type' : 'Edit exam type'}
      </label>
      <select
        id={`${idPrefix}-type`}
        className="form-select"
        value={form.examTypeId}
        onChange={(event) => setForm((current) => ({
          ...current,
          examTypeId: event.target.value,
        }))}
        disabled={disabled}
      >
        <option value="">Select an exam type</option>
        {examTypes.map((examType) => (
          <option key={examType.id} value={examType.id}>
            {examType.name}
            {examType.created_by === currentUserId ? ' (yours)' : ' (shared)'}
          </option>
        ))}
      </select>
    </div>
    <div className="col-12">
      <label className="form-label" htmlFor={`${idPrefix}-description`}>
        {idPrefix === 'create-exam' ? 'Exam description' : 'Edit exam description'}
      </label>
      <textarea
        id={`${idPrefix}-description`}
        className="form-control"
        value={form.description}
        onChange={(event) => setForm((current) => ({
          ...current,
          description: event.target.value,
        }))}
        disabled={disabled}
        rows="2"
      />
    </div>
  </div>
);

const ExamManager = ({
  exams,
  examTypes,
  currentUserId,
  onCreate,
  onUpdate,
  onDelete,
  onPublish,
  onOpenQuestions,
  onOpenNotices,
}) => {
  const [createForm, setCreateForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmPublishId, setConfirmPublishId] = useState(null);
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');

  const validateForm = (form) => {
    const title = form.title.trim();
    const examTypeId = Number(form.examTypeId);

    if (!title) {
      setError('Exam title is required.');
      return null;
    }

    if (title.length > 150) {
      setError('Exam title must be at most 150 characters.');
      return null;
    }

    if (!Number.isSafeInteger(examTypeId) || examTypeId < 1) {
      setError('Select an exam type.');
      return null;
    }

    return {
      title,
      description: normalizeDescription(form.description),
      exam_type_id: examTypeId,
    };
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const payload = validateForm(createForm);

    if (!payload || pendingAction) {
      return;
    }

    setPendingAction('create');
    setError('');

    try {
      await onCreate(payload);
      setCreateForm(emptyForm);
    } catch (requestError) {
      setError(safeApiMessage(requestError, 'Unable to create the exam.'));
    } finally {
      setPendingAction('');
    }
  };

  const beginEdit = (exam) => {
    setEditingId(exam.id);
    setEditForm({
      title: exam.title,
      description: exam.description ?? '',
      examTypeId: String(exam.exam_type_id),
    });
    setConfirmDeleteId(null);
    setConfirmPublishId(null);
    setError('');
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    const payload = validateForm(editForm);

    if (!payload || pendingAction) {
      return;
    }

    setPendingAction(`update-${editingId}`);
    setError('');

    try {
      await onUpdate(editingId, payload);
      setEditingId(null);
      setEditForm(emptyForm);
    } catch (requestError) {
      setError(safeApiMessage(requestError, 'Unable to update the exam.'));
    } finally {
      setPendingAction('');
    }
  };

  const handleDelete = async (exam) => {
    if (pendingAction) {
      return;
    }

    setPendingAction(`delete-${exam.id}`);
    setError('');

    try {
      await onDelete(exam.id);
      setConfirmDeleteId(null);
    } catch (requestError) {
      setError(safeApiMessage(requestError, 'Unable to delete the exam.'));
    } finally {
      setPendingAction('');
    }
  };

  const handlePublish = async (exam) => {
    if (pendingAction) {
      return;
    }

    setPendingAction(`publish-${exam.id}`);
    setError('');

    try {
      await onPublish(exam.id);
      setConfirmPublishId(null);
    } catch (requestError) {
      setError(safeApiMessage(requestError, 'Unable to publish the exam.'));
    } finally {
      setPendingAction('');
    }
  };

  return (
    <section className="card shadow-sm" aria-labelledby="exams-heading">
      <div className="card-header bg-dark text-white">
        <h2 id="exams-heading" className="h5 mb-0">Exams</h2>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <form onSubmit={handleCreate} className="border rounded p-3 mb-4">
          <h3 className="h6">Create draft exam</h3>
          <ExamFields
            form={createForm}
            setForm={setCreateForm}
            examTypes={examTypes}
            currentUserId={currentUserId}
            idPrefix="create-exam"
            disabled={Boolean(pendingAction)}
          />
          <button
            className="btn btn-success mt-3"
            type="submit"
            disabled={Boolean(pendingAction) || examTypes.length === 0}
          >
            {pendingAction === 'create' ? 'Creating…' : 'Create exam'}
          </button>
        </form>

        {exams.length === 0 ? (
          <p className="text-muted mb-0">No exams have been created yet.</p>
        ) : (
          <div className="vstack gap-3" aria-label="Lecturer exams">
            {exams.map((exam) => {
              const isEditing = editingId === exam.id;
              const isConfirmingDelete = confirmDeleteId === exam.id;
              const isConfirmingPublish = confirmPublishId === exam.id;
              const isDraft = exam.status === 'draft';
              const hasQuestions = exam.question_count > 0;
              const isPublishing = pendingAction === `publish-${exam.id}`;

              return (
                <article className="border rounded p-3" key={exam.id}>
                  {isEditing ? (
                    <form onSubmit={handleUpdate}>
                      <h3 className="h6">Edit {exam.title}</h3>
                      <ExamFields
                        form={editForm}
                        setForm={setEditForm}
                        examTypes={examTypes}
                        currentUserId={currentUserId}
                        idPrefix={`edit-exam-${exam.id}`}
                        disabled={Boolean(pendingAction)}
                      />
                      <div className="d-flex gap-2 mt-3">
                        <button
                          className="btn btn-sm btn-primary"
                          type="submit"
                          disabled={Boolean(pendingAction)}
                        >
                          Save exam
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={Boolean(pendingAction)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="d-flex justify-content-between align-items-start gap-3">
                        <div>
                          <h3 className="h5 mb-1">{exam.title}</h3>
                          <p className="mb-2">{exam.description || 'No description.'}</p>
                          <dl className="row small mb-0">
                            <dt className="col-sm-4">Exam type</dt>
                            <dd className="col-sm-8">{exam.exam_type.name}</dd>
                            <dt className="col-sm-4">Status</dt>
                            <dd className="col-sm-8 text-capitalize">{exam.status}</dd>
                            <dt className="col-sm-4">Questions</dt>
                            <dd className="col-sm-8">{exam.question_count}</dd>
                            <dt className="col-sm-4">Updated</dt>
                            <dd className="col-sm-8">
                              <time dateTime={exam.updated_at}>
                                {new Date(exam.updated_at).toLocaleDateString()}
                              </time>
                            </dd>
                          </dl>
                        </div>
                        {isDraft && (
                          <div className="d-flex flex-wrap justify-content-end gap-2">
                            <button
                              className="btn btn-sm btn-outline-success"
                              type="button"
                              onClick={() => {
                                setConfirmPublishId(exam.id);
                                setConfirmDeleteId(null);
                                setEditingId(null);
                                setError('');
                              }}
                              disabled={Boolean(pendingAction) || !hasQuestions}
                              aria-label={`Publish ${exam.title}`}
                            >
                              Publish
                            </button>
                            <button
                              className="btn btn-sm btn-outline-primary"
                              type="button"
                              onClick={() => onOpenQuestions(exam)}
                              disabled={Boolean(pendingAction)}
                              aria-label={`Manage questions for ${exam.title}`}
                            >
                              Manage questions
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              type="button"
                              onClick={() => beginEdit(exam)}
                              disabled={Boolean(pendingAction)}
                              aria-label={`Edit ${exam.title}`}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(exam.id);
                                setConfirmPublishId(null);
                                setEditingId(null);
                              }}
                              disabled={Boolean(pendingAction)}
                              aria-label={`Delete ${exam.title}`}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                        {!isDraft && (
                          <div className="d-flex flex-wrap justify-content-end gap-2">
                            <button
                              className="btn btn-sm btn-outline-primary"
                              type="button"
                              onClick={() => onOpenNotices(exam)}
                              disabled={Boolean(pendingAction)}
                              aria-label={`Manage notices for ${exam.title}`}
                            >
                              Manage notices
                            </button>
                          </div>
                        )}
                      </div>
                      {isDraft && !hasQuestions && (
                        <p className="text-muted mt-2 mb-0">
                          Add at least one question before publishing.
                        </p>
                      )}
                      {!isDraft && (
                        <p className="alert alert-secondary mt-3 mb-0">
                          Published exam and question content is read-only. Question notices
                          can still be managed separately.
                        </p>
                      )}
                      {isDraft && isConfirmingPublish && (
                        <div className="alert alert-info mt-3 mb-0" role="alert">
                          <p>
                            The exam will become available as published. Its exam and question
                            content will become read-only. Publishing cannot currently be undone.
                          </p>
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-sm btn-success"
                              type="button"
                              onClick={() => handlePublish(exam)}
                              disabled={Boolean(pendingAction)}
                            >
                              {isPublishing ? 'Publishing…' : 'Confirm publish'}
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              type="button"
                              onClick={() => setConfirmPublishId(null)}
                              disabled={Boolean(pendingAction)}
                            >
                              Cancel publish
                            </button>
                          </div>
                        </div>
                      )}
                      {isConfirmingDelete && (
                        <div className="alert alert-warning mt-3 mb-0" role="alert">
                          <p>Delete draft exam “{exam.title}” and all of its questions?</p>
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-sm btn-danger"
                              type="button"
                              onClick={() => handleDelete(exam)}
                              disabled={Boolean(pendingAction)}
                            >
                              Confirm delete
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={Boolean(pendingAction)}
                            >
                              Cancel delete
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default ExamManager;
