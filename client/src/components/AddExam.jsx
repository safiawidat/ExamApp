import { useState } from 'react';

const AddExam = ({ onAddExam }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [firstQuestion, setFirstQuestion] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!title.trim() || !firstQuestion.trim() || !correctAnswer.trim()) {
      return;
    }

    const newExam = {
      title: title.trim(),
      description: description.trim(),
      status: 'draft',
      questions: [
        {
          id: 1,
          text: firstQuestion.trim(),
          type: 'text',
          options: [],
          correctAnswer: correctAnswer.trim(),
        },
      ],
    };

    onAddExam(newExam);

    setTitle('');
    setDescription('');
    setFirstQuestion('');
    setCorrectAnswer('');
  };

  return (
    <form className="card shadow-sm mb-4" onSubmit={handleSubmit}>
      <div className="card-header bg-success text-white">
        <h5 className="mb-0">Create New Exam</h5>
      </div>

      <div className="card-body">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Exam Title</label>
            <input
              className="form-control"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: React Basics"
            />
          </div>

          <div className="col-md-6">
            <label className="form-label">Description</label>
            <input
              className="form-control"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short exam description"
            />
          </div>

          <div className="col-md-8">
            <label className="form-label">First Question</label>
            <input
              className="form-control"
              value={firstQuestion}
              onChange={(event) => setFirstQuestion(event.target.value)}
              placeholder="Write the first question"
            />
          </div>

          <div className="col-md-4">
            <label className="form-label">Correct Answer</label>
            <input
              className="form-control"
              value={correctAnswer}
              onChange={(event) => setCorrectAnswer(event.target.value)}
              placeholder="Correct answer"
            />
          </div>
        </div>

        <button className="btn btn-success mt-3" type="submit">
          Add Exam
        </button>
      </div>
    </form>
  );
};

export default AddExam;
