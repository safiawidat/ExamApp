import { useState } from 'react';

const StudentForm = ({ exam, onSubmitExam, onCancel }) => {
  const [studentName, setStudentName] = useState('');
  const [answers, setAnswers] = useState({});

  const handleAnswerChange = (questionId, value) => {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!studentName.trim()) {
      return;
    }

    onSubmitExam({
      studentName: studentName.trim(),
      examId: exam.id,
      answers,
    });
  };

  return (
    <form className="card shadow-sm" onSubmit={handleSubmit}>
      <div className="card-header bg-primary text-white">
        <h5 className="mb-0">{exam.title}</h5>
      </div>

      <div className="card-body">
        <div className="mb-3">
          <label className="form-label">Student Name</label>
          <input
            className="form-control"
            value={studentName}
            onChange={(event) => setStudentName(event.target.value)}
            placeholder="Enter your name"
          />
        </div>

        {(exam.questions || []).map((question) => (
          <div className="mb-4" key={question.id}>
            <label className="form-label fw-bold">{question.question}</label>

            {question.options && question.options.length > 0 ? (
              question.options.map((option) => (
                <div className="form-check" key={option}>
                  <input
                    className="form-check-input"
                    type="radio"
                    name={`question-${question.id}`}
                    value={option}
                    checked={answers[question.id] === option}
                    onChange={(event) => handleAnswerChange(question.id, event.target.value)}
                  />
                  <label className="form-check-label">{option}</label>
                </div>
              ))
            ) : (
              <input
                className="form-control"
                value={answers[question.id] || ''}
                onChange={(event) => handleAnswerChange(question.id, event.target.value)}
                placeholder="Write your answer"
              />
            )}
          </div>
        ))}

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit">
            Submit Exam
          </button>
          <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>
            Back
          </button>
        </div>
      </div>
    </form>
  );
};

export default StudentForm;
