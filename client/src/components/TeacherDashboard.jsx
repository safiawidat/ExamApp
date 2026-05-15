import React, { useState, useEffect } from 'react';
import { getAllExams } from '../api/examService';

const TeacherDashboard = () => {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const data = await getAllExams();
        setExams(data);
      } catch (error) {
        console.error('Error fetching exams:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchExams();
  }, []);

  return (
    <div className="container mt-4">
      <div className="card shadow-sm">
        <div className="card-header bg-primary text-white">
          <h2 className="mb-0">Teacher Dashboard</h2>
        </div>
        <div className="card-body">
          <h3 className="card-title h5 mb-3">Available Exams</h3>
          {loading ? (
            <div className="text-center py-4">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : (
            <div className="list-group">
              {exams.length > 0 ? (
                exams.map((exam) => (
                  <div key={exam.id} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                    <div>
                      <h5 className="mb-1">{exam.title}</h5>
                      <small className="text-muted">ID: {exam.id} | Questions: {exam.questions.length}</small>
                    </div>
                    <button className="btn btn-outline-primary btn-sm">Edit</button>
                  </div>
                ))
              ) : (
                <p className="text-center py-3">No exams found.</p>
              )}
            </div>
          )}
          <div className="mt-4">
            <button className="btn btn-success">Create New Exam</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
