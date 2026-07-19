import { ApiError } from './apiClient';

const MAX_INTEGER = 2147483647;
const SCORE_SCALE = 10000;
const PERCENTAGE_SCALE = 100;
const questionTypes = new Set(['multiple_choice', 'true_false', 'short_answer']);
const topLevelFields = new Set([
  'exam_id',
  'exam_title',
  'submission_id',
  'submitted_at',
  'result_published_at',
  'total_score',
  'maximum_score',
  'percentage',
  'questions',
]);
const commonQuestionFields = [
  'id',
  'position',
  'question_type',
  'prompt',
  'is_unanswered',
  'awarded_points',
  'maximum_points',
  'feedback',
];
const questionFields = {
  multiple_choice: new Set([
    ...commonQuestionFields,
    'selected_option_id',
    'correct_option_id',
    'options',
  ]),
  true_false: new Set([
    ...commonQuestionFields,
    'boolean_answer',
    'correct_answer',
  ]),
  short_answer: new Set([
    ...commonQuestionFields,
    'text_answer',
    'reference_answer',
  ]),
};
const optionFields = new Set(['id', 'text', 'position']);

const invalidResponse = () => new ApiError(
  500,
  'The server returned an invalid student result response.',
);

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactFields = (value, fields) => {
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every((key) => fields.has(key));
};
const isPositiveInteger = (value) => Number.isInteger(value)
  && value >= 1
  && value <= MAX_INTEGER;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';
const isTimestamp = (value) => isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
const isNullableString = (value) => value === null || typeof value === 'string';
const isMark = (value) => isFiniteNumber(value) && value >= 0 && value <= 1;
const hasUniqueValues = (values) => new Set(values).size === values.length;
const isOrdered = (values) => values.every((value, index) => (
  index === 0
  || values[index - 1].position < value.position
  || (
    values[index - 1].position === value.position
    && values[index - 1].id < value.id
  )
));

const calculatePercentage = (total, maximum) => {
  const totalUnits = Math.round((total + Number.EPSILON) * SCORE_SCALE);
  return Math.round(
    (totalUnits * 100 * PERCENTAGE_SCALE) / (maximum * SCORE_SCALE),
  ) / PERCENTAGE_SCALE;
};

const validateOption = (value) => {
  if (
    !isPlainObject(value)
    || !hasExactFields(value, optionFields)
    || !isPositiveInteger(value.id)
    || !isNonEmptyString(value.text)
    || !isPositiveInteger(value.position)
  ) {
    throw invalidResponse();
  }

  return { id: value.id, text: value.text, position: value.position };
};

const validateCommonQuestion = (value) => {
  if (
    !isPlainObject(value)
    || !questionTypes.has(value.question_type)
    || !hasExactFields(value, questionFields[value.question_type])
    || !isPositiveInteger(value.id)
    || !isPositiveInteger(value.position)
    || !isNonEmptyString(value.prompt)
    || typeof value.is_unanswered !== 'boolean'
    || !isMark(value.awarded_points)
    || value.maximum_points !== 1
    || !isNullableString(value.feedback)
  ) {
    throw invalidResponse();
  }

  return {
    id: value.id,
    position: value.position,
    question_type: value.question_type,
    prompt: value.prompt,
    is_unanswered: value.is_unanswered,
    awarded_points: value.awarded_points,
    maximum_points: 1,
    feedback: value.feedback,
  };
};

const validateMultipleChoice = (value, question) => {
  if (
    (value.selected_option_id !== null && !isPositiveInteger(value.selected_option_id))
    || !isPositiveInteger(value.correct_option_id)
    || !Array.isArray(value.options)
    || value.options.length < 2
  ) {
    throw invalidResponse();
  }

  const options = value.options.map(validateOption);
  const optionIds = options.map(({ id }) => id);

  if (
    !hasUniqueValues(optionIds)
    || !hasUniqueValues(options.map(({ position }) => position))
    || !isOrdered(options)
    || !optionIds.includes(value.correct_option_id)
    || (value.selected_option_id !== null && !optionIds.includes(value.selected_option_id))
    || value.is_unanswered !== (value.selected_option_id === null)
    || value.awarded_points !== (
      value.selected_option_id === value.correct_option_id ? 1 : 0
    )
  ) {
    throw invalidResponse();
  }

  return {
    ...question,
    selected_option_id: value.selected_option_id,
    correct_option_id: value.correct_option_id,
    options,
  };
};

const validateTrueFalse = (value, question) => {
  if (
    (value.boolean_answer !== null && typeof value.boolean_answer !== 'boolean')
    || typeof value.correct_answer !== 'boolean'
    || value.is_unanswered !== (value.boolean_answer === null)
    || value.awarded_points !== (
      value.boolean_answer !== null && value.boolean_answer === value.correct_answer ? 1 : 0
    )
  ) {
    throw invalidResponse();
  }

  return {
    ...question,
    boolean_answer: value.boolean_answer,
    correct_answer: value.correct_answer,
  };
};

const validateShortAnswer = (value, question) => {
  const validTextAnswer = value.text_answer === null || isNonEmptyString(value.text_answer);

  if (
    !validTextAnswer
    || !isNonEmptyString(value.reference_answer)
    || value.is_unanswered !== (value.text_answer === null)
    || (value.is_unanswered && value.awarded_points !== 0)
  ) {
    throw invalidResponse();
  }

  return {
    ...question,
    text_answer: value.text_answer,
    reference_answer: value.reference_answer,
  };
};

const validateQuestion = (value) => {
  const question = validateCommonQuestion(value);

  if (value.question_type === 'multiple_choice') {
    return validateMultipleChoice(value, question);
  }

  if (value.question_type === 'true_false') {
    return validateTrueFalse(value, question);
  }

  return validateShortAnswer(value, question);
};

export const validateStudentResult = (value) => {
  if (
    !isPlainObject(value)
    || !hasExactFields(value, topLevelFields)
    || !isPositiveInteger(value.exam_id)
    || !isNonEmptyString(value.exam_title)
    || !isPositiveInteger(value.submission_id)
    || !isTimestamp(value.submitted_at)
    || !isTimestamp(value.result_published_at)
    || Date.parse(value.result_published_at) < Date.parse(value.submitted_at)
    || !isFiniteNumber(value.total_score)
    || !isPositiveInteger(value.maximum_score)
    || value.total_score < 0
    || value.total_score > value.maximum_score
    || !isFiniteNumber(value.percentage)
    || value.percentage !== calculatePercentage(value.total_score, value.maximum_score)
    || !Array.isArray(value.questions)
    || value.questions.length === 0
  ) {
    throw invalidResponse();
  }

  const questions = value.questions.map(validateQuestion);
  const totalUnits = questions.reduce(
    (sum, question) => sum + Math.round(
      (question.awarded_points + Number.EPSILON) * SCORE_SCALE,
    ),
    0,
  );

  if (
    questions.length !== value.maximum_score
    || !hasUniqueValues(questions.map(({ id }) => id))
    || !hasUniqueValues(questions.map(({ position }) => position))
    || !isOrdered(questions)
    || totalUnits / SCORE_SCALE !== value.total_score
  ) {
    throw invalidResponse();
  }

  return {
    exam_id: value.exam_id,
    exam_title: value.exam_title,
    submission_id: value.submission_id,
    submitted_at: value.submitted_at,
    result_published_at: value.result_published_at,
    total_score: value.total_score,
    maximum_score: value.maximum_score,
    percentage: value.percentage,
    questions,
  };
};
