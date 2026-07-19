const formatTimestamp = (value) => new Date(value).toLocaleString();
const booleanLabel = (value) => (value ? 'True' : 'False');

const AnswerValue = ({ children }) => <span className="d-block mt-1">{children}</span>;

const MultipleChoiceAnswer = ({ question }) => (
  <div>
    <p className="fw-semibold mb-2">Options</p>
    <ul className="list-group">
      {question.options.map((option) => {
        const isSelected = option.id === question.selected_option_id;
        const isCorrect = option.id === question.correct_option_id;

        return (
          <li className="list-group-item" key={option.id}>
            <span>{option.text}</span>
            <span className="d-flex flex-wrap gap-2 mt-1">
              {isSelected && <span className="badge text-bg-primary">Your answer</span>}
              {isCorrect && <span className="badge text-bg-success">Correct answer</span>}
            </span>
          </li>
        );
      })}
    </ul>
    {question.is_unanswered && <p className="mt-2 mb-0 fw-semibold">Unanswered</p>}
  </div>
);

const QuestionAnswer = ({ question }) => {
  if (question.question_type === 'multiple_choice') {
    return <MultipleChoiceAnswer question={question} />;
  }

  if (question.question_type === 'true_false') {
    return (
      <div>
        <p>
          <strong>Your answer</strong>
          <AnswerValue>
            {question.is_unanswered ? 'Unanswered' : booleanLabel(question.boolean_answer)}
          </AnswerValue>
        </p>
        <p>
          <strong>Correct answer</strong>
          <AnswerValue>{booleanLabel(question.correct_answer)}</AnswerValue>
        </p>
      </div>
    );
  }

  return (
    <div>
      <p>
        <strong>Your answer</strong>
        <AnswerValue>{question.is_unanswered ? 'Unanswered' : question.text_answer}</AnswerValue>
      </p>
      <p>
        <strong>Reference answer</strong>
        <AnswerValue>{question.reference_answer}</AnswerValue>
      </p>
    </div>
  );
};

const StudentResult = ({
  exam,
  result,
  isLoading,
  error,
  onRetry,
  onBack,
}) => {
  if (isLoading) {
    return (
      <section aria-labelledby="student-result-heading">
        <h2 id="student-result-heading">{exam.title} Result</h2>
        <div role="status">Loading result...</div>
        <button className="btn btn-outline-secondary mt-3" type="button" onClick={onBack}>
          Back to Exams
        </button>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-labelledby="student-result-heading">
        <h2 id="student-result-heading">{exam.title} Result</h2>
        <div className="alert alert-danger" role="alert">{error}</div>
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button" onClick={onRetry}>
            Retry Result
          </button>
          <button className="btn btn-outline-secondary" type="button" onClick={onBack}>
            Back to Exams
          </button>
        </div>
      </section>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <section aria-labelledby="student-result-heading">
      <div className="card shadow-sm">
        <div className="card-header bg-primary text-white">
          <h2 className="h3 mb-0" id="student-result-heading">{result.exam_title} Result</h2>
        </div>
        <div className="card-body">
          <dl className="row">
            <dt className="col-sm-4">Submitted</dt>
            <dd className="col-sm-8">
              <time dateTime={result.submitted_at}>{formatTimestamp(result.submitted_at)}</time>
            </dd>
            <dt className="col-sm-4">Published</dt>
            <dd className="col-sm-8">
              <time dateTime={result.result_published_at}>
                {formatTimestamp(result.result_published_at)}
              </time>
            </dd>
            <dt className="col-sm-4">Total score</dt>
            <dd className="col-sm-8">{result.total_score} / {result.maximum_score}</dd>
            <dt className="col-sm-4">Percentage</dt>
            <dd className="col-sm-8">{result.percentage}%</dd>
          </dl>

          <div>
            {result.questions.map((question) => (
              <article
                className="border rounded p-3 mb-3"
                key={question.id}
                aria-labelledby={`student-result-question-${question.id}`}
              >
                <h3 className="h5" id={`student-result-question-${question.id}`}>
                  Question {question.position}: {question.prompt}
                </h3>
                {question.is_unanswered && (
                  <p className="badge text-bg-secondary">Unanswered</p>
                )}
                <QuestionAnswer question={question} />
                <p>
                  <strong>Awarded mark</strong>
                  <AnswerValue>
                    {question.awarded_points} / {question.maximum_points}
                  </AnswerValue>
                </p>
                <p className="mb-0">
                  <strong>Lecturer feedback</strong>
                  <AnswerValue>{question.feedback ?? 'No lecturer feedback'}</AnswerValue>
                </p>
              </article>
            ))}
          </div>

          <button className="btn btn-outline-secondary" type="button" onClick={onBack}>
            Back to Exams
          </button>
        </div>
      </div>
    </section>
  );
};

export default StudentResult;
