import { HttpError } from '../middleware/errorHandler.js';
import {
  completeSubmissionGrading,
  findOwnedExamForSubmissionReview,
  findSubmissionForReview,
  findSubmissionQuestionsForGrading,
  findSubmissionsForOwnedExam,
  markSubmissionGradingInProgress,
  publishSubmissionResult,
  reopenSubmissionGrading,
  updateSubmissionAnswerGrades,
  withLecturerGradingTransaction,
} from '../repositories/lecturerSubmissionRepository.js';
import {
  calculateGradePercentage,
  calculateGradeTotals,
  gradeMultipleChoiceAnswer,
  gradeTrueFalseAnswer,
  validateShortAnswerMark,
} from './gradingCalculator.js';

const MAX_INTEGER = 2147483647;
const MAX_FEEDBACK_LENGTH = 5000;
const snapshotFields = new Set(['answers']);
const gradingAnswerFields = new Set([
  'questionId',
  'awardedPoints',
  'feedback',
]);
const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

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

const requireOwnedExam = async (examId, lecturerId, executor) => {
  const exam = await findOwnedExamForSubmissionReview(
    examId,
    lecturerId,
    executor,
  );

  if (!exam) {
    throw new HttpError(404, 'Exam not found.');
  }

  return exam;
};

const requireSubmission = async (
  examId,
  submissionId,
  executor,
  { lock = false } = {},
) => {
  const submission = await findSubmissionForReview(
    examId,
    submissionId,
    executor,
    { lock },
  );

  if (!submission) {
    throw new HttpError(404, 'Submission not found.');
  }

  return submission;
};

const requireCompleteSubmissionAnswers = (questions) => {
  if (questions.length === 0 || questions.some((question) => !question.answerExists)) {
    throw new Error('Submission answers do not match the stored exam questions.');
  }
};

const automaticMark = (question) => {
  if (question.type === 'multiple_choice') {
    return gradeMultipleChoiceAnswer(
      question.selectedOptionId,
      question.options,
    );
  }

  if (question.type === 'true_false') {
    return gradeTrueFalseAnswer(
      question.booleanAnswer,
      question.correctAnswer,
    );
  }

  throw new Error('Automatic grading received an unsupported question type.');
};

const percentageFor = (totalScore, maximumScore) => (
  totalScore === null
    ? null
    : calculateGradePercentage(totalScore, maximumScore)
);

const mapSubmissionSummary = (submission) => ({
  id: submission.id,
  exam_id: submission.examId,
  student_id: submission.studentId,
  student_username: submission.studentUsername,
  submitted_at: submission.submittedAt,
  grading_state: submission.gradingState,
  total_score: submission.totalScore,
  maximum_score: submission.maximumScore,
  percentage: percentageFor(submission.totalScore, submission.maximumScore),
  graded_by: submission.gradedBy,
  grading_lecturer_username: submission.gradingLecturerUsername,
  grading_completed_at: submission.gradingCompletedAt,
  result_published_at: submission.resultPublishedAt,
});

const mapQuestionDetail = (question) => {
  const isUnanswered = question.type === 'multiple_choice'
    ? question.selectedOptionId === null
    : question.type === 'true_false'
      ? question.booleanAnswer === null
      : question.textAnswer === null;
  const detail = {
    id: question.id,
    question_type: question.type,
    prompt: question.prompt,
    position: question.position,
    grading_mode: question.type === 'short_answer' ? 'manual' : 'automatic',
    is_unanswered: isUnanswered,
    awarded_points: question.type === 'short_answer'
      ? (isUnanswered ? 0 : question.awardedPoints)
      : automaticMark(question),
    feedback: question.feedback,
  };

  if (question.type === 'multiple_choice') {
    const correctOption = question.options.find((option) => option.isCorrect);
    return {
      ...detail,
      submitted_answer: {
        selected_option_id: question.selectedOptionId,
      },
      selected_option_id: question.selectedOptionId,
      correct_option_id: correctOption?.id ?? null,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
        position: option.position,
        is_correct: option.isCorrect,
      })),
    };
  }

  if (question.type === 'true_false') {
    return {
      ...detail,
      submitted_answer: {
        boolean_answer: question.booleanAnswer,
      },
      boolean_answer: question.booleanAnswer,
      correct_answer: question.correctAnswer === 'true',
    };
  }

  return {
    ...detail,
    submitted_answer: {
      text_answer: question.textAnswer,
    },
    text_answer: question.textAnswer,
    reference_answer: question.correctAnswer,
  };
};

const mapSubmissionDetail = (submission, questions) => ({
  ...mapSubmissionSummary(submission),
  student: {
    id: submission.studentId,
    username: submission.studentUsername,
  },
  questions: questions.map(mapQuestionDetail),
});

const normalizeFeedback = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, 'Feedback must be a string or null.');
  }

  const feedback = value.trim();

  if (feedback.length > MAX_FEEDBACK_LENGTH) {
    throw new HttpError(
      400,
      `Feedback must be at most ${MAX_FEEDBACK_LENGTH} characters.`,
    );
  }

  return feedback || null;
};

const normalizeAwardedPoints = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  try {
    return validateShortAnswerMark(value);
  } catch {
    throw new HttpError(400, 'Awarded points must be a number between 0 and 1.');
  }
};

const normalizeGradingSnapshot = (payload) => {
  if (!isPlainObject(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const unsupportedField = Object.keys(payload).find(
    (field) => !snapshotFields.has(field),
  );

  if (unsupportedField) {
    throw new HttpError(400, `Unsupported grading field: ${unsupportedField}.`);
  }

  if (!Array.isArray(payload.answers)) {
    throw new HttpError(400, 'Grading answers must be an array.');
  }

  return payload.answers.map((answer) => {
    if (!isPlainObject(answer)) {
      throw new HttpError(400, 'Each grading answer must be a JSON object.');
    }

    const unsupportedAnswerField = Object.keys(answer).find(
      (field) => !gradingAnswerFields.has(field),
    );

    if (unsupportedAnswerField) {
      throw new HttpError(
        400,
        `Unsupported grading answer field: ${unsupportedAnswerField}.`,
      );
    }

    if (
      !Number.isSafeInteger(answer.questionId)
      || answer.questionId < 1
      || answer.questionId > MAX_INTEGER
    ) {
      throw new HttpError(400, 'Question ID must be a positive integer.');
    }

    return {
      questionId: answer.questionId,
      awardedPoints: normalizeAwardedPoints(answer.awardedPoints),
      feedback: normalizeFeedback(answer.feedback),
    };
  });
};

const orderSnapshotAnswers = (answers, questions) => {
  const answersByQuestionId = new Map(
    answers.map((answer) => [answer.questionId, answer]),
  );

  if (answersByQuestionId.size !== answers.length) {
    throw new HttpError(400, 'Grading answers must not contain duplicate questions.');
  }

  if (
    answers.length !== questions.length
    || questions.some((question) => !answersByQuestionId.has(question.id))
  ) {
    throw new HttpError(
      400,
      'Grading answers must contain every submission question exactly once.',
    );
  }

  return questions.map((question) => ({
    question,
    grading: answersByQuestionId.get(question.id),
  }));
};

const gradingAnswerForDraft = ({ question, grading }) => {
  if (question.type !== 'short_answer') {
    if (grading.awardedPoints !== null) {
      throw new HttpError(
        400,
        'Awarded points for objective questions are calculated by the server.',
      );
    }

    return {
      questionId: question.id,
      awardedPoints: automaticMark(question),
      feedback: grading.feedback,
    };
  }

  if (question.textAnswer === null) {
    if (grading.awardedPoints !== null && grading.awardedPoints !== 0) {
      throw new HttpError(
        400,
        'An unanswered short-answer question may only receive 0 points.',
      );
    }

    return {
      questionId: question.id,
      awardedPoints: 0,
      feedback: grading.feedback,
    };
  }

  return {
    questionId: question.id,
    awardedPoints: grading.awardedPoints,
    feedback: grading.feedback,
  };
};

const validateBodylessAction = (payload, action) => {
  if (payload === undefined) {
    return;
  }

  if (!isPlainObject(payload) || Object.keys(payload).length > 0) {
    throw new HttpError(400, `${action} does not accept client-controlled fields.`);
  }
};

const completedGradingAnswer = (question) => {
  if (question.type !== 'short_answer') {
    return {
      questionId: question.id,
      awardedPoints: automaticMark(question),
      feedback: question.feedback,
    };
  }

  if (question.textAnswer === null) {
    return {
      questionId: question.id,
      awardedPoints: 0,
      feedback: question.feedback,
    };
  }

  if (question.awardedPoints === null) {
    throw new HttpError(
      409,
      'Every answered short-answer question must be graded before completion.',
    );
  }

  try {
    validateShortAnswerMark(question.awardedPoints);
  } catch {
    throw new Error('Stored short-answer mark is invalid.');
  }

  return {
    questionId: question.id,
    awardedPoints: question.awardedPoints,
    feedback: question.feedback,
  };
};

export async function listLecturerSubmissions(examIdValue, lecturerId) {
  const examId = parseRouteId(examIdValue, 'Exam ID');
  await requireOwnedExam(examId, lecturerId);
  const submissions = await findSubmissionsForOwnedExam(examId);
  return submissions.map(mapSubmissionSummary);
}

export async function getLecturerSubmission(
  examIdValue,
  submissionIdValue,
  lecturerId,
) {
  const examId = parseRouteId(examIdValue, 'Exam ID');
  const submissionId = parseRouteId(submissionIdValue, 'Submission ID');
  await requireOwnedExam(examId, lecturerId);
  const submission = await requireSubmission(examId, submissionId);
  const questions = await findSubmissionQuestionsForGrading(examId, submissionId);
  requireCompleteSubmissionAnswers(questions);
  return mapSubmissionDetail(submission, questions);
}

export async function saveLecturerSubmissionGrading(
  examIdValue,
  submissionIdValue,
  payload,
  lecturerId,
) {
  const examId = parseRouteId(examIdValue, 'Exam ID');
  const submissionId = parseRouteId(submissionIdValue, 'Submission ID');
  const normalizedAnswers = normalizeGradingSnapshot(payload);

  return withLecturerGradingTransaction(async (client) => {
    await requireOwnedExam(examId, lecturerId, client);
    const submission = await requireSubmission(
      examId,
      submissionId,
      client,
      { lock: true },
    );

    if (submission.gradingState === 'completed') {
      throw new HttpError(
        409,
        'Completed grading must be reopened before it can be edited.',
      );
    }

    if (!['ungraded', 'in_progress'].includes(submission.gradingState)) {
      throw new HttpError(409, 'Submission grading cannot be edited in its current state.');
    }

    const questions = await findSubmissionQuestionsForGrading(
      examId,
      submissionId,
      client,
    );
    requireCompleteSubmissionAnswers(questions);
    const gradingAnswers = orderSnapshotAnswers(normalizedAnswers, questions)
      .map(gradingAnswerForDraft);

    await updateSubmissionAnswerGrades(submissionId, gradingAnswers, client);
    await markSubmissionGradingInProgress(submissionId, client);

    const updatedSubmission = await requireSubmission(
      examId,
      submissionId,
      client,
    );
    const updatedQuestions = await findSubmissionQuestionsForGrading(
      examId,
      submissionId,
      client,
    );
    return mapSubmissionDetail(updatedSubmission, updatedQuestions);
  });
}

export async function completeLecturerSubmissionGrading(
  examIdValue,
  submissionIdValue,
  payload,
  lecturerId,
) {
  const examId = parseRouteId(examIdValue, 'Exam ID');
  const submissionId = parseRouteId(submissionIdValue, 'Submission ID');
  validateBodylessAction(payload, 'Grading completion');

  return withLecturerGradingTransaction(async (client) => {
    await requireOwnedExam(examId, lecturerId, client);
    const submission = await requireSubmission(
      examId,
      submissionId,
      client,
      { lock: true },
    );

    if (submission.gradingState === 'completed') {
      throw new HttpError(409, 'Submission grading is already completed.');
    }

    if (!['ungraded', 'in_progress'].includes(submission.gradingState)) {
      throw new HttpError(409, 'Submission grading cannot be completed.');
    }

    const questions = await findSubmissionQuestionsForGrading(
      examId,
      submissionId,
      client,
    );
    requireCompleteSubmissionAnswers(questions);
    const gradingAnswers = questions.map(completedGradingAnswer);
    const totals = calculateGradeTotals({
      awardedMarks: gradingAnswers.map((answer) => answer.awardedPoints),
      questionCount: questions.length,
    });

    if (totals.maximumPoints !== submission.maximumScore) {
      throw new Error('Submission maximum score did not match its question count.');
    }

    await updateSubmissionAnswerGrades(submissionId, gradingAnswers, client);
    const completion = await completeSubmissionGrading(
      submissionId,
      lecturerId,
      totals.totalAwardedPoints,
      client,
    );

    return {
      id: submission.id,
      exam_id: submission.examId,
      grading_state: 'completed',
      total_score: totals.totalAwardedPoints,
      maximum_score: totals.maximumPoints,
      percentage: totals.percentage,
      graded_by: lecturerId,
      grading_completed_at: completion.grading_completed_at,
      result_published_at: null,
    };
  });
}

export async function reopenLecturerSubmissionGrading(
  examIdValue,
  submissionIdValue,
  payload,
  lecturerId,
) {
  const examId = parseRouteId(examIdValue, 'Exam ID');
  const submissionId = parseRouteId(submissionIdValue, 'Submission ID');
  validateBodylessAction(payload, 'Grading reopening');

  return withLecturerGradingTransaction(async (client) => {
    await requireOwnedExam(examId, lecturerId, client);
    const submission = await requireSubmission(
      examId,
      submissionId,
      client,
      { lock: true },
    );

    if (submission.resultPublishedAt !== null) {
      throw new HttpError(409, 'Published grading cannot be reopened.');
    }

    if (submission.gradingState !== 'completed') {
      throw new HttpError(409, 'Only completed grading can be reopened.');
    }

    await reopenSubmissionGrading(submissionId, client);

    return {
      id: submission.id,
      exam_id: submission.examId,
      grading_state: 'in_progress',
      total_score: null,
      maximum_score: submission.maximumScore,
      percentage: null,
      graded_by: null,
      grading_completed_at: null,
      result_published_at: null,
    };
  });
}

export async function publishLecturerSubmissionResult(
  examIdValue,
  submissionIdValue,
  payload,
  lecturerId,
) {
  const examId = parseRouteId(examIdValue, 'Exam ID');
  const submissionId = parseRouteId(submissionIdValue, 'Submission ID');
  validateBodylessAction(payload, 'Result publication');

  return withLecturerGradingTransaction(async (client) => {
    await requireOwnedExam(examId, lecturerId, client);
    const submission = await requireSubmission(
      examId,
      submissionId,
      client,
      { lock: true },
    );

    if (submission.resultPublishedAt !== null) {
      throw new HttpError(409, 'Submission result is already published.');
    }

    if (submission.gradingState === 'ungraded') {
      throw new HttpError(409, 'Ungraded submission results cannot be published.');
    }

    if (submission.gradingState === 'in_progress') {
      throw new HttpError(409, 'In-progress submission results cannot be published.');
    }

    if (
      submission.gradingState !== 'completed'
      || submission.totalScore === null
      || submission.gradedBy === null
      || submission.gradingCompletedAt === null
    ) {
      throw new HttpError(409, 'Only fully completed grading can be published.');
    }

    const publication = await publishSubmissionResult(submissionId, client);

    if (!publication) {
      throw new HttpError(409, 'Submission result is already published.');
    }

    return {
      id: submission.id,
      exam_id: submission.examId,
      grading_state: submission.gradingState,
      total_score: submission.totalScore,
      maximum_score: submission.maximumScore,
      percentage: percentageFor(submission.totalScore, submission.maximumScore),
      graded_by: submission.gradedBy,
      grading_completed_at: submission.gradingCompletedAt,
      result_published_at: publication.result_published_at,
    };
  });
}
