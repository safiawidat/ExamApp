import { useCallback, useEffect, useState } from 'react';
import {
  completeLecturerSubmissionGrading,
  getLecturerSubmission,
  listLecturerSubmissions,
  publishLecturerSubmissionResult,
  reopenLecturerSubmissionGrading,
  saveLecturerSubmissionGrading,
} from '../api/lecturerGradingService';
import { MAX_FEEDBACK_LENGTH } from '../api/lecturerGradingValidation';
import { safeApiMessage } from './authoringUi';

const gradingLabels = {
  ungraded: 'Not graded',
  in_progress: 'In progress',
  completed: 'Completed',
};

const answerLabel = (value) => {
  if (value === true) {
    return 'True';
  }
  if (value === false) {
    return 'False';
  }
  return 'Unanswered';
};

const formatDateTime = (value) => new Date(value).toLocaleString();

const formFromDetail = (detail) => Object.fromEntries(detail.questions.map((question) => [
  question.id,
  {
    mark: question.question_type === 'short_answer' && !question.is_unanswered
      ? (question.awarded_points === null ? '' : String(question.awarded_points))
      : '',
    feedback: question.feedback ?? '',
  },
]));

const formSignature = (form) => JSON.stringify(form);

const gradingSummaryFields = (value) => ({
  grading_state: value.grading_state,
  total_score: value.total_score,
  maximum_score: value.maximum_score,
  percentage: value.percentage,
  graded_by: value.graded_by,
  grading_completed_at: value.grading_completed_at,
  result_published_at: value.result_published_at,
});

const buildSnapshot = (detail, form, { requireComplete = false } = {}) => {
  const answers = detail.questions.map((question) => {
    const edit = form[question.id];
    if (!edit || edit.feedback.length > MAX_FEEDBACK_LENGTH) {
      throw new Error(`Feedback for question ${question.position} must be at most ${MAX_FEEDBACK_LENGTH} characters.`);
    }

    let awardedPoints = null;
    if (question.question_type === 'short_answer') {
      if (question.is_unanswered) {
        awardedPoints = 0;
      } else if (edit.mark === '') {
        if (requireComplete) {
          throw new Error('Every answered short-answer question needs a mark before completion.');
        }
      } else {
        awardedPoints = Number(edit.mark);
        if (!Number.isFinite(awardedPoints) || awardedPoints < 0 || awardedPoints > 1) {
          throw new Error(`Question ${question.position} mark must be a number between 0 and 1.`);
        }
      }
    }

    return {
      questionId: question.id,
      awardedPoints,
      feedback: edit.feedback.trim() || null,
    };
  });

  return { answers };
};

const SubmissionSummary = ({ submission, onOpen, disabled }) => (
  <article className="border rounded p-3">
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
      <div>
        <h3 className="h5 mb-1">{submission.student_username}</h3>
        <p className="small text-muted mb-2">
          Submitted{' '}
          <time dateTime={submission.submitted_at}>
            {formatDateTime(submission.submitted_at)}
          </time>
        </p>
        <dl className="row small mb-0">
          <dt className="col-sm-5">Grading status</dt>
          <dd className="col-sm-7">{gradingLabels[submission.grading_state]}</dd>
          <dt className="col-sm-5">Score</dt>
          <dd className="col-sm-7">
            {submission.grading_state === 'completed'
              ? `${submission.total_score} / ${submission.maximum_score} (${submission.percentage}%)`
              : gradingLabels[submission.grading_state]}
          </dd>
          <dt className="col-sm-5">Result status</dt>
          <dd className="col-sm-7">
            {submission.result_published_at === null ? 'Not published' : 'Published to student'}
          </dd>
        </dl>
      </div>
      <button
        className="btn btn-sm btn-outline-primary"
        type="button"
        onClick={() => onOpen(submission.id)}
        disabled={disabled}
        aria-label={`Review grading for ${submission.student_username}`}
      >
        Review grading
      </button>
    </div>
  </article>
);

const ObjectiveAnswer = ({ question }) => {
  if (question.question_type === 'multiple_choice') {
    return (
      <div>
        <h4 className="h6">Answer options</h4>
        <ul className="list-group mb-3">
          {question.options.map((option) => {
            const labels = [];
            if (option.id === question.selected_option_id) labels.push('Selected answer');
            if (option.id === question.correct_option_id) labels.push('Correct answer');
            return (
              <li className="list-group-item" key={option.id}>
                {option.text}
                {labels.length > 0 && <span className="fw-semibold"> — {labels.join('; ')}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <dl className="row mb-3">
      <dt className="col-sm-4">Student answer</dt>
      <dd className="col-sm-8">{answerLabel(question.boolean_answer)}</dd>
      <dt className="col-sm-4">Correct answer</dt>
      <dd className="col-sm-8">{answerLabel(question.correct_answer)}</dd>
    </dl>
  );
};

const QuestionGrading = ({
  question,
  edit,
  onEdit,
  readOnly,
  pending,
}) => {
  const fieldDisabled = readOnly || pending;
  const isShortAnswer = question.question_type === 'short_answer';

  return (
    <article className="card shadow-sm" aria-labelledby={`grading-question-${question.id}`}>
      <div className="card-header">
        <h3 className="h5 mb-0" id={`grading-question-${question.id}`}>
          Question {question.position}
        </h3>
      </div>
      <div className="card-body">
        <p className="mb-3">{question.prompt}</p>

        {!isShortAnswer && <ObjectiveAnswer question={question} />}

        {isShortAnswer && (
          <dl className="row mb-3">
            <dt className="col-sm-4">Student answer</dt>
            <dd className="col-sm-8">
              {question.is_unanswered
                ? <span className="fw-semibold">Unanswered</span>
                : question.text_answer}
            </dd>
            <dt className="col-sm-4">Reference answer</dt>
            <dd className="col-sm-8">{question.reference_answer}</dd>
          </dl>
        )}

        <div className="row g-3">
          <div className="col-md-4">
            {isShortAnswer && !question.is_unanswered ? (
              <>
                <label className="form-label" htmlFor={`question-${question.id}-mark`}>
                  Awarded mark for question {question.position} (0–1)
                </label>
                <input
                  className="form-control"
                  id={`question-${question.id}-mark`}
                  type="number"
                  min="0"
                  max="1"
                  step="any"
                  value={edit.mark}
                  onChange={(event) => onEdit(question.id, 'mark', event.target.value)}
                  disabled={fieldDisabled}
                />
              </>
            ) : (
              <div>
                <span className="form-label d-block">
                  {isShortAnswer ? 'Awarded mark' : 'Automatic mark'}
                </span>
                <span className="form-control-plaintext fw-semibold">
                  {question.awarded_points} / 1
                </span>
              </div>
            )}
          </div>
          <div className="col-md-8">
            <label className="form-label" htmlFor={`question-${question.id}-feedback`}>
              Lecturer feedback for question {question.position}
            </label>
            <textarea
              className="form-control"
              id={`question-${question.id}-feedback`}
              rows="3"
              maxLength={MAX_FEEDBACK_LENGTH}
              value={edit.feedback}
              onChange={(event) => onEdit(question.id, 'feedback', event.target.value)}
              disabled={fieldDisabled}
            />
            <div className="form-text text-end">
              {edit.feedback.length} / {MAX_FEEDBACK_LENGTH} characters
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

const SubmissionReviewWorkspace = ({ exam, onBack }) => {
  const [submissions, setSubmissions] = useState([]);
  const [isListLoading, setIsListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({});
  const [savedFormSignature, setSavedFormSignature] = useState('');
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const isDirty = detail !== null && formSignature(form) !== savedFormSignature;
  const isReadOnly = detail?.grading_state === 'completed';

  const loadSubmissions = useCallback(async () => {
    setIsListLoading(true);
    setListError('');
    try {
      setSubmissions(await listLecturerSubmissions(exam.id));
    } catch (error) {
      setListError(safeApiMessage(error, 'Unable to load exam submissions.'));
    } finally {
      setIsListLoading(false);
    }
  }, [exam.id]);

  useEffect(() => {
    let active = true;

    listLecturerSubmissions(exam.id)
      .then((loadedSubmissions) => {
        if (active) {
          setSubmissions(loadedSubmissions);
          setListError('');
        }
      })
      .catch((error) => {
        if (active) {
          setListError(safeApiMessage(error, 'Unable to load exam submissions.'));
        }
      })
      .finally(() => {
        if (active) {
          setIsListLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [exam.id]);

  const replaceDetail = (nextDetail) => {
    const nextForm = formFromDetail(nextDetail);
    setDetail(nextDetail);
    setForm(nextForm);
    setSavedFormSignature(formSignature(nextForm));
  };

  const confirmDiscard = () => !isDirty || window.confirm(
    'Discard unsaved grading changes?',
  );

  const openSubmission = async (submissionId) => {
    if (pendingAction || !confirmDiscard()) {
      return;
    }

    setSelectedSubmissionId(submissionId);
    setDetail(null);
    setForm({});
    setSavedFormSignature('');
    setIsDetailLoading(true);
    setDetailError('');
    setSuccessMessage('');
    setConfirmation('');

    try {
      replaceDetail(await getLecturerSubmission(exam.id, submissionId));
    } catch (error) {
      setDetailError(safeApiMessage(error, 'Unable to load this submission.'));
    } finally {
      setIsDetailLoading(false);
    }
  };

  const returnToList = () => {
    if (!pendingAction && confirmDiscard()) {
      setSelectedSubmissionId(null);
      setDetail(null);
      setDetailError('');
      setSuccessMessage('');
      setConfirmation('');
    }
  };

  const leaveWorkspace = () => {
    if (!pendingAction && confirmDiscard()) {
      onBack();
    }
  };

  const handleEdit = (questionId, field, value) => {
    setForm((current) => ({
      ...current,
      [questionId]: { ...current[questionId], [field]: value },
    }));
    setDetailError('');
    setSuccessMessage('');
    setConfirmation('');
  };

  const saveDraft = async ({ forCompletion = false } = {}) => {
    const snapshot = buildSnapshot(detail, form, { requireComplete: forCompletion });
    const saved = await saveLecturerSubmissionGrading(exam.id, detail.id, snapshot);
    replaceDetail(saved);
    setSubmissions((current) => current.map((submission) => (
      submission.id === saved.id
        ? { ...submission, ...gradingSummaryFields(saved) }
        : submission
    )));
    return saved;
  };

  const handleSave = async () => {
    if (pendingAction || isReadOnly) return;
    setPendingAction('save');
    setDetailError('');
    setSuccessMessage('');
    try {
      await saveDraft();
      setSuccessMessage('Grading draft saved.');
    } catch (error) {
      setDetailError(error instanceof Error && !(error.name === 'ApiError')
        ? error.message
        : safeApiMessage(error, 'Unable to save grading.'));
    } finally {
      setPendingAction('');
    }
  };

  const requestCompletion = () => {
    try {
      buildSnapshot(detail, form, { requireComplete: true });
      setDetailError('');
      setConfirmation('complete');
    } catch (error) {
      setDetailError(error.message);
    }
  };

  const handleComplete = async () => {
    if (pendingAction || isReadOnly) return;
    setPendingAction('complete');
    setDetailError('');
    setSuccessMessage('');
    try {
      let currentDetail = detail;
      if (isDirty || detail.grading_state === 'ungraded') {
        currentDetail = await saveDraft({ forCompletion: true });
      }
      const completed = await completeLecturerSubmissionGrading(exam.id, detail.id);
      const merged = { ...currentDetail, ...completed };
      setDetail(merged);
      setSubmissions((current) => current.map((submission) => (
        submission.id === completed.id
          ? { ...submission, ...gradingSummaryFields(completed) }
          : submission
      )));
      setSavedFormSignature(formSignature(formFromDetail(merged)));
      setConfirmation('');
      setSuccessMessage('Grading completed. The result has not been published to the student.');
    } catch (error) {
      setDetailError(error instanceof Error && !(error.name === 'ApiError')
        ? error.message
        : safeApiMessage(error, 'Unable to complete grading.'));
    } finally {
      setPendingAction('');
    }
  };

  const handleReopen = async () => {
    if (pendingAction || detail.result_published_at !== null) return;
    setPendingAction('reopen');
    setDetailError('');
    setSuccessMessage('');
    try {
      const reopened = await reopenLecturerSubmissionGrading(exam.id, detail.id);
      const merged = { ...detail, ...reopened };
      setDetail(merged);
      setSubmissions((current) => current.map((submission) => (
        submission.id === reopened.id
          ? { ...submission, ...gradingSummaryFields(reopened) }
          : submission
      )));
      const nextForm = formFromDetail(merged);
      setForm(nextForm);
      setSavedFormSignature(formSignature(nextForm));
      setConfirmation('');
      setSuccessMessage('Grading reopened. Existing marks and feedback were preserved.');
    } catch (error) {
      setDetailError(safeApiMessage(error, 'Unable to reopen grading.'));
    } finally {
      setPendingAction('');
    }
  };

  const handlePublish = async () => {
    if (
      pendingAction
      || detail.grading_state !== 'completed'
      || detail.result_published_at !== null
    ) return;

    setPendingAction('publish');
    setDetailError('');
    setSuccessMessage('');
    try {
      const published = await publishLecturerSubmissionResult(exam.id, detail.id);
      setDetail((current) => ({ ...current, ...published }));
      setSubmissions((current) => current.map((submission) => (
        submission.id === published.id
          ? { ...submission, ...gradingSummaryFields(published) }
          : submission
      )));
      setConfirmation('');
      setSuccessMessage('Result published successfully.');
      await loadSubmissions();
    } catch (error) {
      setDetailError(safeApiMessage(error, 'Unable to publish the result.'));
    } finally {
      setPendingAction('');
    }
  };

  if (selectedSubmissionId !== null) {
    return (
      <div className="container py-4">
        <button
          className="btn btn-outline-secondary mb-3"
          type="button"
          onClick={returnToList}
          disabled={Boolean(pendingAction)}
        >
          Back to submissions
        </button>

        {isDetailLoading && (
          <div className="text-center py-5" role="status">
            <div className="spinner-border text-primary" aria-hidden="true" />
            <div className="mt-2">Loading submission…</div>
          </div>
        )}

        {!isDetailLoading && detailError && !detail && (
          <div className="alert alert-danger" role="alert">
            <p>{detailError}</p>
            <button
              className="btn btn-outline-danger"
              type="button"
              onClick={() => openSubmission(selectedSubmissionId)}
            >
              Try again
            </button>
          </div>
        )}

        {!isDetailLoading && detail && (
          <>
            <header className="mb-4">
              <p className="text-muted mb-1">{exam.title}</p>
              <h1 className="h2 mb-2">Grade {detail.student.username}</h1>
              <p>
                Submitted <time dateTime={detail.submitted_at}>
                  {formatDateTime(detail.submitted_at)}
                </time>
              </p>
              <p>Grading status: <strong>{gradingLabels[detail.grading_state]}</strong></p>
              {detail.grading_state === 'completed' && (
                <p className="mt-2">
                  Score: <strong>{detail.total_score} / {detail.maximum_score}</strong>
                  {' '}({detail.percentage}%)
                </p>
              )}
              <div className="mt-3 col-md-6">
                <label className="form-label" htmlFor="submission-switcher">
                  Choose submission
                </label>
                <select
                  className="form-select"
                  id="submission-switcher"
                  value={selectedSubmissionId}
                  onChange={(event) => openSubmission(Number(event.target.value))}
                  disabled={Boolean(pendingAction)}
                >
                  {submissions.map((submission) => (
                    <option key={submission.id} value={submission.id}>
                      {submission.student_username} — {gradingLabels[submission.grading_state]}
                    </option>
                  ))}
                </select>
              </div>
            </header>

            <div aria-live="polite" aria-atomic="true">
              {successMessage && <div className="alert alert-success" role="status">{successMessage}</div>}
            </div>
            {detailError && <div className="alert alert-danger" role="alert">{detailError}</div>}
            {detail.grading_state === 'completed' && detail.result_published_at === null && (
              <div className="alert alert-secondary">
                Grading is complete and read-only. This result has not been published to the student.
              </div>
            )}
            {detail.result_published_at !== null && (
              <div className="alert alert-secondary">
                <p className="fw-semibold mb-1">Result published</p>
                <p className="mb-0">
                  Published{' '}
                  <time dateTime={detail.result_published_at}>
                    {formatDateTime(detail.result_published_at)}
                  </time>
                  . Grading is read-only and cannot be reopened.
                </p>
              </div>
            )}

            <div className="vstack gap-4">
              {detail.questions.map((question) => (
                <QuestionGrading
                  key={question.id}
                  question={question}
                  edit={form[question.id]}
                  onEdit={handleEdit}
                  readOnly={isReadOnly}
                  pending={Boolean(pendingAction)}
                />
              ))}
            </div>

            <div className="d-flex flex-wrap gap-2 mt-4">
              {!isReadOnly && (
                <>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleSave}
                    disabled={Boolean(pendingAction)}
                  >
                    {pendingAction === 'save' ? 'Saving grading…' : 'Save grading'}
                  </button>
                  <button
                    className="btn btn-success"
                    type="button"
                    onClick={requestCompletion}
                    disabled={Boolean(pendingAction)}
                  >
                    Complete grading
                  </button>
                </>
              )}
              {isReadOnly && detail.result_published_at === null && (
                <>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => setConfirmation('publish')}
                    disabled={Boolean(pendingAction)}
                  >
                    Publish result
                  </button>
                  <button
                    className="btn btn-outline-primary"
                    type="button"
                    onClick={() => setConfirmation('reopen')}
                    disabled={Boolean(pendingAction)}
                  >
                    Reopen grading
                  </button>
                </>
              )}
            </div>

            {confirmation === 'complete' && (
              <div className="alert alert-warning mt-3" role="alert">
                <p>
                  Complete this grading? Every answered short-answer question must have a mark.
                  Current unsaved changes will be saved first. This does not publish the result.
                </p>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-success"
                    type="button"
                    onClick={handleComplete}
                    disabled={Boolean(pendingAction)}
                  >
                    {pendingAction === 'complete' ? 'Completing grading…' : 'Confirm completion'}
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setConfirmation('')}
                    disabled={Boolean(pendingAction)}
                  >
                    Cancel completion
                  </button>
                </div>
              </div>
            )}

            {confirmation === 'reopen' && (
              <div className="alert alert-warning mt-3" role="alert">
                <p>Reopen this grading for editing? Existing marks and feedback will be preserved.</p>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleReopen}
                    disabled={Boolean(pendingAction)}
                  >
                    {pendingAction === 'reopen' ? 'Reopening grading…' : 'Confirm reopening'}
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setConfirmation('')}
                    disabled={Boolean(pendingAction)}
                  >
                    Cancel reopening
                  </button>
                </div>
              </div>
            )}

            {confirmation === 'publish' && (
              <div className="alert alert-warning mt-3" role="alert">
                <p>
                  Publish this result? The grade and feedback will become available to the
                  student after the student result feature is connected. Publication is
                  irreversible, and this grading can no longer be reopened or edited.
                </p>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={handlePublish}
                    disabled={Boolean(pendingAction)}
                  >
                    {pendingAction === 'publish' ? 'Publishing result…' : 'Confirm publication'}
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setConfirmation('')}
                    disabled={Boolean(pendingAction)}
                  >
                    Cancel publication
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="container py-4">
      <button className="btn btn-outline-secondary mb-3" type="button" onClick={leaveWorkspace}>
        Back to exams
      </button>
      <header className="mb-4">
        <h1 className="h2">Submission review</h1>
        <p className="text-muted mb-0">{exam.title}</p>
      </header>

      {isListLoading && (
        <div className="text-center py-5" role="status">
          <div className="spinner-border text-primary" aria-hidden="true" />
          <div className="mt-2">Loading submissions…</div>
        </div>
      )}

      {!isListLoading && listError && (
        <div className="alert alert-danger" role="alert">
          <p>{listError}</p>
          <button className="btn btn-outline-danger" type="button" onClick={loadSubmissions}>
            Try again
          </button>
        </div>
      )}

      {!isListLoading && !listError && (
        <section className="card shadow-sm" aria-labelledby="submission-list-heading">
          <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center gap-3">
            <h2 className="h5 mb-0" id="submission-list-heading">Submissions</h2>
            <button className="btn btn-sm btn-outline-light" type="button" onClick={loadSubmissions}>
              Refresh
            </button>
          </div>
          <div className="card-body">
            {submissions.length === 0 ? (
              <p className="text-muted mb-0">No submissions have been received yet.</p>
            ) : (
              <div className="vstack gap-3">
                {submissions.map((submission) => (
                  <SubmissionSummary
                    key={submission.id}
                    submission={submission}
                    onOpen={openSubmission}
                    disabled={Boolean(pendingAction)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default SubmissionReviewWorkspace;
