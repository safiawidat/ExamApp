import { useEffect, useState } from 'react';
import { getSubmissions } from '../api/examService';

const ScoresPage = () => {
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    const loadSubmissions = async () => {
      const data = await getSubmissions();
      setSubmissions(data);
    };

    loadSubmissions();
  }, []);

  return (
    <div className="container mt-4 mb-5">
      <div className="card shadow-sm">
        <div className="card-header bg-success text-white">
          <h4 className="mb-0">Student Submissions and Scores</h4>
        </div>

        <div className="card-body">
          {submissions.length === 0 ? (
            <p className="text-muted">No submissions yet.</p>
          ) : (
            <table className="table table-striped table-hover">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Exam ID</th>
                  <th>Score</th>
                  <th>Feedback</th>
                </tr>
              </thead>

              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td>{submission.studentName}</td>
                    <td>{submission.examId}</td>
                    <td>{submission.score}</td>
                    <td>{submission.feedback}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScoresPage;
