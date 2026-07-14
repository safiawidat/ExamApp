import { HttpError } from '../middleware/errorHandler.js';
import {
  createQuestionRecord,
  deleteQuestionAndCompact,
  findOwnedExamState,
  findQuestionById,
  findQuestionIdsByExamId,
  findQuestionsByExamId,
  reorderQuestionRecords,
  replaceQuestionOptions,
  updateQuestionRecord,
  withQuestionTransaction,
} from '../repositories/questionRepository.js';

const MAX_INTEGER = 2147483647;
const questionTypes = new Set(['multiple_choice', 'true_false', 'short_answer']);
const editableFields = new Set([
  'question_type',
  'prompt',
  'points',
  'options',
  'correct_answer',
  'reference_answer',
]);
const serverManagedFields = new Set([
  'id',
  'exam_id',
  'examId',
  'type',
  'text',
  'position',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
]);
const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
const isObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value);

const parseRouteId = (value, label) => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, `${label} must be a positive integer.`);
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id) || id > MAX_INTEGER) {
    throw new HttpError(400, `${label} must be a positive integer.`);
  }

  return id;
};

const validateQuestionPayload = (payload) => {
  if (!isObject(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const managedField = Object.keys(payload).find((field) => (
    serverManagedFields.has(field)
  ));

  if (managedField) {
    throw new HttpError(400, `Question field ${managedField} is server-managed.`);
  }

  const unsupportedField = Object.keys(payload).find((field) => (
    !editableFields.has(field)
  ));

  if (unsupportedField) {
    throw new HttpError(400, `Unsupported question field: ${unsupportedField}.`);
  }
};

const validateQuestionType = (value) => {
  if (typeof value !== 'string' || !questionTypes.has(value)) {
    throw new HttpError(
      400,
      'question_type must be multiple_choice, true_false, or short_answer.',
    );
  }

  return value;
};

const validatePrompt = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'Question prompt is required.');
  }

  return value.trim();
};

const validatePoints = (value) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_INTEGER) {
    throw new HttpError(400, 'Question points must be a positive integer.');
  }

  return value;
};

const validateOptions = (value) => {
  if (!Array.isArray(value) || value.length < 2) {
    throw new HttpError(400, 'Multiple-choice questions require at least two options.');
  }

  const normalized = value.map((option) => {
    if (!isObject(option)) {
      throw new HttpError(400, 'Every option must be a JSON object.');
    }

    const unsupportedField = Object.keys(option).find((field) => (
      field !== 'text' && field !== 'is_correct'
    ));

    if (unsupportedField) {
      throw new HttpError(400, `Unsupported option field: ${unsupportedField}.`);
    }

    if (typeof option.text !== 'string' || !option.text.trim()) {
      throw new HttpError(400, 'Every option requires non-empty text.');
    }

    if (typeof option.is_correct !== 'boolean') {
      throw new HttpError(400, 'Every option requires a boolean is_correct value.');
    }

    return {
      text: option.text.trim(),
      is_correct: option.is_correct,
    };
  });
  const normalizedTexts = normalized.map((option) => option.text.toLowerCase());

  if (new Set(normalizedTexts).size !== normalizedTexts.length) {
    throw new HttpError(400, 'Multiple-choice option text must be unique.');
  }

  if (normalized.filter((option) => option.is_correct).length !== 1) {
    throw new HttpError(400, 'Multiple-choice questions require exactly one correct option.');
  }

  return normalized;
};

const validateBooleanAnswer = (value) => {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'correct_answer must be a boolean.');
  }

  return value;
};

const validateReferenceAnswer = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'reference_answer must be a non-empty string.');
  }

  return value.trim();
};

const rejectFields = (payload, fields, questionType) => {
  const invalidField = fields.find((field) => hasOwn(payload, field));

  if (invalidField) {
    throw new HttpError(
      400,
      `${invalidField} is not supported for ${questionType} questions.`,
    );
  }
};

const buildTypeState = (payload, questionType, existingQuestion = null) => {
  const typeChanged = existingQuestion
    && existingQuestion.question_type !== questionType;

  if (questionType === 'multiple_choice') {
    rejectFields(payload, ['correct_answer', 'reference_answer'], questionType);
    const options = hasOwn(payload, 'options')
      ? validateOptions(payload.options)
      : (!typeChanged && existingQuestion
        ? validateOptions(existingQuestion.options.map((option) => ({
          text: option.text,
          is_correct: option.is_correct,
        })))
        : null);

    if (!options) {
      throw new HttpError(400, 'Multiple-choice questions require options.');
    }

    return { options, correctAnswer: null };
  }

  if (questionType === 'true_false') {
    rejectFields(payload, ['options', 'reference_answer'], questionType);
    const correctAnswer = hasOwn(payload, 'correct_answer')
      ? validateBooleanAnswer(payload.correct_answer)
      : (!typeChanged && existingQuestion ? existingQuestion.correct_answer : null);

    if (typeof correctAnswer !== 'boolean') {
      throw new HttpError(400, 'True/false questions require correct_answer.');
    }

    return { correctAnswer: String(correctAnswer) };
  }

  rejectFields(payload, ['options', 'correct_answer'], questionType);
  const referenceAnswer = hasOwn(payload, 'reference_answer')
    ? validateReferenceAnswer(payload.reference_answer)
    : (!typeChanged && existingQuestion ? existingQuestion.reference_answer : null);

  if (!referenceAnswer) {
    throw new HttpError(400, 'Short-answer questions require reference_answer.');
  }

  return {
    referenceAnswer,
    correctAnswer: referenceAnswer,
  };
};

const requireOwnedExam = async (
  examId,
  lecturerId,
  executor,
  { lock = false } = {},
) => {
  const exam = await findOwnedExamState(
    examId,
    lecturerId,
    executor,
    { lock },
  );

  if (!exam) {
    throw new HttpError(404, 'Exam not found.');
  }

  return exam;
};

const requireDraft = (exam) => {
  if (exam.status !== 'draft') {
    throw new HttpError(409, 'Published exams cannot be modified.');
  }
};

const requireQuestion = async (examId, questionId, executor, { lock = false } = {}) => {
  const question = await findQuestionById(
    examId,
    questionId,
    executor,
    { lock },
  );

  if (!question) {
    throw new HttpError(404, 'Question not found.');
  }

  return question;
};

export async function listQuestions(examIdValue, lecturerId) {
  const examId = parseRouteId(examIdValue, 'Exam ID');
  await requireOwnedExam(examId, lecturerId);
  return findQuestionsByExamId(examId);
}

export async function addQuestion(examIdValue, payload, lecturerId) {
  const examId = parseRouteId(examIdValue, 'Exam ID');
  validateQuestionPayload(payload);

  const questionType = validateQuestionType(payload.question_type);
  const questionState = {
    questionType,
    prompt: validatePrompt(payload.prompt),
    points: validatePoints(payload.points),
    ...buildTypeState(payload, questionType),
  };

  return withQuestionTransaction(async (client) => {
    const exam = await requireOwnedExam(
      examId,
      lecturerId,
      client,
      { lock: true },
    );
    requireDraft(exam);

    const questionId = await createQuestionRecord({
      examId,
      ...questionState,
    }, client);

    if (questionType === 'multiple_choice') {
      await replaceQuestionOptions(questionId, questionState.options, client);
    }

    return findQuestionById(examId, questionId, client);
  });
}

export async function editQuestion(
  examIdValue,
  questionIdValue,
  payload,
  lecturerId,
) {
  const examId = parseRouteId(examIdValue, 'Exam ID');
  const questionId = parseRouteId(questionIdValue, 'Question ID');
  validateQuestionPayload(payload);

  if (Object.keys(payload).length === 0) {
    throw new HttpError(400, 'At least one editable question field is required.');
  }

  return withQuestionTransaction(async (client) => {
    const exam = await requireOwnedExam(
      examId,
      lecturerId,
      client,
      { lock: true },
    );
    requireDraft(exam);

    const currentQuestion = await requireQuestion(
      examId,
      questionId,
      client,
      { lock: true },
    );
    const questionType = hasOwn(payload, 'question_type')
      ? validateQuestionType(payload.question_type)
      : currentQuestion.question_type;
    const questionState = {
      questionType,
      prompt: hasOwn(payload, 'prompt')
        ? validatePrompt(payload.prompt)
        : currentQuestion.prompt,
      points: hasOwn(payload, 'points')
        ? validatePoints(payload.points)
        : currentQuestion.points,
      ...buildTypeState(payload, questionType, currentQuestion),
    };
    const replaceOptions = currentQuestion.question_type !== questionType
      || (questionType === 'multiple_choice' && hasOwn(payload, 'options'));

    await updateQuestionRecord(questionId, questionState, client);

    if (replaceOptions) {
      await replaceQuestionOptions(
        questionId,
        questionType === 'multiple_choice' ? questionState.options : [],
        client,
      );
    }

    return findQuestionById(examId, questionId, client);
  });
}

export async function removeQuestion(examIdValue, questionIdValue, lecturerId) {
  const examId = parseRouteId(examIdValue, 'Exam ID');
  const questionId = parseRouteId(questionIdValue, 'Question ID');

  return withQuestionTransaction(async (client) => {
    const exam = await requireOwnedExam(
      examId,
      lecturerId,
      client,
      { lock: true },
    );
    requireDraft(exam);

    const question = await requireQuestion(
      examId,
      questionId,
      client,
      { lock: true },
    );
    await deleteQuestionAndCompact(
      examId,
      questionId,
      question.position,
      client,
    );
  });
}

export async function reorderQuestions(examIdValue, payload, lecturerId) {
  const examId = parseRouteId(examIdValue, 'Exam ID');

  if (!isObject(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const unsupportedField = Object.keys(payload).find((field) => field !== 'question_ids');

  if (unsupportedField) {
    throw new HttpError(400, `Unsupported reorder field: ${unsupportedField}.`);
  }

  if (!Array.isArray(payload.question_ids)) {
    throw new HttpError(400, 'question_ids must be an array.');
  }

  const questionIds = payload.question_ids.map((id) => {
    if (!Number.isSafeInteger(id) || id < 1 || id > MAX_INTEGER) {
      throw new HttpError(400, 'Every question ID must be a positive integer.');
    }

    return id;
  });

  if (new Set(questionIds).size !== questionIds.length) {
    throw new HttpError(400, 'question_ids must not contain duplicates.');
  }

  return withQuestionTransaction(async (client) => {
    const exam = await requireOwnedExam(
      examId,
      lecturerId,
      client,
      { lock: true },
    );
    requireDraft(exam);

    const currentIds = await findQuestionIdsByExamId(examId, client);

    if (
      currentIds.length !== questionIds.length
      || questionIds.some((id) => !currentIds.includes(id))
    ) {
      throw new HttpError(
        400,
        'question_ids must contain exactly all questions in this exam.',
      );
    }

    await reorderQuestionRecords(examId, questionIds, client);
    return findQuestionsByExamId(examId, client);
  });
}
