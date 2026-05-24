const ExamDetails = ({ exam }) => {
  if (!exam) {
    return (
      <div className="alert alert-secondary">
        Select an exam to see its details.
      </div>
    );
  }

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-light">
        <h5 className="mb-0">{exam.title}</h5>
      </div>

      <div className="card-body">
        <p className="text-muted mb-2">{exam.description || 'No description yet.'}</p>
        <p>
          <strong>Status:</strong>{' '}
          <span className={`badge ${exam.status === 'published' ? 'bg-success' : 'bg-secondary'}`}>
            {exam.status}
          </span>
        </p>

        <h6>Questions</h6>
        {exam.questions.length === 0 ? (
          <p className="text-muted">No questions were added yet.</p>
        ) : (
          <ol className="mb-0">
            {exam.questions.map((question) => (
              <li key={question.id} className="mb-2">
                <div>{question.text}</div>
                <small className="text-muted">Correct answer: {question.correctAnswer}</small>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

export default ExamDetails;
