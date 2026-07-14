import { useId, useState } from 'react';
import { safeApiMessage } from './authoringUi';

const MAX_POINTS = 2147483647;
const blankOptions = () => [
  { text: '', is_correct: false },
  { text: '', is_correct: false },
];

const initialValues = (question) => ({
  questionType: question?.question_type ?? 'multiple_choice',
  prompt: question?.prompt ?? '',
  points: question ? String(question.points) : '1',
  options: question?.question_type === 'multiple_choice'
    ? question.options.map((option) => ({
      text: option.text,
      is_correct: option.is_correct,
    }))
    : blankOptions(),
  correctAnswer: question?.question_type === 'true_false'
    ? question.correct_answer
    : true,
  referenceAnswer: question?.question_type === 'short_answer'
    ? question.reference_answer
    : '',
});

const QuestionForm = ({ question = null, onSubmit, onCancel }) => {
  const formId = useId();
  const initial = initialValues(question);
  const [questionType, setQuestionType] = useState(initial.questionType);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [points, setPoints] = useState(initial.points);
  const [options, setOptions] = useState(initial.options);
  const [correctAnswer, setCorrectAnswer] = useState(initial.correctAnswer);
  const [referenceAnswer, setReferenceAnswer] = useState(initial.referenceAnswer);
  const [pendingType, setPendingType] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const applyType = (nextType) => {
    setQuestionType(nextType);
    setPendingType('');
    setError('');

    if (nextType === 'multiple_choice') {
      setOptions(blankOptions());
    } else if (nextType === 'true_false') {
      setCorrectAnswer(true);
    } else {
      setReferenceAnswer('');
    }
  };

  const handleTypeChange = (event) => {
    const nextType = event.target.value;

    if (nextType === questionType) {
      return;
    }

    if (
      questionType === 'multiple_choice'
      && options.some((option) => option.text.trim() !== '')
    ) {
      setPendingType(nextType);
      return;
    }

    applyType(nextType);
  };

  const updateOption = (index, text) => {
    setOptions((current) => current.map((option, optionIndex) => (
      optionIndex === index ? { ...option, text } : option
    )));
  };

  const markCorrect = (index) => {
    setOptions((current) => current.map((option, optionIndex) => ({
      ...option,
      is_correct: optionIndex === index,
    })));
  };

  const removeOption = (index) => {
    if (options.length <= 2) {
      return;
    }

    setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index));
  };

  const buildPayload = () => {
    const normalizedPrompt = prompt.trim();

    if (!normalizedPrompt) {
      throw new Error('Question prompt is required.');
    }

    if (!/^[1-9]\d*$/.test(points)) {
      throw new Error('Points must be a positive whole number.');
    }

    const normalizedPoints = Number(points);

    if (!Number.isSafeInteger(normalizedPoints) || normalizedPoints > MAX_POINTS) {
      throw new Error('Points must be a positive whole number.');
    }

    const payload = {
      question_type: questionType,
      prompt: normalizedPrompt,
      points: normalizedPoints,
    };

    if (questionType === 'multiple_choice') {
      if (options.length < 2) {
        throw new Error('Add at least two options.');
      }

      const normalizedOptions = options.map((option) => ({
        text: option.text.trim(),
        is_correct: option.is_correct,
      }));

      if (normalizedOptions.some((option) => !option.text)) {
        throw new Error('Every option requires text.');
      }

      const optionNames = normalizedOptions.map((option) => option.text.toLowerCase());

      if (new Set(optionNames).size !== optionNames.length) {
        throw new Error('Option text must be unique.');
      }

      if (normalizedOptions.filter((option) => option.is_correct).length !== 1) {
        throw new Error('Select exactly one correct option.');
      }

      payload.options = normalizedOptions;
    } else if (questionType === 'true_false') {
      payload.correct_answer = correctAnswer;
    } else {
      const normalizedReference = referenceAnswer.trim();

      if (!normalizedReference) {
        throw new Error('Reference answer is required.');
      }

      payload.reference_answer = normalizedReference;
    }

    return payload;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSaving || pendingType) {
      return;
    }

    let payload;

    try {
      payload = buildPayload();
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onSubmit(payload);
    } catch (requestError) {
      setError(safeApiMessage(requestError, 'Unable to save the question.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="border rounded p-3" onSubmit={handleSubmit}>
      <div className="row g-3">
        <div className="col-md-5">
          <label className="form-label" htmlFor={`${formId}-question-type`}>Question type</label>
          <select
            id={`${formId}-question-type`}
            className="form-select"
            value={questionType}
            onChange={handleTypeChange}
            disabled={isSaving}
          >
            <option value="multiple_choice">Multiple choice</option>
            <option value="true_false">True / false</option>
            <option value="short_answer">Short answer</option>
          </select>
        </div>
        <div className="col-md-7">
          <label className="form-label" htmlFor={`${formId}-question-points`}>Points</label>
          <input
            id={`${formId}-question-points`}
            className="form-control"
            type="number"
            min="1"
            max={MAX_POINTS}
            step="1"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            disabled={isSaving}
          />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor={`${formId}-question-prompt`}>Prompt</label>
          <textarea
            id={`${formId}-question-prompt`}
            className="form-control"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={isSaving}
            rows="3"
          />
        </div>
      </div>

      {pendingType && (
        <div className="alert alert-warning mt-3" role="alert">
          <p>Changing type will discard the current multiple-choice options.</p>
          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-warning"
              type="button"
              onClick={() => applyType(pendingType)}
            >
              Confirm type change
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              type="button"
              onClick={() => setPendingType('')}
            >
              Keep current type
            </button>
          </div>
        </div>
      )}

      {questionType === 'multiple_choice' && !pendingType && (
        <fieldset className="mt-3">
          <legend className="h6">Options</legend>
          <div className="vstack gap-2">
            {options.map((option, index) => (
              <div className="input-group" key={`option-${index + 1}`}>
                <span className="input-group-text">
                  <input
                    className="form-check-input mt-0"
                    type="radio"
                    name="correct-option"
                    checked={option.is_correct}
                    onChange={() => markCorrect(index)}
                    aria-label={`Mark option ${index + 1} correct`}
                    disabled={isSaving}
                  />
                </span>
                <label
                  className="visually-hidden"
                  htmlFor={`${formId}-question-option-${index}`}
                >
                  Option {index + 1}
                </label>
                <input
                  id={`${formId}-question-option-${index}`}
                  className="form-control"
                  value={option.text}
                  onChange={(event) => updateOption(index, event.target.value)}
                  disabled={isSaving}
                  aria-label={`Option ${index + 1}`}
                />
                <button
                  className="btn btn-outline-danger"
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={isSaving || options.length <= 2}
                  aria-label={`Remove option ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn btn-sm btn-outline-primary mt-2"
            type="button"
            onClick={() => setOptions((current) => [
              ...current,
              { text: '', is_correct: false },
            ])}
            disabled={isSaving}
          >
            Add option
          </button>
        </fieldset>
      )}

      {questionType === 'true_false' && !pendingType && (
        <div className="mt-3">
          <label className="form-label" htmlFor={`${formId}-true-false-answer`}>
            Correct answer
          </label>
          <select
            id={`${formId}-true-false-answer`}
            className="form-select"
            value={String(correctAnswer)}
            onChange={(event) => setCorrectAnswer(event.target.value === 'true')}
            disabled={isSaving}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </div>
      )}

      {questionType === 'short_answer' && !pendingType && (
        <div className="mt-3">
          <label className="form-label" htmlFor={`${formId}-reference-answer`}>
            Reference answer
          </label>
          <textarea
            id={`${formId}-reference-answer`}
            className="form-control"
            value={referenceAnswer}
            onChange={(event) => setReferenceAnswer(event.target.value)}
            disabled={isSaving}
            rows="2"
          />
        </div>
      )}

      {error && <div className="alert alert-danger mt-3" role="alert">{error}</div>}

      <div className="d-flex gap-2 mt-3">
        <button className="btn btn-primary" type="submit" disabled={isSaving || Boolean(pendingType)}>
          {isSaving ? 'Saving…' : (question ? 'Save question' : 'Add question')}
        </button>
        {onCancel && (
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

export default QuestionForm;
