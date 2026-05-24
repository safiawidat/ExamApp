const ExamList = ({ exams, selectedExamId, onSelectExam, onDeleteExam, onTogglePublish }) => {
  if (exams.length === 0) {
    return <div className="alert alert-warning">No exams found.</div>;
  }

  return (
    <div className="list-group">
      {exams.map((exam) => (
        <div
          className={`list-group-item ${selectedExamId === exam.id ? 'active' : ''}`}
          key={exam.id}
        >
          <div className="d-flex justify-content-between align-items-start gap-3">
            <button
              className={`btn text-start flex-grow-1 p-0 ${
                selectedExamId === exam.id ? 'text-white' : 'text-dark'
              }`}
              type="button"
              onClick={() => onSelectExam(exam.id)}
            >
              <h6 className="mb-1">{exam.title}</h6>
              <small>
                ID: {exam.id} | Questions: {exam.questions.length} | Status: {exam.status}
              </small>
            </button>

            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-outline-success"
                type="button"
                onClick={() => onTogglePublish(exam.id)}
              >
                {exam.status === 'published' ? 'Unpublish' : 'Publish'}
              </button>

              <button
                className="btn btn-sm btn-outline-danger"
                type="button"
                onClick={() => onDeleteExam(exam.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ExamList;
