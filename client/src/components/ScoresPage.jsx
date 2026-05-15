import { mockScores } from '../api/mockDb';

const ScoresPage = () => {
  return (
    <div className="container mt-4">
      <div className="card shadow">
        <div className="card-header bg-success text-white">
          <h4 className="mb-0">Student Scores</h4>
        </div>
        <div className="card-body">
          <table className="table table-striped">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Exam ID</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {mockScores.map((score, index) => (
                <tr key={index}>
                  <td>{score.studentName}</td>
                  <td>{score.examId}</td>
                  <td>{score.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ScoresPage;