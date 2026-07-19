import { ApiError } from './apiClient';

const MAX_INTEGER = 2147483647;
const MAX_FEEDBACK_LENGTH = 5000;
const gradingStates = new Set(['ungraded', 'in_progress', 'completed']);
const questionTypes = new Set(['multiple_choice', 'true_false', 'short_answer']);
const answerFields = new Set(['questionId', 'awardedPoints', 'feedback']);
const snapshotFields = new Set(['answers']);
const publicationFields = new Set([
  'id',
  'exam_id',
  'grading_state',
  'total_score',
  'maximum_score',
  'percentage',
  'graded_by',
  'grading_completed_at',
  'result_published_at',
]);

const invalidResponse = (resource) => new ApiError(
  500,
  `The server returned an invalid ${resource} response.`,
);

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const hasOnlyFields = (value, fields) => Object.keys(value)
  .every((field) => fields.has(field));
const isPositiveInteger = (value) => Number.isInteger(value)
  && value >= 1
  && value <= MAX_INTEGER;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';
const isTimestamp = (value) => isNonEmptyString(value)
  && !Number.isNaN(Date.parse(value));
const isNullableTimestamp = (value) => value === null || isTimestamp(value);
const isNullableString = (value) => value === null || typeof value === 'string';
const isNullablePositiveInteger = (value) => value === null || isPositiveInteger(value);
const isMark = (value) => isFiniteNumber(value) && value >= 0 && value <= 1;
const hasUniqueValues = (values) => new Set(values).size === values.length;

const isOrderedByPositionThenId = (values) => values.every((value, index) => {
  if (index === 0) {
    return true;
  }

  const previous = values[index - 1];
  return previous.position < value.position
    || (previous.position === value.position && previous.id < value.id);
});

const validateScoreState = (value, resource) => {
  const completed = value.grading_state === 'completed';
  const validMaximum = Number.isSafeInteger(value.maximum_score)
    && value.maximum_score >= 1;
  const validTotal = value.total_score === null
    || (isFiniteNumber(value.total_score)
      && value.total_score >= 0
      && value.total_score <= value.maximum_score);
  const validPercentage = value.percentage === null
    || (isFiniteNumber(value.percentage)
      && value.percentage >= 0
      && value.percentage <= 100);
  const expectedPercentage = value.total_score === null
    ? null
    : Math.round((value.total_score / value.maximum_score) * 10000) / 100;

  if (
    !gradingStates.has(value.grading_state)
    || !validMaximum
    || !validTotal
    || !validPercentage
    || value.percentage !== expectedPercentage
    || !isNullablePositiveInteger(value.graded_by)
    || !isNullableTimestamp(value.grading_completed_at)
    || !isNullableTimestamp(value.result_published_at)
    || (completed && (
      value.total_score === null
      || value.percentage === null
      || value.graded_by === null
      || value.grading_completed_at === null
    ))
    || (!completed && (
      value.total_score !== null
      || value.percentage !== null
      || value.graded_by !== null
      || value.grading_completed_at !== null
      || value.result_published_at !== null
    ))
    || (value.result_published_at !== null && !completed)
    || (value.result_published_at !== null
      && Date.parse(value.result_published_at) < Date.parse(value.grading_completed_at))
  ) {
    throw invalidResponse(resource);
  }
};

const validateSubmissionSummaryBase = (value, resource) => {
  if (
    !isPlainObject(value)
    || !isPositiveInteger(value.id)
    || !isPositiveInteger(value.exam_id)
    || !isPositiveInteger(value.student_id)
    || !isNonEmptyString(value.student_username)
    || !isTimestamp(value.submitted_at)
    || !isNullableString(value.grading_lecturer_username)
  ) {
    throw invalidResponse(resource);
  }

  validateScoreState(value, resource);

  if (
    (value.graded_by === null && value.grading_lecturer_username !== null)
    || (value.graded_by !== null && !isNonEmptyString(value.grading_lecturer_username))
  ) {
    throw invalidResponse(resource);
  }

  return {
    id: value.id,
    exam_id: value.exam_id,
    student_id: value.student_id,
    student_username: value.student_username,
    submitted_at: value.submitted_at,
    grading_state: value.grading_state,
    total_score: value.total_score,
    maximum_score: value.maximum_score,
    percentage: value.percentage,
    graded_by: value.graded_by,
    grading_lecturer_username: value.grading_lecturer_username,
    grading_completed_at: value.grading_completed_at,
    result_published_at: value.result_published_at,
  };
};

const validateOption = (value, resource) => {
  if (
    !isPlainObject(value)
    || !isPositiveInteger(value.id)
    || !isNonEmptyString(value.text)
    || !isPositiveInteger(value.position)
    || typeof value.is_correct !== 'boolean'
  ) {
    throw invalidResponse(resource);
  }

  return {
    id: value.id,
    text: value.text,
    position: value.position,
    is_correct: value.is_correct,
  };
};

const validateQuestionBase = (value, resource) => {
  if (
    !isPlainObject(value)
    || !isPositiveInteger(value.id)
    || !questionTypes.has(value.question_type)
    || !isNonEmptyString(value.prompt)
    || !isPositiveInteger(value.position)
    || typeof value.is_unanswered !== 'boolean'
    || !isNullableString(value.feedback)
    || (typeof value.feedback === 'string' && value.feedback.length > MAX_FEEDBACK_LENGTH)
  ) {
    throw invalidResponse(resource);
  }

  const expectedMode = value.question_type === 'short_answer' ? 'manual' : 'automatic';
  if (value.grading_mode !== expectedMode) {
    throw invalidResponse(resource);
  }

  return {
    id: value.id,
    question_type: value.question_type,
    prompt: value.prompt,
    position: value.position,
    grading_mode: value.grading_mode,
    is_unanswered: value.is_unanswered,
    awarded_points: value.awarded_points,
    feedback: value.feedback,
  };
};

const validateMultipleChoiceQuestion = (value, resource, question) => {
  const submitted = value.submitted_answer;
  if (
    !isPlainObject(submitted)
    || !hasOnlyFields(submitted, new Set(['selected_option_id']))
    || !hasOwn(submitted, 'selected_option_id')
    || !isNullablePositiveInteger(submitted.selected_option_id)
    || submitted.selected_option_id !== value.selected_option_id
    || !isPositiveInteger(value.correct_option_id)
    || !Array.isArray(value.options)
    || value.options.length < 2
    || !isMark(value.awarded_points)
    || hasOwn(value, 'boolean_answer')
    || hasOwn(value, 'correct_answer')
    || hasOwn(value, 'text_answer')
    || hasOwn(value, 'reference_answer')
  ) {
    throw invalidResponse(resource);
  }

  const options = value.options.map((option) => validateOption(option, resource));
  const optionIds = options.map(({ id }) => id);
  const correctOptions = options.filter(({ is_correct: isCorrect }) => isCorrect);
  const selectedOption = options.find(({ id }) => id === value.selected_option_id);
  const expectedMark = value.selected_option_id === value.correct_option_id ? 1 : 0;

  if (
    !hasUniqueValues(optionIds)
    || !hasUniqueValues(options.map(({ position }) => position))
    || !isOrderedByPositionThenId(options)
    || correctOptions.length !== 1
    || correctOptions[0].id !== value.correct_option_id
    || (value.selected_option_id !== null && !selectedOption)
    || value.is_unanswered !== (value.selected_option_id === null)
    || value.awarded_points !== expectedMark
  ) {
    throw invalidResponse(resource);
  }

  return {
    ...question,
    submitted_answer: { selected_option_id: submitted.selected_option_id },
    selected_option_id: value.selected_option_id,
    correct_option_id: value.correct_option_id,
    options,
  };
};

const validateTrueFalseQuestion = (value, resource, question) => {
  const submitted = value.submitted_answer;
  const validBooleanAnswer = value.boolean_answer === null
    || typeof value.boolean_answer === 'boolean';

  if (
    !isPlainObject(submitted)
    || !hasOnlyFields(submitted, new Set(['boolean_answer']))
    || !hasOwn(submitted, 'boolean_answer')
    || !validBooleanAnswer
    || submitted.boolean_answer !== value.boolean_answer
    || typeof value.correct_answer !== 'boolean'
    || !isMark(value.awarded_points)
    || value.is_unanswered !== (value.boolean_answer === null)
    || value.awarded_points !== (
      value.boolean_answer !== null && value.boolean_answer === value.correct_answer ? 1 : 0
    )
    || hasOwn(value, 'selected_option_id')
    || hasOwn(value, 'correct_option_id')
    || hasOwn(value, 'options')
    || hasOwn(value, 'text_answer')
    || hasOwn(value, 'reference_answer')
  ) {
    throw invalidResponse(resource);
  }

  return {
    ...question,
    submitted_answer: { boolean_answer: submitted.boolean_answer },
    boolean_answer: value.boolean_answer,
    correct_answer: value.correct_answer,
  };
};

const validateShortAnswerQuestion = (value, resource, question) => {
  const submitted = value.submitted_answer;
  const validTextAnswer = value.text_answer === null || isNonEmptyString(value.text_answer);
  const unanswered = value.text_answer === null;

  if (
    !isPlainObject(submitted)
    || !hasOnlyFields(submitted, new Set(['text_answer']))
    || !hasOwn(submitted, 'text_answer')
    || !validTextAnswer
    || submitted.text_answer !== value.text_answer
    || !isNonEmptyString(value.reference_answer)
    || value.is_unanswered !== unanswered
    || (unanswered && value.awarded_points !== 0)
    || (!unanswered && value.awarded_points !== null && !isMark(value.awarded_points))
    || hasOwn(value, 'selected_option_id')
    || hasOwn(value, 'correct_option_id')
    || hasOwn(value, 'options')
    || hasOwn(value, 'boolean_answer')
    || hasOwn(value, 'correct_answer')
  ) {
    throw invalidResponse(resource);
  }

  return {
    ...question,
    submitted_answer: { text_answer: submitted.text_answer },
    text_answer: value.text_answer,
    reference_answer: value.reference_answer,
  };
};

const validateQuestion = (value, resource) => {
  const question = validateQuestionBase(value, resource);

  if (value.question_type === 'multiple_choice') {
    return validateMultipleChoiceQuestion(value, resource, question);
  }

  if (value.question_type === 'true_false') {
    return validateTrueFalseQuestion(value, resource, question);
  }

  return validateShortAnswerQuestion(value, resource, question);
};

export const requireLecturerGradingPositiveId = (value, label) => {
  if (!isPositiveInteger(value)) {
    throw new TypeError(`${label} must be a positive integer.`);
  }

  return value;
};

export const validateLecturerSubmissionList = (value) => {
  const resource = 'lecturer submission list';
  if (!Array.isArray(value)) {
    throw invalidResponse(resource);
  }

  return value.map((submission) => validateSubmissionSummaryBase(submission, resource));
};

export const validateLecturerSubmissionDetail = (value) => {
  const resource = 'lecturer submission detail';
  const submission = validateSubmissionSummaryBase(value, resource);

  if (
    !isPlainObject(value.student)
    || value.student.id !== submission.student_id
    || value.student.username !== submission.student_username
    || !Array.isArray(value.questions)
  ) {
    throw invalidResponse(resource);
  }

  const questions = value.questions.map((question) => validateQuestion(question, resource));
  const awardedTotal = questions.reduce((total, question) => (
    total + (question.awarded_points ?? 0)
  ), 0);
  if (
    questions.length !== submission.maximum_score
    || !hasUniqueValues(questions.map(({ id }) => id))
    || !hasUniqueValues(questions.map(({ position }) => position))
    || !isOrderedByPositionThenId(questions)
    || (submission.grading_state === 'completed'
      && questions.some((question) => question.awarded_points === null))
    || (submission.grading_state === 'completed'
      && Math.abs(awardedTotal - submission.total_score) > Number.EPSILON * 10)
  ) {
    throw invalidResponse(resource);
  }

  return {
    ...submission,
    student: {
      id: value.student.id,
      username: value.student.username,
    },
    questions,
  };
};

export const validateLecturerGradingAction = (value, expectedState) => {
  const resource = 'lecturer grading action';
  if (
    !isPlainObject(value)
    || !isPositiveInteger(value.id)
    || !isPositiveInteger(value.exam_id)
    || value.grading_state !== expectedState
  ) {
    throw invalidResponse(resource);
  }

  validateScoreState(value, resource);

  return {
    id: value.id,
    exam_id: value.exam_id,
    grading_state: value.grading_state,
    total_score: value.total_score,
    maximum_score: value.maximum_score,
    percentage: value.percentage,
    graded_by: value.graded_by,
    grading_completed_at: value.grading_completed_at,
    result_published_at: value.result_published_at,
  };
};

export const validateLecturerResultPublication = (value) => {
  const resource = 'lecturer result publication';
  if (
    !isPlainObject(value)
    || !hasOnlyFields(value, publicationFields)
    || [...publicationFields].some((field) => !hasOwn(value, field))
    || !isPositiveInteger(value.id)
    || !isPositiveInteger(value.exam_id)
    || value.grading_state !== 'completed'
  ) {
    throw invalidResponse(resource);
  }

  validateScoreState(value, resource);

  if (
    value.total_score === null
    || value.percentage === null
    || value.graded_by === null
    || value.grading_completed_at === null
    || value.result_published_at === null
  ) {
    throw invalidResponse(resource);
  }

  return {
    id: value.id,
    exam_id: value.exam_id,
    grading_state: value.grading_state,
    total_score: value.total_score,
    maximum_score: value.maximum_score,
    percentage: value.percentage,
    graded_by: value.graded_by,
    grading_completed_at: value.grading_completed_at,
    result_published_at: value.result_published_at,
  };
};

export const validateGradingSnapshot = (value) => {
  if (!isPlainObject(value)) {
    throw new TypeError('Grading snapshot must be an object.');
  }

  const unsupportedField = Object.keys(value).find((field) => !snapshotFields.has(field));
  if (unsupportedField || !Array.isArray(value.answers) || value.answers.length === 0) {
    throw new TypeError('Grading snapshot must contain an answers array.');
  }

  const answers = value.answers.map((answer) => {
    if (!isPlainObject(answer)) {
      throw new TypeError('Each grading answer must be an object.');
    }

    const unsupportedAnswerField = Object.keys(answer)
      .find((field) => !answerFields.has(field));
    if (unsupportedAnswerField) {
      throw new TypeError(`Unsupported grading answer field: ${unsupportedAnswerField}.`);
    }

    const questionId = requireLecturerGradingPositiveId(answer.questionId, 'Question ID');
    if (answer.awardedPoints !== null && !isMark(answer.awardedPoints)) {
      throw new TypeError('Awarded points must be a number between 0 and 1, or null.');
    }
    if (
      answer.feedback !== null
      && (typeof answer.feedback !== 'string' || answer.feedback.length > MAX_FEEDBACK_LENGTH)
    ) {
      throw new TypeError(`Feedback must be a string of at most ${MAX_FEEDBACK_LENGTH} characters, or null.`);
    }

    return {
      questionId,
      awardedPoints: answer.awardedPoints,
      feedback: typeof answer.feedback === 'string' ? answer.feedback.trim() || null : null,
    };
  });

  if (!hasUniqueValues(answers.map(({ questionId }) => questionId))) {
    throw new TypeError('Grading answers must not contain duplicate question IDs.');
  }

  return { answers };
};

export { MAX_FEEDBACK_LENGTH };
