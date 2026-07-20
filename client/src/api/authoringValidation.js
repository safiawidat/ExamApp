import { ApiError } from './apiClient';

const questionTypes = new Set(['multiple_choice', 'true_false', 'short_answer']);
const examStatuses = new Set(['draft', 'published']);
const invalidResponse = (resource) => new ApiError(
  500,
  `The server returned an invalid ${resource} response.`,
);
const isObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value);
const isPositiveId = (value) => Number.isSafeInteger(value) && value > 0;
const isTimestamp = (value) => typeof value === 'string' && value.trim() !== '';
const isNullableString = (value) => value === null || typeof value === 'string';

export const requirePositiveId = (value, label) => {
  if (!isPositiveId(value)) {
    throw new TypeError(`${label} must be a positive integer.`);
  }

  return value;
};

export const requirePayload = (value) => {
  if (!isObject(value)) {
    throw new TypeError('Request payload must be an object.');
  }

  return value;
};

export const validateExamType = (value) => {
  if (
    !isObject(value)
    || !isPositiveId(value.id)
    || typeof value.name !== 'string'
    || value.name.trim() === ''
    || !isNullableString(value.description)
    || !isPositiveId(value.created_by)
    || !isTimestamp(value.created_at)
    || !isTimestamp(value.updated_at)
  ) {
    throw invalidResponse('exam type');
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    created_by: value.created_by,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
};

export const validateExam = (value) => {
  if (
    !isObject(value)
    || !isPositiveId(value.id)
    || !isPositiveId(value.lecturer_id)
    || !isPositiveId(value.exam_type_id)
    || typeof value.title !== 'string'
    || value.title.trim() === ''
    || !isNullableString(value.description)
    || !examStatuses.has(value.status)
    || !isTimestamp(value.created_at)
    || !isTimestamp(value.updated_at)
    || !(value.published_at === null || isTimestamp(value.published_at))
    || !Number.isSafeInteger(value.question_count)
    || value.question_count < 0
    || !isObject(value.exam_type)
    || !isPositiveId(value.exam_type.id)
    || typeof value.exam_type.name !== 'string'
    || value.exam_type.name.trim() === ''
  ) {
    throw invalidResponse('exam');
  }

  return {
    id: value.id,
    lecturer_id: value.lecturer_id,
    exam_type_id: value.exam_type_id,
    title: value.title,
    description: value.description,
    status: value.status,
    created_at: value.created_at,
    updated_at: value.updated_at,
    published_at: value.published_at,
    exam_type: {
      id: value.exam_type.id,
      name: value.exam_type.name,
    },
    question_count: value.question_count,
  };
};

const validateOption = (value) => {
  if (
    !isObject(value)
    || !isPositiveId(value.id)
    || typeof value.text !== 'string'
    || value.text.trim() === ''
    || typeof value.is_correct !== 'boolean'
    || !isPositiveId(value.position)
  ) {
    throw invalidResponse('question');
  }

  return {
    id: value.id,
    text: value.text,
    is_correct: value.is_correct,
    position: value.position,
  };
};

export const validateQuestion = (value) => {
  if (
    !isObject(value)
    || !isPositiveId(value.id)
    || !isPositiveId(value.exam_id)
    || !questionTypes.has(value.question_type)
    || typeof value.prompt !== 'string'
    || value.prompt.trim() === ''
    || !Number.isSafeInteger(value.points)
    || value.points < 1
    || !isPositiveId(value.position)
    || !isTimestamp(value.created_at)
    || !isTimestamp(value.updated_at)
  ) {
    throw invalidResponse('question');
  }

  const question = {
    id: value.id,
    exam_id: value.exam_id,
    question_type: value.question_type,
    prompt: value.prompt,
    points: value.points,
    position: value.position,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };

  if (value.question_type === 'multiple_choice') {
    if (!Array.isArray(value.options) || value.options.length < 2) {
      throw invalidResponse('question');
    }

    question.options = value.options.map(validateOption);

    if (question.options.filter((option) => option.is_correct).length !== 1) {
      throw invalidResponse('question');
    }
  } else if (value.question_type === 'true_false') {
    if (typeof value.correct_answer !== 'boolean') {
      throw invalidResponse('question');
    }

    question.correct_answer = value.correct_answer;
  } else {
    if (
      typeof value.reference_answer !== 'string'
      || value.reference_answer.trim() === ''
    ) {
      throw invalidResponse('question');
    }

    question.reference_answer = value.reference_answer;
  }

  return question;
};

export const validateList = (value, validator, resource) => {
  if (!Array.isArray(value)) {
    throw invalidResponse(resource);
  }

  return value.map(validator);
};
