import { apiRequest } from './apiClient';
import {
  requirePayload,
  requirePositiveId,
  validateList,
  validateQuestion,
} from './authoringValidation';

export const listQuestions = async (examId) => validateList(
  await apiRequest(`/exams/${requirePositiveId(examId, 'Exam ID')}/questions`, {
    auth: true,
  }),
  validateQuestion,
  'question list',
);

export const createQuestion = async (examId, payload) => validateQuestion(
  await apiRequest(`/exams/${requirePositiveId(examId, 'Exam ID')}/questions`, {
    method: 'POST',
    auth: true,
    body: requirePayload(payload),
  }),
);

export const updateQuestion = async (examId, questionId, payload) => validateQuestion(
  await apiRequest(
    `/exams/${requirePositiveId(examId, 'Exam ID')}/questions/${requirePositiveId(questionId, 'Question ID')}`,
    {
      method: 'PATCH',
      auth: true,
      body: requirePayload(payload),
    },
  ),
);

export const deleteQuestion = async (examId, questionId) => {
  await apiRequest(
    `/exams/${requirePositiveId(examId, 'Exam ID')}/questions/${requirePositiveId(questionId, 'Question ID')}`,
    {
      method: 'DELETE',
      auth: true,
    },
  );
};

export const reorderQuestions = async (examId, questionIds) => {
  if (!Array.isArray(questionIds)) {
    throw new TypeError('Question IDs must be an array.');
  }

  const normalizedIds = questionIds.map((questionId) => (
    requirePositiveId(questionId, 'Question ID')
  ));

  return validateList(
    await apiRequest(
      `/exams/${requirePositiveId(examId, 'Exam ID')}/questions/reorder`,
      {
        method: 'PUT',
        auth: true,
        body: { question_ids: normalizedIds },
      },
    ),
    validateQuestion,
    'question list',
  );
};
