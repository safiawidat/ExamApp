import { HttpError } from '../middleware/errorHandler.js';
import {
  deleteQuestionNotice,
  findOwnedExamForQuestionNotice,
  findQuestionForNotice,
  findQuestionNotice,
  upsertQuestionNotice,
} from '../repositories/questionNoticeRepository.js';

const MAX_INTEGER = 2147483647;
const supportedFields = new Set(['message', 'placement']);

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

const isJsonObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const normalizeNoticePayload = (payload) => {
  if (!isJsonObject(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  for (const field of Object.keys(payload)) {
    if (!supportedFields.has(field)) {
      throw new HttpError(
        400,
        `Unsupported question notice field: ${field}.`,
      );
    }
  }

  if (typeof payload.message !== 'string' || !payload.message.trim()) {
    throw new HttpError(400, 'Notice message is required.');
  }

  const message = payload.message.trim();

  if ([...message].length > 1000) {
    throw new HttpError(400, 'Notice message must be at most 1000 characters.');
  }

  if (!['above', 'below'].includes(payload.placement)) {
    throw new HttpError(400, 'Notice placement must be above or below.');
  }

  return { message, placement: payload.placement };
};

const requirePublishedQuestion = async (examId, questionId, lecturerId) => {
  const exam = await findOwnedExamForQuestionNotice(examId, lecturerId);

  if (!exam) {
    throw new HttpError(404, 'Exam not found.');
  }

  if (exam.status !== 'published') {
    throw new HttpError(
      409,
      'Question notices are available only for published exams.',
    );
  }

  const question = await findQuestionForNotice(examId, questionId);

  if (!question) {
    throw new HttpError(404, 'Question not found.');
  }
};

const parseNoticeRouteIds = (examIdValue, questionIdValue) => ({
  examId: parseRouteId(examIdValue, 'Exam ID'),
  questionId: parseRouteId(questionIdValue, 'Question ID'),
});

export async function getLecturerQuestionNotice(
  examIdValue,
  questionIdValue,
  lecturerId,
) {
  const { examId, questionId } = parseNoticeRouteIds(
    examIdValue,
    questionIdValue,
  );
  await requirePublishedQuestion(examId, questionId, lecturerId);
  const notice = await findQuestionNotice(examId, questionId);

  if (!notice) {
    throw new HttpError(404, 'Question notice not found.');
  }

  return notice;
}

export async function putLecturerQuestionNotice(
  examIdValue,
  questionIdValue,
  payload,
  lecturerId,
) {
  const { examId, questionId } = parseNoticeRouteIds(
    examIdValue,
    questionIdValue,
  );
  const normalized = normalizeNoticePayload(payload);
  await requirePublishedQuestion(examId, questionId, lecturerId);

  return upsertQuestionNotice({
    examId,
    questionId,
    ...normalized,
  });
}

export async function removeLecturerQuestionNotice(
  examIdValue,
  questionIdValue,
  lecturerId,
) {
  const { examId, questionId } = parseNoticeRouteIds(
    examIdValue,
    questionIdValue,
  );
  await requirePublishedQuestion(examId, questionId, lecturerId);

  if (!(await deleteQuestionNotice(examId, questionId))) {
    throw new HttpError(404, 'Question notice not found.');
  }
}
