import { useEffect, useRef, useState } from 'react';

const buildAnswerPayload = (questions, answers) => questions.map((question) => {
  const answer = { question_id: question.id };
  const value = answers[question.id];

  if (question.question_type === 'multiple_choice' && Number.isInteger(value)) {
    answer.selected_option_id = value;
  } else if (question.question_type === 'true_false' && typeof value === 'boolean') {
    answer.boolean_answer = value;
  } else if (
    question.question_type === 'short_answer'
    && typeof value === 'string'
    && value.trim()
  ) {
    answer.text_answer = value;
  }

  return answer;
});

const QuestionNotice = ({ notice, placement, position }) => {
  if (!notice || notice.placement !== placement) {
    return null;
  }

  return (
    <div
      className="alert alert-info"
      role="note"
      aria-label={`Notice ${placement} question ${position}`}
    >
      {notice.message}
    </div>
  );
};

const StudentExamForm = ({
  exam,
  onSubmitExam,
  onCancel,
  isSubmitting,
  submissionError,
}) => {
  const [answers, setAnswers] = useState({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const submissionStarted = useRef(false);

  useEffect(() => {
    if (!isSubmitting) {
      submissionStarted.current = false;
    }
  }, [isSubmitting]);

  const answerPayload = buildAnswerPayload(exam.questions, answers);
  const answeredCount = answerPayload.filter((answer) => Object.keys(answer).length > 1).length;

  const handleAnswerChange = (questionId, value) => {
    if (isSubmitting) {
      return;
    }

    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: value,
    }));
    setShowConfirmation(false);
    submissionStarted.current = false;
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!isSubmitting) {
      setShowConfirmation(true);
    }
  };

  const handleConfirm = () => {
    if (isSubmitting || submissionStarted.current) {
      return;
    }

    submissionStarted.current = true;
    onSubmitExam(answerPayload);
  };

  const handleContinueEditing = () => {
    if (!isSubmitting) {
      setShowConfirmation(false);
      submissionStarted.current = false;
    }
  };

  const handleCancel = () => {
    if (!isSubmitting) {
      onCancel();
    }
  };

  return (
    <form className="card shadow-sm" onSubmit={handleSubmit}>
      <div className="card-header bg-primary text-white">
        <h1 className="h3 mb-0">{exam.title}</h1>
      </div>

      <div className="card-body">
        {exam.description && <p>{exam.description}</p>}

        <div className="row mb-3">
          <p className="col-md mb-1"><strong>Exam type:</strong> {exam.exam_type.name}</p>
          <p className="col-md mb-1"><strong>Questions:</strong> {exam.question_count}</p>
          <p className="col-md mb-1"><strong>Total points:</strong> {exam.total_points}</p>
        </div>

        <div className="alert alert-secondary" role="note">
          Every question is included in your final submission. Unanswered questions receive 0 points.
        </div>

        {typeof submissionError === 'string' && submissionError !== '' && (
          <div className="alert alert-danger" role="alert">
            {submissionError}
          </div>
        )}

        <div>
          {exam.questions.map((question) => {
            const position = question.position;
            const questionId = `exam-${exam.id}-question-${question.id}`;

            return (
              <section className="mb-4" key={question.id}>
                <QuestionNotice
                  notice={question.notice}
                  placement="above"
                  position={position}
                />

                <fieldset className="border rounded p-3">
                  <legend className="float-none w-auto px-2">
                    <span className="d-block fw-bold">Question {position}</span>
                    <span className="d-block fs-6">{question.prompt}</span>
                    <span className="d-block fs-6 text-muted">{question.points} points</span>
                  </legend>

                  <QuestionNotice
                    notice={question.notice}
                    placement="below"
                    position={position}
                  />

                  {question.question_type === 'multiple_choice' && question.options.map((option) => {
                    const optionId = `${questionId}-option-${option.id}`;

                    return (
                      <div className="form-check" key={option.id}>
                        <input
                          className="form-check-input"
                          id={optionId}
                          type="radio"
                          name={questionId}
                          value={option.id}
                          checked={answers[question.id] === option.id}
                          onChange={() => handleAnswerChange(question.id, option.id)}
                          disabled={isSubmitting}
                        />
                        <label className="form-check-label" htmlFor={optionId}>
                          {option.text}
                        </label>
                      </div>
                    );
                  })}

                  {question.question_type === 'true_false' && (
                    <>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          id={`${questionId}-true`}
                          type="radio"
                          name={questionId}
                          checked={answers[question.id] === true}
                          onChange={() => handleAnswerChange(question.id, true)}
                          disabled={isSubmitting}
                        />
                        <label className="form-check-label" htmlFor={`${questionId}-true`}>
                          True
                        </label>
                      </div>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          id={`${questionId}-false`}
                          type="radio"
                          name={questionId}
                          checked={answers[question.id] === false}
                          onChange={() => handleAnswerChange(question.id, false)}
                          disabled={isSubmitting}
                        />
                        <label className="form-check-label" htmlFor={`${questionId}-false`}>
                          False
                        </label>
                      </div>
                    </>
                  )}

                  {question.question_type === 'short_answer' && (
                    <div>
                      <label className="form-label" htmlFor={`${questionId}-answer`}>
                        Your answer for question {position}
                      </label>
                      <textarea
                        className="form-control"
                        id={`${questionId}-answer`}
                        value={answers[question.id] ?? ''}
                        onChange={(event) => handleAnswerChange(question.id, event.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  )}
                </fieldset>
              </section>
            );
          })}
        </div>

        {showConfirmation && (
          <section className="alert alert-warning" aria-label="Final submission confirmation">
            <p className="fw-bold">
              This is your final submission. You will not be able to submit this exam again.
            </p>
            <p>Answered: {answeredCount} of {exam.questions.length}</p>
            <div className="d-flex flex-wrap gap-2">
              <button
                className="btn btn-danger"
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Confirm Final Submission'}
              </button>
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={handleContinueEditing}
                disabled={isSubmitting}
              >
                Continue Editing
              </button>
            </div>
          </section>
        )}

        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            Submit Exam
          </button>
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Back to Exams
          </button>
        </div>
      </div>
    </form>
  );
};

const StudentForm = ({
  exam,
  onSubmitExam,
  onCancel,
  isSubmitting = false,
  submissionError = '',
}) => (
  <StudentExamForm
    key={exam.id}
    exam={exam}
    onSubmitExam={onSubmitExam}
    onCancel={onCancel}
    isSubmitting={isSubmitting}
    submissionError={submissionError}
  />
);

export default StudentForm;
