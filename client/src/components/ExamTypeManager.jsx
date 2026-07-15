import { useState } from 'react';
import { normalizeDescription, safeApiMessage } from './authoringUi';

const emptyForm = { name: '', description: '' };

const ExamTypeManager = ({
  examTypes,
  currentUserId,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [createForm, setCreateForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');

  const validateName = (name) => {
    const normalized = name.trim();

    if (!normalized) {
      setError('Exam type name is required.');
      return null;
    }

    if (normalized.length > 80) {
      setError('Exam type name must be at most 80 characters.');
      return null;
    }

    return normalized;
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const name = validateName(createForm.name);

    if (!name || pendingAction) {
      return;
    }

    setPendingAction('create');
    setError('');

    try {
      await onCreate({
        name,
        description: normalizeDescription(createForm.description),
      });
      setCreateForm(emptyForm);
    } catch (requestError) {
      setError(safeApiMessage(requestError, 'Unable to create the exam type.'));
    } finally {
      setPendingAction('');
    }
  };

  const beginEdit = (examType) => {
    setEditingId(examType.id);
    setEditForm({
      name: examType.name,
      description: examType.description ?? '',
    });
    setConfirmDeleteId(null);
    setError('');
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    const name = validateName(editForm.name);

    if (!name || pendingAction) {
      return;
    }

    setPendingAction(`update-${editingId}`);
    setError('');

    try {
      await onUpdate(editingId, {
        name,
        description: normalizeDescription(editForm.description),
      });
      setEditingId(null);
      setEditForm(emptyForm);
    } catch (requestError) {
      setError(safeApiMessage(requestError, 'Unable to update the exam type.'));
    } finally {
      setPendingAction('');
    }
  };

  const handleDelete = async (examType) => {
    if (pendingAction) {
      return;
    }

    setPendingAction(`delete-${examType.id}`);
    setError('');

    try {
      await onDelete(examType.id);
      setConfirmDeleteId(null);
    } catch (requestError) {
      setError(safeApiMessage(requestError, 'Unable to delete the exam type.'));
    } finally {
      setPendingAction('');
    }
  };

  return (
    <section className="card shadow-sm h-100" aria-labelledby="exam-types-heading">
      <div className="card-header bg-primary text-white">
        <h2 id="exam-types-heading" className="h5 mb-0">Exam types</h2>
      </div>
      <div className="card-body">
        {error && (
          <div className="alert alert-danger" role="alert">{error}</div>
        )}

        <form onSubmit={handleCreate} className="border rounded p-3 mb-4">
          <h3 className="h6">Create exam type</h3>
          <div className="mb-2">
            <label className="form-label" htmlFor="create-exam-type-name">
              Exam type name
            </label>
            <input
              id="create-exam-type-name"
              className="form-control"
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({
                ...current,
                name: event.target.value,
              }))}
              disabled={Boolean(pendingAction)}
              maxLength={80}
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="create-exam-type-description">
              Exam type description
            </label>
            <textarea
              id="create-exam-type-description"
              className="form-control"
              value={createForm.description}
              onChange={(event) => setCreateForm((current) => ({
                ...current,
                description: event.target.value,
              }))}
              disabled={Boolean(pendingAction)}
              rows="2"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={Boolean(pendingAction)}>
            {pendingAction === 'create' ? 'Creating…' : 'Create exam type'}
          </button>
        </form>

        <h3 className="h6">Available exam types</h3>
        {examTypes.length === 0 ? (
          <p className="text-muted mb-0">No exam types are available yet.</p>
        ) : (
          <ul className="list-group" aria-label="Available exam types">
            {examTypes.map((examType) => {
              const isOwned = examType.created_by === currentUserId;
              const isEditing = editingId === examType.id;
              const isConfirmingDelete = confirmDeleteId === examType.id;

              return (
                <li className="list-group-item" key={examType.id}>
                  {isEditing ? (
                    <form onSubmit={handleUpdate}>
                      <label className="form-label" htmlFor={`edit-type-name-${examType.id}`}>
                        Edit exam type name
                      </label>
                      <input
                        id={`edit-type-name-${examType.id}`}
                        className="form-control mb-2"
                        value={editForm.name}
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))}
                        disabled={Boolean(pendingAction)}
                      />
                      <label
                        className="form-label"
                        htmlFor={`edit-type-description-${examType.id}`}
                      >
                        Edit exam type description
                      </label>
                      <textarea
                        id={`edit-type-description-${examType.id}`}
                        className="form-control mb-2"
                        value={editForm.description}
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))}
                        disabled={Boolean(pendingAction)}
                        rows="2"
                      />
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-primary"
                          type="submit"
                          disabled={Boolean(pendingAction)}
                        >
                          Save exam type
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
                      <div className="d-flex justify-content-between gap-3">
                        <div>
                          <div className="fw-semibold">{examType.name}</div>
                          <div className="small text-muted">
                            {examType.description || 'No description.'}
                          </div>
                          <span className={`badge ${isOwned ? 'text-bg-primary' : 'text-bg-secondary'}`}>
                            {isOwned ? 'Created by you' : 'Shared type'}
                          </span>
                        </div>
                        {isOwned && (
                          <div className="d-flex align-items-start gap-2">
                            <button
                              className="btn btn-sm btn-outline-primary"
                              type="button"
                              onClick={() => beginEdit(examType)}
                              aria-label={`Edit ${examType.name}`}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(examType.id);
                                setEditingId(null);
                              }}
                              aria-label={`Delete ${examType.name}`}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      {isConfirmingDelete && (
                        <div className="alert alert-warning mt-3 mb-0" role="alert">
                          <p>Delete exam type “{examType.name}”?</p>
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-sm btn-danger"
                              type="button"
                              onClick={() => handleDelete(examType)}
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ExamTypeManager;
