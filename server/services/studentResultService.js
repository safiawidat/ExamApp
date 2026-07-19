import { HttpError } from '../middleware/errorHandler.js';
import {
  findPublishedResultForStudent,
  findPublishedResultQuestions,
} from '../repositories/studentResultRepository.js';
import {
  calculateGradePercentage,
  calculateGradeTotals,
  gradeMultipleChoiceAnswer,
  gradeTrueFalseAnswer,
  validateShortAnswerMark,
} from './gradingCalculator.js';

const MAX_INTEGER = 2147483647;

const parseExamId = (value) => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, 'Exam ID must be a positive integer.');
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id) || id > MAX_INTEGER) {
    throw new HttpError(400, 'Exam ID must be a positive integer.');
  }

  return id;
};

const requireConsistentQuestions = (questions, maximumScore) => {
  if (
    !Number.isSafeInteger(maximumScore)
    || maximumScore < 1
    || questions.length !== maximumScore
    || questions.some((question) => !question.answerExists)
  ) {
    throw new Error('Published result questions are inconsistent.');
  }
};

const commonQuestionResult = (question, isUnanswered) => {
  if (question.awardedPoints === null) {
    throw new Error('Published result contains an ungraded question.');
  }

  if (question.feedback !== null && typeof question.feedback !== 'string') {
    throw new Error('Published result contains invalid feedback.');
  }

  return {
    id: question.id,
    position: question.position,
    question_type: question.type,
    prompt: question.prompt,
    is_unanswered: isUnanswered,
    awarded_points: question.awardedPoints,
    maximum_points: 1,
    feedback: question.feedback,
  };
};

const mapMultipleChoiceResult = (question) => {
  const correctOptions = question.options.filter((option) => option.isCorrect);

  if (question.options.length < 2 || correctOptions.length !== 1) {
    throw new Error('Published multiple-choice result is inconsistent.');
  }

  const selectedOption = question.selectedOptionId === null
    ? null
    : question.options.find((option) => option.id === question.selectedOptionId);
  const expectedMark = gradeMultipleChoiceAnswer(
    question.selectedOptionId,
    question.options,
  );

  if (question.selectedOptionId !== null && !selectedOption) {
    throw new Error('Published multiple-choice selection is inconsistent.');
  }

  if (question.awardedPoints !== expectedMark) {
    throw new Error('Published multiple-choice mark is inconsistent.');
  }

  return {
    ...commonQuestionResult(question, question.selectedOptionId === null),
    selected_option_id: question.selectedOptionId,
    correct_option_id: correctOptions[0].id,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      position: option.position,
    })),
  };
};

const mapTrueFalseResult = (question) => {
  const expectedMark = gradeTrueFalseAnswer(
    question.booleanAnswer,
    question.correctAnswer,
  );

  if (question.awardedPoints !== expectedMark) {
    throw new Error('Published true/false mark is inconsistent.');
  }

  return {
    ...commonQuestionResult(question, question.booleanAnswer === null),
    boolean_answer: question.booleanAnswer,
    correct_answer: question.correctAnswer === 'true',
  };
};

const mapShortAnswerResult = (question) => {
  if (
    typeof question.correctAnswer !== 'string'
    || question.correctAnswer.trim() === ''
  ) {
    throw new Error('Published short-answer reference is inconsistent.');
  }

  validateShortAnswerMark(question.awardedPoints);
  const isUnanswered = question.textAnswer === null;

  if (isUnanswered && question.awardedPoints !== 0) {
    throw new Error('Published unanswered short-answer mark is inconsistent.');
  }

  return {
    ...commonQuestionResult(question, isUnanswered),
    text_answer: question.textAnswer,
    reference_answer: question.correctAnswer,
  };
};

const mapQuestionResult = (question) => {
  if (question.type === 'multiple_choice') {
    return mapMultipleChoiceResult(question);
  }

  if (question.type === 'true_false') {
    return mapTrueFalseResult(question);
  }

  if (question.type === 'short_answer') {
    return mapShortAnswerResult(question);
  }

  throw new Error('Published result contains an unsupported question type.');
};

export async function getStudentResult(idValue, studentId) {
  const examId = parseExamId(idValue);
  const result = await findPublishedResultForStudent(examId, studentId);

  if (!result) {
    throw new HttpError(404, 'Result not found.');
  }

  const storedQuestions = await findPublishedResultQuestions(
    examId,
    result.submissionId,
  );
  requireConsistentQuestions(storedQuestions, result.maximumScore);
  const questions = storedQuestions.map(mapQuestionResult);
  const totals = calculateGradeTotals({
    awardedMarks: questions.map((question) => question.awarded_points),
    questionCount: questions.length,
  });

  if (Math.abs(totals.totalAwardedPoints - result.totalScore) > 1e-9) {
    throw new Error('Published result total is inconsistent.');
  }

  return {
    exam_id: result.examId,
    exam_title: result.examTitle,
    submission_id: result.submissionId,
    submitted_at: result.submittedAt,
    result_published_at: result.resultPublishedAt,
    total_score: result.totalScore,
    maximum_score: result.maximumScore,
    percentage: calculateGradePercentage(
      result.totalScore,
      result.maximumScore,
    ),
    questions,
  };
}
