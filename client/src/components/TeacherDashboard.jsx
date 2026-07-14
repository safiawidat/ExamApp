import { useEffect, useState } from 'react';
import {
  createExamType,
  deleteExamType,
  listExamTypes,
  updateExamType,
} from '../api/examTypeService';
import {
  createLecturerExam,
  deleteLecturerExam,
  listLecturerExams,
  updateLecturerExam,
} from '../api/lecturerExamService';
import ExamManager from './ExamManager';
import ExamTypeManager from './ExamTypeManager';
import { safeApiMessage } from './authoringUi';

const loadWorkspace = () => Promise.all([
  listExamTypes(),
  listLecturerExams(),
]);

const TeacherDashboard = ({ currentUser, onOpenQuestionEditor }) => {
  const [examTypes, setExamTypes] = useState([]);
  const [exams, setExams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedExamId, setSelectedExamId] = useState(null);

  useEffect(() => {
    let active = true;

    loadWorkspace()
      .then(([loadedExamTypes, loadedExams]) => {
        if (active) {
          setExamTypes(loadedExamTypes);
          setExams(loadedExams);
          setLoadError('');
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(safeApiMessage(error, 'Unable to load the exam authoring workspace.'));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const retryLoad = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const [loadedExamTypes, loadedExams] = await loadWorkspace();
      setExamTypes(loadedExamTypes);
      setExams(loadedExams);
    } catch (error) {
      setLoadError(safeApiMessage(error, 'Unable to load the exam authoring workspace.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateExamType = async (payload) => {
    const created = await createExamType(payload);
    setExamTypes((current) => [...current, created]);
    setSuccessMessage(`Exam type “${created.name}” was created.`);
    return created;
  };

  const handleUpdateExamType = async (examTypeId, payload) => {
    const updated = await updateExamType(examTypeId, payload);
    setExamTypes((current) => current.map((examType) => (
      examType.id === updated.id ? updated : examType
    )));
    setSuccessMessage(`Exam type “${updated.name}” was updated.`);
    return updated;
  };

  const handleDeleteExamType = async (examTypeId) => {
    const deleted = examTypes.find((examType) => examType.id === examTypeId);
    await deleteExamType(examTypeId);
    setExamTypes((current) => current.filter((examType) => examType.id !== examTypeId));
    setSuccessMessage(`Exam type “${deleted?.name ?? 'selected type'}” was deleted.`);
  };

  const handleCreateExam = async (payload) => {
    const created = await createLecturerExam(payload);
    setExams((current) => [created, ...current]);
    setSuccessMessage(`Draft exam “${created.title}” was created.`);
    return created;
  };

  const handleUpdateExam = async (examId, payload) => {
    const updated = await updateLecturerExam(examId, payload);
    setExams((current) => current.map((exam) => (
      exam.id === updated.id ? updated : exam
    )));
    setSuccessMessage(`Draft exam “${updated.title}” was updated.`);
    return updated;
  };

  const handleDeleteExam = async (examId) => {
    const deleted = exams.find((exam) => exam.id === examId);
    await deleteLecturerExam(examId);
    setExams((current) => current.filter((exam) => exam.id !== examId));
    setSuccessMessage(`Draft exam “${deleted?.title ?? 'selected exam'}” was deleted.`);

    if (selectedExamId === examId) {
      setSelectedExamId(null);
    }
  };

  const handleOpenQuestions = (exam) => {
    if (onOpenQuestionEditor) {
      onOpenQuestionEditor(exam);
      return;
    }

    setSelectedExamId(exam.id);
  };

  const selectedExam = exams.find((exam) => exam.id === selectedExamId);

  if (selectedExam) {
    return (
      <section className="container py-4" aria-labelledby="question-editor-heading">
        <button
          className="btn btn-outline-secondary mb-3"
          type="button"
          onClick={() => setSelectedExamId(null)}
        >
          Back to exams
        </button>
        <h1 id="question-editor-heading" className="h2">Question editor</h1>
        <h2 className="h4">{selectedExam.title}</h2>
        <p className="text-muted mb-0">
          Manage the questions for this draft exam.
        </p>
      </section>
    );
  }

  return (
    <div className="container py-4">
      <header className="mb-4">
        <h1 className="h2">Teacher Dashboard</h1>
        <p className="text-muted mb-0">
          Manage shared exam types and your draft exams.
        </p>
      </header>

      <div aria-live="polite" aria-atomic="true">
        {successMessage && (
          <div className="alert alert-success" role="status">{successMessage}</div>
        )}
      </div>

      {isLoading && (
        <div className="text-center py-5" role="status">
          <div className="spinner-border text-primary" aria-hidden="true" />
          <div className="mt-2">Loading exam authoring workspace…</div>
        </div>
      )}

      {!isLoading && loadError && (
        <div className="alert alert-danger" role="alert">
          <p>{loadError}</p>
          <button className="btn btn-outline-danger" type="button" onClick={retryLoad}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !loadError && (
        <div className="row g-4 align-items-start">
          <div className="col-xl-5">
            <ExamTypeManager
              examTypes={examTypes}
              currentUserId={currentUser?.id}
              onCreate={handleCreateExamType}
              onUpdate={handleUpdateExamType}
              onDelete={handleDeleteExamType}
            />
          </div>
          <div className="col-xl-7">
            <ExamManager
              exams={exams}
              examTypes={examTypes}
              currentUserId={currentUser?.id}
              onCreate={handleCreateExam}
              onUpdate={handleUpdateExam}
              onDelete={handleDeleteExam}
              onOpenQuestions={handleOpenQuestions}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
