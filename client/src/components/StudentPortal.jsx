import { useEffect, useState } from 'react';
import StudentForm from './StudentForm';
import { getPublishedExams, submitExam } from '../api/examService';

const StudentPortal = () => {
  const [availableExams, setAvailableExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAvailableExams = async () => {
      const data = await getPublishedExams();
      setAvailableExams(data);
      setLoading(false);
    };

    loadAvailableExams();
  }, []);

  const handleSubmitExam = async (submissionData) => {
    const result = await submitExam(submissionData);
    setSubmissionResult(result);
    setSelectedExam(null);
  };

  if (selectedExam) {
    return (
      <div className="container mt-4">
        <StudentForm
          exam={selectedExam}
          onSubmitExam={handleSubmitExam}
          onCancel={() => setSelectedExam(null)}
        />
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="card shadow-sm border-info">
        <div className="card-header bg-info text-dark">
          <h2 className="mb-0">Student Portal</h2>
        </div>

        <div className="card-body">
          {submissionResult && (
            <div className="alert alert-success">
              Exam submitted successfully. Your score is{' '}
              <strong>{submissionResult.score}</strong>. {submissionResult.feedback}
            </div>
          )}

          <h5 className="mb-3">Available Exams</h5>

          {loading ? (
            <p>Loading exams...</p>
          ) : availableExams.length === 0 ? (
            <div className="alert alert-warning">No published exams are available.</div>
          ) : (
            <div className="row g-3">
              {availableExams.map((exam) => (
                <div className="col-md-6" key={exam.id}>
                  <div className="card h-100">
                    <div className="card-body">
                      <h5 className="card-title">{exam.title}</h5>
                      <p className="card-text text-muted">
                        {exam.description || 'No description.'}
                      </p>
                      <p className="mb-3">
                        <strong>Questions:</strong> {exam.questions?.length || 0}
                      </p>

                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => setSelectedExam(exam)}
                      >
                        Enter Exam
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentPortal;
