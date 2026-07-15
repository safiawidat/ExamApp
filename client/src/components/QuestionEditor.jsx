import { useEffect, useRef, useState } from 'react';
import {
  createQuestion,
  deleteQuestion,
  listQuestions,
  reorderQuestions,
  updateQuestion,
} from '../api/questionService';
import QuestionForm from './QuestionForm';
import { safeApiMessage } from './authoringUi';

const orderQuestions = (questions) => [...questions].sort((left, right) => (
  left.position - right.position || left.id - right.id
));

const questionTypeLabel = (questionType) => ({
  multiple_choice: 'Multiple choice',
  true_false: 'True / false',
  short_answer: 'Short answer',
}[questionType]);

const QuestionSummary = ({ question }) => (
  <div className="mt-2">
    {question.question_type === 'multiple_choice' && (
      <ol type="A" className="mb-0">
        {question.options.map((option) => (
          <li key={option.id}>
            {option.text}{option.is_correct ? ' — correct' : ''}
          </li>
        ))}
      </ol>
    )}
    {question.question_type === 'true_false' && (
      <p className="mb-0">
        Correct answer: {question.correct_answer ? 'True' : 'False'}
      </p>
    )}
    {question.question_type === 'short_answer' && (
      <p className="mb-0">Reference answer: {question.reference_answer}</p>
    )}
  </div>
);

const QuestionEditor = ({ exam, onBack, onQuestionCountChange }) => {
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [pendingAction, setPendingAction] = useState('');
  const [createFormVersion, setCreateFormVersion] = useState(0);
  const mutationLockRef = useRef(false);

  useEffect(() => {
    let active = true;

    listQuestions(exam.id)
      .then((loadedQuestions) => {
        if (active) {
          const ordered = orderQuestions(loadedQuestions);
          setQuestions(ordered);
          setLoadError('');
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(safeApiMessage(error, 'Unable to load questions.'));
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
  }, [exam.id, onQuestionCountChange]);

  useEffect(() => {
    if (!isLoading && !loadError) {
      onQuestionCountChange?.(questions.length);
    }
  }, [isLoading, loadError, onQuestionCountChange, questions.length]);

  const retryLoad = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const loadedQuestions = orderQuestions(await listQuestions(exam.id));
      setQuestions(loadedQuestions);
    } catch (error) {
      setLoadError(safeApiMessage(error, 'Unable to load questions.'));
    } finally {
      setIsLoading(false);
    }
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

  const handleCreate = async (payload) => {
    if (!beginMutation('create')) {
      return;
    }

    try {
      const created = await createQuestion(exam.id, payload);
      setQuestions((current) => orderQuestions([...current, created]));
      setCreateFormVersion((version) => version + 1);
      setSuccessMessage('Question was added.');
    } finally {
      finishMutation();
    }
  };

  const handleUpdate = async (questionId, payload) => {
    if (!beginMutation(`update-${questionId}`)) {
      return;
    }

    try {
      const updated = await updateQuestion(exam.id, questionId, payload);
      setQuestions((current) => orderQuestions(current.map((question) => (
        question.id === updated.id ? updated : question
      ))));
      setEditingId(null);
      setSuccessMessage('Question was updated.');
    } finally {
      finishMutation();
    }
  };

  const handleDelete = async (question) => {
    if (!beginMutation(`delete-${question.id}`)) {
      return;
    }

    try {
      await deleteQuestion(exam.id, question.id);
      setQuestions((current) => orderQuestions(current
        .filter((candidate) => candidate.id !== question.id))
        .map((candidate, index) => ({ ...candidate, position: index + 1 })));
      setConfirmDeleteId(null);
      setEditingId(null);
      setSuccessMessage('Question was deleted.');
    } catch (error) {
      setActionError(safeApiMessage(error, 'Unable to delete the question.'));
    } finally {
      finishMutation();
    }
  };

  const moveQuestion = async (index, direction) => {
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= questions.length) {
      return;
    }

    const requested = [...questions];
    [requested[index], requested[targetIndex]] = [requested[targetIndex], requested[index]];
    const questionIds = requested.map((question) => question.id);

    if (!beginMutation('reorder')) {
      return;
    }

    try {
      const reordered = orderQuestions(await reorderQuestions(exam.id, questionIds));
      setQuestions(reordered);
      setSuccessMessage('Question order was updated.');
    } catch (error) {
      setActionError(safeApiMessage(error, 'Unable to reorder questions.'));
    } finally {
      finishMutation();
    }
  };

  return (
    <section className="container py-4" aria-labelledby="question-editor-heading">
      <button className="btn btn-outline-secondary mb-3" type="button" onClick={onBack}>
        Back to exams
      </button>
      <header className="mb-4">
        <h1 id="question-editor-heading" className="h2">Question editor</h1>
        <h2 className="h4">{exam.title}</h2>
        <p className="text-muted mb-0">Draft exam · {questions.length} questions</p>
      </header>

      {successMessage && (
        <div className="alert alert-success" role="status">{successMessage}</div>
      )}
      {actionError && <div className="alert alert-danger" role="alert">{actionError}</div>}

      {isLoading && <p role="status">Loading questions…</p>}

      {!isLoading && loadError && (
        <div className="alert alert-danger" role="alert">
          <p>{loadError}</p>
          <button className="btn btn-outline-danger" type="button" onClick={retryLoad}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !loadError && (
        <>
          <section className="card shadow-sm mb-4" aria-labelledby="add-question-heading">
            <div className="card-header">
              <h3 id="add-question-heading" className="h5 mb-0">Add question</h3>
            </div>
            <div className="card-body">
              <QuestionForm
                key={`create-${createFormVersion}`}
                onSubmit={handleCreate}
                disabled={Boolean(pendingAction)}
              />
            </div>
          </section>

          <section aria-labelledby="question-list-heading">
            <h3 id="question-list-heading" className="h5">
              Questions ({questions.length})
            </h3>

            {questions.length === 0 ? (
              <p className="text-muted">No questions have been added yet.</p>
            ) : (
              <div className="vstack gap-3">
                {questions.map((question, index) => (
                  <article className="card shadow-sm" key={question.id}>
                    <div className="card-body">
                      {editingId === question.id ? (
                        <QuestionForm
                          key={`edit-${question.id}`}
                          question={question}
                          onSubmit={(payload) => handleUpdate(question.id, payload)}
                          onCancel={() => setEditingId(null)}
                          disabled={Boolean(pendingAction)}
                        />
                      ) : (
                        <>
                          <div className="d-flex justify-content-between gap-3">
                            <div>
                              <div className="small text-muted">
                                Question {question.position} · {questionTypeLabel(question.question_type)}
                                {' · '}{question.points} {question.points === 1 ? 'point' : 'points'}
                              </div>
                              <h4 className="h6 mt-1 mb-0">{question.prompt}</h4>
                              <QuestionSummary question={question} />
                            </div>
                            <div className="d-flex flex-wrap align-content-start gap-2">
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                type="button"
                                onClick={() => moveQuestion(index, -1)}
                                disabled={index === 0 || Boolean(pendingAction)}
                                aria-label={`Move question ${question.position} up`}
                              >
                                Up
                              </button>
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                type="button"
                                onClick={() => moveQuestion(index, 1)}
                                disabled={index === questions.length - 1 || Boolean(pendingAction)}
                                aria-label={`Move question ${question.position} down`}
                              >
                                Down
                              </button>
                              <button
                                className="btn btn-sm btn-outline-primary"
                                type="button"
                                onClick={() => {
                                  setEditingId(question.id);
                                  setConfirmDeleteId(null);
                                }}
                                disabled={Boolean(pendingAction)}
                                aria-label={`Edit question ${question.position}`}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteId(question.id);
                                  setEditingId(null);
                                }}
                                disabled={Boolean(pendingAction)}
                                aria-label={`Delete question ${question.position}`}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          {confirmDeleteId === question.id && (
                            <div className="alert alert-warning mt-3 mb-0" role="alert">
                              <p>Delete question “{question.prompt}”?</p>
                              <div className="d-flex gap-2">
                                <button
                                  className="btn btn-sm btn-danger"
                                  type="button"
                                  onClick={() => handleDelete(question)}
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
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
};

export default QuestionEditor;
