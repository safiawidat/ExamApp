import { useEffect, useState } from 'react';
import AddExam from './AddExam';
import ExamDetails from './ExamDetails';
import ExamList from './ExamList';
import {
  createExam,
  deleteExam,
  getAllExams,
  togglePublishExam,
} from '../api/examService';

const TeacherDashboard = () => {
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedExam = exams.find((exam) => exam.id === selectedExamId);

  const loadExams = async () => {
    setLoading(true);
    const data = await getAllExams();
    setExams(data);
    setLoading(false);
  };

  useEffect(() => {
    loadExams();
  }, []);

  const handleAddExam = async (examData) => {
    const savedExam = await createExam(examData);
    setExams((currentExams) => [...currentExams, savedExam]);
    setSelectedExamId(savedExam.id);
  };

  const handleDeleteExam = async (examId) => {
    await deleteExam(examId);
    setExams((currentExams) => currentExams.filter((exam) => exam.id !== examId));

    if (selectedExamId === examId) {
      setSelectedExamId('');
    }
  };

  const handleTogglePublish = async (examId) => {
    const updatedExam = await togglePublishExam(examId);

    setExams((currentExams) =>
      currentExams.map((exam) => (exam.id === examId ? updatedExam : exam))
    );
  };

  return (
    <div className="container mt-4">
      <div className="mb-4">
        <h2>Teacher Dashboard</h2>
        <p className="text-muted">
          Create exams, publish them, and manage exam questions.
        </p>
      </div>

      <AddExam onAddExam={handleAddExam} />

      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card shadow-sm">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0">Exam List</h5>
            </div>

            <div className="card-body">
              {loading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : (
                <ExamList
                  exams={exams}
                  selectedExamId={selectedExamId}
                  onSelectExam={setSelectedExamId}
                  onDeleteExam={handleDeleteExam}
                  onTogglePublish={handleTogglePublish}
                />
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <ExamDetails exam={selectedExam} />
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
