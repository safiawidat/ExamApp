import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/apiClient';
import {
  deleteQuestionNotice,
  getQuestionNotice,
  saveQuestionNotice,
} from '../api/questionNoticeService';
import { listQuestions } from '../api/questionService';
import { safeApiMessage } from './authoringUi';

const NOTICE_PLACEMENTS = new Set(['above', 'below']);

const orderQuestions = (questions) => [...questions].sort((left, right) => (
  left.position - right.position || left.id - right.id
));

const questionTypeLabel = (questionType) => ({
  multiple_choice: 'Multiple choice',
  true_false: 'True / false',
  short_answer: 'Short answer',
}[questionType] ?? questionType);

const placementLabel = (placement) => (
  placement === 'above' ? 'Above question' : 'Below question'
);

const loadQuestionNotices = async (examId) => {
  const questions = orderQuestions(await listQuestions(examId));
  const notices = await Promise.all(questions.map(async (question) => {
    try {
      return await getQuestionNotice(examId, question.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }));

  return questions.map((question, index) => ({
    question,
    notice: notices[index],
  }));
};

const QuestionNoticeEditor = ({ exam, onBack }) => {
  const [questionNotices, setQuestionNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [activeForm, setActiveForm] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [pendingAction, setPendingAction] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const mutationLockRef = useRef(false);

  useEffect(() => {
    let active = true;

    loadQuestionNotices(exam.id)
      .then((loadedQuestionNotices) => {
        if (active) {
          setQuestionNotices(loadedQuestionNotices);
          setLoadError('');
        }
      })
      .catch((error) => {
        if (active) {
          setQuestionNotices([]);
          setLoadError(safeApiMessage(error, 'Unable to load question notices.'));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [exam.id, loadVersion]);

  const isMutationPending = Boolean(pendingAction);

  const retryLoad = () => {
    setIsLoading(true);
    setLoadError('');
    setLoadVersion((version) => version + 1);
  };

  const beginMutation = (action) => {
    if (mutationLockRef.current) {
      return false;
    }

    mutationLockRef.current = true;
    setPendingAction(action);
    setActionError('');
    setSuccessMessage('');
    return true;
  };

  const finishMutation = () => {
    mutationLockRef.current = false;
    setPendingAction('');
  };

  const openForm = (questionId, notice = null) => {
    if (mutationLockRef.current) {
      return;
    }

    setActiveForm({
      questionId,
      message: notice?.message ?? '',
      placement: notice?.placement ?? 'above',
    });
    setConfirmDeleteId(null);
    setActionError('');
    setSuccessMessage('');
  };

  const updateForm = (field, value) => {
    setActiveForm((current) => (
      current ? { ...current, [field]: value } : current
    ));
  };

  const handleSave = async (event, question) => {
    event.preventDefault();

    if (!activeForm || activeForm.questionId !== question.id) {
      return;
    }

    const trimmedMessage = activeForm.message.trim();

    if (!trimmedMessage) {
      setActionError('Notice message is required.');
      return;
    }

    if ([...trimmedMessage].length > 1000) {
      setActionError('Notice message must be 1000 characters or fewer.');
      return;
    }

    if (!NOTICE_PLACEMENTS.has(activeForm.placement)) {
      setActionError('Notice placement must be above or below the question.');
      return;
    }

    if (!beginMutation(`save-${question.id}`)) {
      return;
    }

    try {
      const savedNotice = await saveQuestionNotice(exam.id, question.id, {
        message: trimmedMessage,
        placement: activeForm.placement,
      });
      setQuestionNotices((current) => current.map((entry) => (
        entry.question.id === question.id
          ? { ...entry, notice: savedNotice }
          : entry
      )));
      setActiveForm(null);
      setActionError('');
      setSuccessMessage(`Notice for question ${question.position} was saved.`);
    } catch (error) {
      setActionError(safeApiMessage(error, 'Unable to save the notice.'));
    } finally {
      finishMutation();
    }
  };

  const handleDelete = async (question) => {
    if (!beginMutation(`delete-${question.id}`)) {
      return;
    }

    try {
      await deleteQuestionNotice(exam.id, question.id);
      setQuestionNotices((current) => current.map((entry) => (
        entry.question.id === question.id
          ? { ...entry, notice: null }
          : entry
      )));
      setConfirmDeleteId(null);
      setActionError('');
      setSuccessMessage(`Notice for question ${question.position} was deleted.`);
    } catch (error) {
      setActionError(safeApiMessage(error, 'Unable to delete the notice.'));
    } finally {
      finishMutation();
    }
  };

  const handleBack = () => {
    if (!mutationLockRef.current) {
      onBack();
    }
  };

  return (
    <section className="container py-4" aria-labelledby="question-notices-heading">
      <button
        className="btn btn-outline-secondary mb-3"
        type="button"
        onClick={handleBack}
        disabled={isMutationPending}
      >
        Back to exams
      </button>
      <header className="mb-4">
        <h1 id="question-notices-heading" className="h2">Question notices</h1>
        <h2 className="h4">{exam.title}</h2>
        <p className="text-muted mb-0">
          Published exam and question content is read-only. Notices are separate
          clarification messages that may appear above or below a question.
        </p>
      </header>

      {successMessage && (
        <div className="alert alert-success" role="status">{successMessage}</div>
      )}
      {actionError && <div className="alert alert-danger" role="alert">{actionError}</div>}

      {isLoading && <p role="status">Loading question notices…</p>}

      {!isLoading && loadError && (
        <div className="alert alert-danger" role="alert">
          <p>{loadError}</p>
          <button
            className="btn btn-outline-danger"
            type="button"
            onClick={retryLoad}
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !loadError && (
        <section aria-labelledby="notice-question-list-heading">
          <h3 id="notice-question-list-heading" className="h5">
            Questions ({questionNotices.length})
          </h3>

          {questionNotices.length === 0 ? (
            <p className="text-muted">No questions are available for this published exam.</p>
          ) : (
            <div className="vstack gap-3">
              {questionNotices.map(({ question, notice }) => {
                const isFormOpen = activeForm?.questionId === question.id;
                const isConfirmingDelete = confirmDeleteId === question.id;
                const isSaving = pendingAction === `save-${question.id}`;
                const isDeleting = pendingAction === `delete-${question.id}`;

                return (
                  <article className="card shadow-sm" key={question.id}>
                    <div className="card-body">
                      <div className="small text-muted">
                        Question {question.position} · {questionTypeLabel(question.question_type)}
                        {' · '}{question.points} {question.points === 1 ? 'point' : 'points'}
                      </div>
                      <h4 className="h6 mt-1">{question.prompt}</h4>

                      {isFormOpen ? (
                        <form onSubmit={(event) => handleSave(event, question)}>
                          <div className="mb-3">
                            <label
                              className="form-label"
                              htmlFor={`notice-message-${question.id}`}
                            >
                              Notice message for question {question.position}
                            </label>
                            <textarea
                              className="form-control"
                              id={`notice-message-${question.id}`}
                              rows="4"
                              value={activeForm.message}
                              onChange={(event) => updateForm('message', event.target.value)}
                              disabled={isMutationPending}
                            />
                            <div className="form-text">
                              {[...activeForm.message].length} / 1000 characters
                            </div>
                          </div>
                          <div className="mb-3">
                            <label
                              className="form-label"
                              htmlFor={`notice-placement-${question.id}`}
                            >
                              Notice placement for question {question.position}
                            </label>
                            <select
                              className="form-select"
                              id={`notice-placement-${question.id}`}
                              value={activeForm.placement}
                              onChange={(event) => updateForm('placement', event.target.value)}
                              disabled={isMutationPending}
                            >
                              <option value="above">Above question</option>
                              <option value="below">Below question</option>
                            </select>
                          </div>
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-primary"
                              type="submit"
                              disabled={isMutationPending}
                              aria-label={`Save notice for question ${question.position}`}
                            >
                              {isSaving ? 'Saving…' : 'Save notice'}
                            </button>
                            <button
                              className="btn btn-outline-secondary"
                              type="button"
                              onClick={() => {
                                setActiveForm(null);
                                setActionError('');
                              }}
                              disabled={isMutationPending}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          {notice ? (
                            <div>
                              <p className="mb-1"><strong>Current notice</strong></p>
                              <p className="mb-1">{notice.message}</p>
                              <p className="text-muted mb-3">{placementLabel(notice.placement)}</p>
                              <div className="d-flex flex-wrap gap-2">
                                <button
                                  className="btn btn-sm btn-outline-primary"
                                  type="button"
                                  onClick={() => openForm(question.id, notice)}
                                  disabled={isMutationPending}
                                  aria-label={`Edit notice for question ${question.position}`}
                                >
                                  Edit notice
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  type="button"
                                  onClick={() => {
                                    if (!mutationLockRef.current) {
                                      setConfirmDeleteId(question.id);
                                      setActiveForm(null);
                                      setActionError('');
                                      setSuccessMessage('');
                                    }
                                  }}
                                  disabled={isMutationPending}
                                  aria-label={`Delete notice for question ${question.position}`}
                                >
                                  Delete notice
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p className="text-muted">No notice</p>
                              <button
                                className="btn btn-sm btn-outline-primary"
                                type="button"
                                onClick={() => openForm(question.id)}
                                disabled={isMutationPending}
                                aria-label={`Add notice for question ${question.position}`}
                              >
                                Add notice
                              </button>
                            </div>
                          )}

                          {isConfirmingDelete && notice && (
                            <div className="alert alert-warning mt-3 mb-0" role="alert">
                              <p>Delete the notice for question {question.position}?</p>
                              <div className="d-flex gap-2">
                                <button
                                  className="btn btn-sm btn-danger"
                                  type="button"
                                  onClick={() => handleDelete(question)}
                                  disabled={isMutationPending}
                                >
                                  {isDeleting ? 'Deleting…' : 'Confirm delete notice'}
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-secondary"
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    setActionError('');
                                  }}
                                  disabled={isMutationPending}
                                >
                                  Cancel delete
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </section>
  );
};

export default QuestionNoticeEditor;
