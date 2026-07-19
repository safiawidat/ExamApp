import { ApiError } from './apiClient';

const MAX_INTEGER = 2147483647;
const questionTypes = new Set([
  'multiple_choice',
  'true_false',
  'short_answer',
]);
const noticePlacements = new Set(['above', 'below']);
const forbiddenStudentFields = new Set([
  'lecturer_id',
  'correct_answer',
  'reference_answer',
  'is_correct',
  'student_id',
  'score',
  'feedback',
  'created_at',
  'updated_at',
]);
const answerFields = new Set([
  'question_id',
  'selected_option_id',
  'boolean_answer',
  'text_answer',
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

const isPositiveInteger = (value) => Number.isInteger(value)
  && value >= 1
  && value <= MAX_INTEGER;

const isNonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';
const isNullableString = (value) => value === null || typeof value === 'string';
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const assertNoForbiddenFields = (value, resource, visited = new WeakSet()) => {
  if (value === null || typeof value !== 'object' || visited.has(value)) {
    return;
  }

  visited.add(value);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenStudentFields.has(key)) {
      throw invalidResponse(resource);
    }

    assertNoForbiddenFields(nestedValue, resource, visited);
  }
};

const hasUniqueValues = (values) => new Set(values).size === values.length;

const isOrderedByPositionThenId = (values) => values.every((value, index) => {
  if (index === 0) {
    return true;
  }

  const previous = values[index - 1];
  return previous.position < value.position
    || (previous.position === value.position && previous.id < value.id);
});

const validateExamType = (value, resource) => {
  if (
    !isPlainObject(value)
    || !isPositiveInteger(value.id)
    || !isNonEmptyString(value.name)
  ) {
    throw invalidResponse(resource);
  }

  return {
    id: value.id,
    name: value.name,
  };
};

const validateStudentExamBase = (
  value,
  resource,
  { requireResultAvailability = false } = {},
) => {
  if (
    !isPlainObject(value)
    || !isPositiveInteger(value.id)
    || !isNonEmptyString(value.title)
    || !isNullableString(value.description)
    || !isNonEmptyString(value.published_at)
    || !isNonNegativeInteger(value.question_count)
    || !isNonNegativeInteger(value.total_points)
    || typeof value.has_submitted !== 'boolean'
    || (requireResultAvailability && typeof value.result_available !== 'boolean')
  ) {
    throw invalidResponse(resource);
  }

  const exam = {
    id: value.id,
    title: value.title,
    description: value.description,
    published_at: value.published_at,
    exam_type: validateExamType(value.exam_type, resource),
    question_count: value.question_count,
    total_points: value.total_points,
    has_submitted: value.has_submitted,
  };

  if (requireResultAvailability) {
    exam.result_available = value.result_available;
  }

  return exam;
};

const validateNotice = (value, resource) => {
  if (
    !isPlainObject(value)
    || !isNonEmptyString(value.message)
    || !noticePlacements.has(value.placement)
  ) {
    throw invalidResponse(resource);
  }

  return {
    message: value.message,
    placement: value.placement,
  };
};

const validateOption = (value, resource) => {
  if (
    !isPlainObject(value)
    || !isPositiveInteger(value.id)
    || !isNonEmptyString(value.text)
    || !isPositiveInteger(value.position)
  ) {
    throw invalidResponse(resource);
  }

  return {
    id: value.id,
    text: value.text,
    position: value.position,
  };
};

const validateOptions = (value, resource) => {
  if (!Array.isArray(value) || value.length < 2) {
    throw invalidResponse(resource);
  }

  const options = value.map((option) => validateOption(option, resource));

  if (
    !hasUniqueValues(options.map(({ id }) => id))
    || !hasUniqueValues(options.map(({ position }) => position))
    || !isOrderedByPositionThenId(options)
  ) {
    throw invalidResponse(resource);
  }

  return options;
};

const validateQuestion = (value, resource) => {
  if (
    !isPlainObject(value)
    || !isPositiveInteger(value.id)
    || !questionTypes.has(value.question_type)
    || !isNonEmptyString(value.prompt)
    || !isPositiveInteger(value.points)
    || !isPositiveInteger(value.position)
  ) {
    throw invalidResponse(resource);
  }

  const question = {
    id: value.id,
    question_type: value.question_type,
    prompt: value.prompt,
    points: value.points,
    position: value.position,
  };

  if (hasOwn(value, 'notice')) {
    question.notice = validateNotice(value.notice, resource);
  }

  if (value.question_type === 'multiple_choice') {
    question.options = validateOptions(value.options, resource);
  } else if (hasOwn(value, 'options')) {
    throw invalidResponse(resource);
  }

  return question;
};

export const requireStudentPositiveId = (value, label) => {
  if (!isPositiveInteger(value)) {
    throw new TypeError(`${label} must be a positive integer.`);
  }

  return value;
};

export const validateStudentExamList = (value) => {
  const resource = 'student exam list';
  assertNoForbiddenFields(value, resource);

  if (!Array.isArray(value)) {
    throw invalidResponse(resource);
  }

  return value.map((exam) => validateStudentExamBase(exam, resource, {
    requireResultAvailability: true,
  }));
};

export const validateStudentExam = (value) => {
  const resource = 'student exam';
  assertNoForbiddenFields(value, resource);
  const exam = validateStudentExamBase(value, resource);

  if (!Array.isArray(value.questions)) {
    throw invalidResponse(resource);
  }

  const questions = value.questions.map((question) => validateQuestion(question, resource));

  if (
    questions.length !== exam.question_count
    || !hasUniqueValues(questions.map(({ id }) => id))
    || !hasUniqueValues(questions.map(({ position }) => position))
    || !isOrderedByPositionThenId(questions)
    || questions.reduce((total, question) => total + question.points, 0)
      !== exam.total_points
  ) {
    throw invalidResponse(resource);
  }

  return {
    ...exam,
    questions,
  };
};

export const validateStudentAnswers = (answers) => {
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new TypeError('Answers must be a non-empty array.');
  }

  const normalizedAnswers = answers.map((answer) => {
    if (!isPlainObject(answer)) {
      throw new TypeError('Each answer must be an object.');
    }

    for (const field of Object.keys(answer)) {
      if (!answerFields.has(field)) {
        throw new TypeError(`Unsupported answer field: ${field}.`);
      }
    }

    const questionId = requireStudentPositiveId(answer.question_id, 'Question ID');
    const normalized = { question_id: questionId };
    let selectedOptionId = null;
    let booleanAnswer = null;
    let textAnswer = null;

    if (hasOwn(answer, 'selected_option_id')) {
      if (
        answer.selected_option_id !== null
        && !isPositiveInteger(answer.selected_option_id)
      ) {
        throw new TypeError('Selected option ID must be a positive integer or null.');
      }

      selectedOptionId = answer.selected_option_id;
      normalized.selected_option_id = selectedOptionId;
    }

    if (hasOwn(answer, 'boolean_answer')) {
      if (
        answer.boolean_answer !== null
        && typeof answer.boolean_answer !== 'boolean'
      ) {
        throw new TypeError('Boolean answer must be true, false, or null.');
      }

      booleanAnswer = answer.boolean_answer;
      normalized.boolean_answer = booleanAnswer;
    }

    if (hasOwn(answer, 'text_answer')) {
      if (answer.text_answer !== null && typeof answer.text_answer !== 'string') {
        throw new TypeError('Text answer must be a string or null.');
      }

      textAnswer = answer.text_answer === null
        ? null
        : answer.text_answer.trim() || null;
      normalized.text_answer = textAnswer;
    }

    const valueCount = [selectedOptionId, booleanAnswer, textAnswer]
      .filter((answerValue) => answerValue !== null)
      .length;

    if (valueCount > 1) {
      throw new TypeError('Each question may contain at most one answer value.');
    }

    return normalized;
  });

  if (!hasUniqueValues(normalizedAnswers.map(({ question_id: questionId }) => questionId))) {
    throw new TypeError('Submission answers must not contain duplicate question IDs.');
  }

  return normalizedAnswers;
};

export const validateStudentSubmission = (value, examId, answerCount) => {
  const resource = 'student submission';

  if (
    !isPlainObject(value)
    || !isPositiveInteger(value.id)
    || !isPositiveInteger(value.exam_id)
    || value.exam_id !== examId
    || !isNonEmptyString(value.submitted_at)
    || !Number.isSafeInteger(value.answer_count)
    || value.answer_count < 1
    || value.answer_count !== answerCount
  ) {
    throw invalidResponse(resource);
  }

  return {
    id: value.id,
    exam_id: value.exam_id,
    submitted_at: value.submitted_at,
    answer_count: value.answer_count,
  };
};
