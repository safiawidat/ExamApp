import { ApiError, apiRequest } from './apiClient';
import {
  requirePayload,
  requirePositiveId,
} from './authoringValidation';

const noticePlacements = new Set(['above', 'below']);

const invalidNoticeResponse = () => new ApiError(
  500,
  'The server returned an invalid question-notice response.',
);

const isObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value);

const isPositiveId = (value) => Number.isSafeInteger(value) && value > 0;

const isNonblankString = (value) => typeof value === 'string'
  && value.trim() !== '';

const validateQuestionNotice = (value) => {
  if (
    !isObject(value)
    || !isPositiveId(value.question_id)
    || !isPositiveId(value.exam_id)
    || !isNonblankString(value.message)
    || [...value.message].length > 1000
    || !noticePlacements.has(value.placement)
    || !isNonblankString(value.created_at)
    || !isNonblankString(value.updated_at)
  ) {
    throw invalidNoticeResponse();
  }

  return {
    question_id: value.question_id,
    exam_id: value.exam_id,
    message: value.message,
    placement: value.placement,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
};

const noticePath = (examId, questionId) => (
  `/exams/${requirePositiveId(examId, 'Exam ID')}`
  + `/questions/${requirePositiveId(questionId, 'Question ID')}/notice`
);

export const getQuestionNotice = async (examId, questionId) => (
  validateQuestionNotice(await apiRequest(noticePath(examId, questionId), {
    auth: true,
  }))
);

export const saveQuestionNotice = async (examId, questionId, payload) => (
  validateQuestionNotice(await apiRequest(noticePath(examId, questionId), {
    method: 'PUT',
    auth: true,
    body: requirePayload(payload),
  }))
);

export const deleteQuestionNotice = async (examId, questionId) => {
  await apiRequest(noticePath(examId, questionId), {
    method: 'DELETE',
    auth: true,
  });
};
