import { apiRequest } from './apiClient';
import {
  requirePayload,
  requirePositiveId,
  validateExamType,
  validateList,
} from './authoringValidation';

export const listExamTypes = async () => validateList(
  await apiRequest('/exam-types', { auth: true }),
  validateExamType,
  'exam type list',
);

export const createExamType = async (payload) => validateExamType(
  await apiRequest('/exam-types', {
    method: 'POST',
    auth: true,
    body: requirePayload(payload),
  }),
);

export const updateExamType = async (examTypeId, payload) => validateExamType(
  await apiRequest(`/exam-types/${requirePositiveId(examTypeId, 'Exam type ID')}`, {
    method: 'PATCH',
    auth: true,
    body: requirePayload(payload),
  }),
);

export const deleteExamType = async (examTypeId) => {
  await apiRequest(`/exam-types/${requirePositiveId(examTypeId, 'Exam type ID')}`, {
    method: 'DELETE',
    auth: true,
  });
};
