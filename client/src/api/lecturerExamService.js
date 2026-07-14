import { apiRequest } from './apiClient';
import {
  requirePayload,
  requirePositiveId,
  validateExam,
  validateList,
} from './authoringValidation';

export const listLecturerExams = async () => validateList(
  await apiRequest('/exams', { auth: true }),
  validateExam,
  'exam list',
);

export const createLecturerExam = async (payload) => validateExam(
  await apiRequest('/exams', {
    method: 'POST',
    auth: true,
    body: requirePayload(payload),
  }),
);

export const getLecturerExam = async (examId) => validateExam(
  await apiRequest(`/exams/${requirePositiveId(examId, 'Exam ID')}`, {
    auth: true,
  }),
);

export const updateLecturerExam = async (examId, payload) => validateExam(
  await apiRequest(`/exams/${requirePositiveId(examId, 'Exam ID')}`, {
    method: 'PATCH',
    auth: true,
    body: requirePayload(payload),
  }),
);

export const deleteLecturerExam = async (examId) => {
  await apiRequest(`/exams/${requirePositiveId(examId, 'Exam ID')}`, {
    method: 'DELETE',
    auth: true,
  });
};
