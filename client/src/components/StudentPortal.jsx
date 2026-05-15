import React, { useState } from 'react';
import { getExamById } from '../api/examService';

const StudentPortal = () => {
  const [examId, setExamId] = useState('');
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFetchExam = async () => {
    if (!examId.trim()) return;
    
    setLoading(true);
    setError('');
    setExam(null);
    
    try {
      const data = await getExamById(examId);
      setExam(data);
    } catch (err) {
      setError('Exam not found. Please check the ID and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm border-info">
        <div className="card-header bg-info text-white">
          <h2 className="mb-0 text-dark">Student Portal</h2>
        </div>
        <div className="card-body">
          {!exam ? (
            <div className="py-4">
              <h3 className="card-title h5 mb-3">Join an Exam</h3>
              <div className="input-group mb-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter Exam ID (e.g., math101)"
                  value={examId}
                  onChange={(e) => setExamId(e.target.value)}
                />
                <button 
                  className="btn btn-info text-dark" 
                  type="button" 
                  onClick={handleFetchExam}
                  disabled={loading}
                >
                  {loading ? 'Searching...' : 'Start Exam'}
                </button>
              </div>
              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          ) : (
            <div>
              <div className="alert alert-success">
                Successfully loaded: <strong>{exam.title}</strong>
              </div>
              <div className="p-3 border rounded bg-light mb-3">
                <p>Welcome to the exam. You have {exam.questions.length} questions to answer.</p>
                <button className="btn btn-primary" onClick={() => alert('Exam starting soon!')}>
                  Begin Test
                </button>
                <button className="btn btn-outline-secondary ms-2" onClick={() => setExam(null)}>
                  Go Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentPortal;
