import { useEffect, useRef, useState } from 'react';
import {
  getStudentExam,
  listStudentExams,
  submitStudentExam,
} from '../api/studentExamService';
import StudentForm from './StudentForm';
import { safeApiMessage } from './authoringUi';

const refreshFailureMessage = (
  'Exam submitted successfully, but the exam list could not be refreshed.'
);

const StudentPortal = () => {
  const [availableExams, setAvailableExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [examOpenError, setExamOpenError] = useState('');
  const [openingExamId, setOpeningExamId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const [submissionSuccess, setSubmissionSuccess] = useState('');
  const [refreshWarning, setRefreshWarning] = useState('');
  const submissionRequest = useRef(false);

  useEffect(() => {
    let isActive = true;

    const loadInitialCatalog = async () => {
      try {
        const exams = await listStudentExams();

        if (isActive) {
          setAvailableExams(exams);
          setCatalogError('');
        }
      } catch (error) {
        if (isActive) {
          setCatalogError(safeApiMessage(error, 'Unable to load available exams.'));
        }
      } finally {
        if (isActive) {
          setIsCatalogLoading(false);
        }
      }
    };

    loadInitialCatalog();

    return () => {
      isActive = false;
    };
  }, []);

  const refreshCatalogAfterSubmission = async () => {
    setIsRefreshing(true);
    setRefreshWarning('');

    try {
      const exams = await listStudentExams();
      setAvailableExams(exams);
      setCatalogError('');
      setRefreshWarning('');
    } catch {
      setRefreshWarning(refreshFailureMessage);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRetryCatalog = async () => {
    const isRefreshRetry = Boolean(refreshWarning);

    if (isCatalogLoading || isRefreshing) {
      return;
    }

    setCatalogError('');
    setRefreshWarning('');

    if (isRefreshRetry) {
      setIsRefreshing(true);
    } else {
      setIsCatalogLoading(true);
    }

    try {
      const exams = await listStudentExams();
      setAvailableExams(exams);
      setCatalogError('');
      setRefreshWarning('');
    } catch (error) {
      if (isRefreshRetry) {
        setRefreshWarning(refreshFailureMessage);
      } else {
        setCatalogError(safeApiMessage(error, 'Unable to load available exams.'));
      }
    } finally {
      if (isRefreshRetry) {
        setIsRefreshing(false);
      } else {
        setIsCatalogLoading(false);
      }
    }
  };

  const handleOpenExam = async (exam) => {
    if (exam.has_submitted || openingExamId !== null) {
      return;
    }

    setOpeningExamId(exam.id);
    setExamOpenError('');
    setSubmissionError('');
    setSubmissionSuccess('');

    try {
      const completeExam = await getStudentExam(exam.id);

      if (completeExam.has_submitted) {
        setAvailableExams((currentExams) => currentExams.map((currentExam) => (
          currentExam.id === exam.id
            ? { ...currentExam, has_submitted: true }
            : currentExam
        )));
        setExamOpenError('This exam has already been submitted.');
      } else {
        setSelectedExam(completeExam);
      }
    } catch (error) {
      setExamOpenError(safeApiMessage(error, 'Unable to open the exam.'));
    } finally {
      setOpeningExamId(null);
    }
  };

  const handleCancelExam = () => {
    setSelectedExam(null);
    setSubmissionError('');
  };

  const handleSubmitExam = async (answers) => {
    if (!selectedExam || submissionRequest.current) {
      return;
    }

    const submittedExamId = selectedExam.id;
    submissionRequest.current = true;
    setIsSubmitting(true);
    setSubmissionError('');

    try {
      await submitStudentExam(submittedExamId, answers);
      setAvailableExams((currentExams) => currentExams.map((exam) => (
        exam.id === submittedExamId
          ? { ...exam, has_submitted: true }
          : exam
      )));
      setSelectedExam(null);
      setSubmissionError('');
      setExamOpenError('');
      setSubmissionSuccess('Exam submitted successfully.');
      setIsSubmitting(false);
      submissionRequest.current = false;
      void refreshCatalogAfterSubmission();
    } catch (error) {
      setSubmissionError(safeApiMessage(error, 'Unable to submit the exam.'));
      setIsSubmitting(false);
      submissionRequest.current = false;
    }
  };

  const renderCatalog = () => {
    if (isCatalogLoading) {
      return <div role="status">Loading available exams...</div>;
    }

    if (catalogError) {
      return (
        <div>
          <div className="alert alert-danger" role="alert">
            {catalogError}
          </div>
          <button className="btn btn-primary" type="button" onClick={handleRetryCatalog}>
            Retry Exam List
          </button>
        </div>
      );
    }

    return (
      <section aria-labelledby="available-exams-heading">
        <h2 className="h4 mb-3" id="available-exams-heading">Available Exams</h2>

        {submissionSuccess && (
          <div className="alert alert-success" role="status">
            {submissionSuccess}
          </div>
        )}

        {isRefreshing && <div role="status">Refreshing exam list...</div>}

        {refreshWarning && (
          <div className="alert alert-warning" role="alert">
            <p>{refreshWarning}</p>
            <button
              className="btn btn-outline-dark"
              type="button"
              onClick={handleRetryCatalog}
            >
              Retry Exam List
            </button>
          </div>
        )}

        {examOpenError && (
          <div className="alert alert-danger" role="alert">
            {examOpenError}
          </div>
        )}

        {availableExams.length === 0 ? (
          <div className="alert alert-warning">No published exams are available.</div>
        ) : (
          <div className="row g-3">
            {availableExams.map((exam) => {
              const titleId = `student-exam-${exam.id}-title`;
              const isOpening = openingExamId === exam.id;
              const isAnyExamOpening = openingExamId !== null;

              return (
                <article
                  className="col-md-6"
                  key={exam.id}
                  aria-labelledby={titleId}
                >
                  <div className="card h-100">
                    <div className="card-body">
                      <h3 className="h5 card-title" id={titleId}>{exam.title}</h3>
                      <p className="card-text text-muted">
                        {exam.description || 'No description provided.'}
                      </p>
                      <p className="mb-1">
                        <strong>Exam type:</strong> {exam.exam_type.name}
                      </p>
                      <p className="mb-1">
                        <strong>Questions:</strong> {exam.question_count}
                      </p>
                      <p className="mb-3">
                        <strong>Total points:</strong> {exam.total_points}
                      </p>

                      {exam.has_submitted ? (
                        <button className="btn btn-secondary" type="button" disabled>
                          Submitted
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => handleOpenExam(exam)}
                          disabled={isAnyExamOpening}
                        >
                          {isOpening ? 'Opening...' : 'Take Exam'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <section
      className="container mt-4"
      aria-labelledby="student-portal-heading"
    >
      <h1 className="mb-4" id="student-portal-heading">Student Portal</h1>

      {selectedExam ? (
        <StudentForm
          exam={selectedExam}
          onSubmitExam={handleSubmitExam}
          onCancel={handleCancelExam}
          isSubmitting={isSubmitting}
          submissionError={submissionError}
        />
      ) : renderCatalog()}
    </section>
  );
};

export default StudentPortal;
