import { HttpError } from '../middleware/errorHandler.js';
import {
  findPublishedExamForSubmission,
  findSubmissionQuestions,
  insertExamSubmission,
  insertSubmissionAnswers,
  withStudentSubmissionTransaction,
} from '../repositories/studentSubmissionRepository.js';

const supportedSubmissionFields = new Set(['answers']);
const supportedAnswerFields = new Set([
  'question_id',
  'selected_option_id',
  'boolean_answer',
  'text_answer',
]);

const parseExamId = (value) => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, 'Exam ID must be a positive integer.');
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id)) {
    throw new HttpError(400, 'Exam ID must be a positive integer.');
  }

  return id;
};

const isPlainJsonObject = (value) => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isPositiveSafeInteger = (value) => (
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
);

const validateTopLevelPayload = (payload) => {
  if (!isPlainJsonObject(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  for (const field of Object.keys(payload)) {
    if (!supportedSubmissionFields.has(field)) {
      throw new HttpError(400, `Unsupported submission field: ${field}.`);
    }
  }

  if (!Array.isArray(payload.answers)) {
    throw new HttpError(400, 'Submission answers must be an array.');
  }
};

const normalizeSelectedOptionId = (answer) => {
  const value = answer.selected_option_id;

  if (value === undefined || value === null) {
    return null;
  }

  if (!isPositiveSafeInteger(value)) {
    throw new HttpError(
      400,
      'Selected option ID must be a positive integer or null.',
    );
  }

  return value;
};

const normalizeBooleanAnswer = (answer) => {
  const value = answer.boolean_answer;

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'Boolean answer must be true, false, or null.');
  }

  return value;
};

const normalizeTextAnswer = (answer) => {
  const value = answer.text_answer;

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, 'Text answer must be a string or null.');
  }

  return value.trim() || null;
};

const normalizeAnswer = (answer) => {
  if (!isPlainJsonObject(answer)) {
    throw new HttpError(400, 'Each submission answer must be a JSON object.');
  }

  for (const field of Object.keys(answer)) {
    if (!supportedAnswerFields.has(field)) {
      throw new HttpError(400, `Unsupported answer field: ${field}.`);
    }
  }

  if (!isPositiveSafeInteger(answer.question_id)) {
    throw new HttpError(400, 'Question ID must be a positive integer.');
  }

  const normalized = {
    questionId: answer.question_id,
    selectedOptionId: normalizeSelectedOptionId(answer),
    booleanAnswer: normalizeBooleanAnswer(answer),
    textAnswer: normalizeTextAnswer(answer),
  };
  const answerValueCount = [
    normalized.selectedOptionId,
    normalized.booleanAnswer,
    normalized.textAnswer,
  ].filter((value) => value !== null).length;

  if (answerValueCount > 1) {
    throw new HttpError(400, 'Each question may contain at most one answer value.');
  }

  return normalized;
};

const normalizePayload = (payload) => {
  validateTopLevelPayload(payload);
  return payload.answers.map(normalizeAnswer);
};

const orderAnswersByExamQuestions = (answers, questions) => {
  const answersByQuestionId = new Map(
    answers.map((answer) => [answer.questionId, answer]),
  );
  const hasExactCoverage = answers.length === questions.length
    && answersByQuestionId.size === answers.length
    && questions.every((question) => answersByQuestionId.has(question.id));

  if (!hasExactCoverage) {
    throw new HttpError(
      400,
      'Submission answers must contain every exam question exactly once.',
    );
  }

  return questions.map((question) => ({
    question,
    answer: answersByQuestionId.get(question.id),
  }));
};

const validateAnswerForQuestionType = ({ question, answer }) => {
  if (
    question.type === 'multiple_choice'
    && (answer.booleanAnswer !== null || answer.textAnswer !== null)
  ) {
    throw new HttpError(
      400,
      'Multiple-choice answers must use selected_option_id.',
    );
  }

  if (
    question.type === 'true_false'
    && (answer.selectedOptionId !== null || answer.textAnswer !== null)
  ) {
    throw new HttpError(400, 'True/false answers must use boolean_answer.');
  }

  if (
    question.type === 'short_answer'
    && (answer.selectedOptionId !== null || answer.booleanAnswer !== null)
  ) {
    throw new HttpError(400, 'Short answers must use text_answer.');
  }

  if (!['multiple_choice', 'true_false', 'short_answer'].includes(question.type)) {
    throw new Error('Unsupported submission question type.');
  }
};

const translateConstraintError = (error) => {
  if (
    error?.code === '23505'
    && error?.constraint === 'exam_submissions_exam_student_unique'
  ) {
    return new HttpError(409, 'Exam has already been submitted.');
  }

  if (
    error?.code === '23503'
    && error?.constraint === 'submission_answers_option_question_fkey'
  ) {
    return new HttpError(
      400,
      'Selected option does not belong to the question.',
    );
  }

  return error;
};

export async function submitStudentExam(idValue, payload, studentId) {
  const examId = parseExamId(idValue);
  const normalizedAnswers = normalizePayload(payload);

  try {
    return await withStudentSubmissionTransaction(async (executor) => {
      const exam = await findPublishedExamForSubmission(examId, executor);

      if (!exam) {
        throw new HttpError(404, 'Exam not found.');
      }

      const questions = await findSubmissionQuestions(examId, executor);
      const orderedAnswers = orderAnswersByExamQuestions(
        normalizedAnswers,
        questions,
      );

      for (const answerWithQuestion of orderedAnswers) {
        validateAnswerForQuestionType(answerWithQuestion);
      }

      const submission = await insertExamSubmission(
        examId,
        studentId,
        executor,
      );
      const answerCount = await insertSubmissionAnswers(
        submission.id,
        examId,
        orderedAnswers.map(({ answer }) => answer),
        executor,
      );

      if (answerCount !== questions.length) {
        throw new Error('Submission answer row count did not match the exam.');
      }

      return {
        id: submission.id,
        exam_id: submission.exam_id,
        submitted_at: submission.submitted_at,
        answer_count: answerCount,
      };
    });
  } catch (error) {
    throw translateConstraintError(error);
  }
}
