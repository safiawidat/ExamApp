import { apiRequest } from './apiClient';
import {
  requireLecturerGradingPositiveId,
  validateGradingSnapshot,
  validateLecturerGradingAction,
  validateLecturerResultPublication,
  validateLecturerSubmissionDetail,
  validateLecturerSubmissionList,
} from './lecturerGradingValidation';

const submissionPath = (examId, submissionId) => {
  const validExamId = requireLecturerGradingPositiveId(examId, 'Exam ID');
  const validSubmissionId = requireLecturerGradingPositiveId(submissionId, 'Submission ID');
  return `/exams/${validExamId}/submissions/${validSubmissionId}`;
};

export const listLecturerSubmissions = async (examId) => validateLecturerSubmissionList(
  await apiRequest(
    `/exams/${requireLecturerGradingPositiveId(examId, 'Exam ID')}/submissions`,
    { auth: true },
  ),
);

export const getLecturerSubmission = async (examId, submissionId) => (
  validateLecturerSubmissionDetail(
    await apiRequest(submissionPath(examId, submissionId), { auth: true }),
  )
);

export const saveLecturerSubmissionGrading = async (
  examId,
  submissionId,
  snapshot,
) => validateLecturerSubmissionDetail(
  await apiRequest(`${submissionPath(examId, submissionId)}/grading`, {
    method: 'PUT',
    auth: true,
    body: validateGradingSnapshot(snapshot),
  }),
);

export const completeLecturerSubmissionGrading = async (examId, submissionId) => (
  validateLecturerGradingAction(
    await apiRequest(`${submissionPath(examId, submissionId)}/grading/complete`, {
      method: 'POST',
      auth: true,
    }),
    'completed',
  )
);

export const reopenLecturerSubmissionGrading = async (examId, submissionId) => (
  validateLecturerGradingAction(
    await apiRequest(`${submissionPath(examId, submissionId)}/grading/reopen`, {
      method: 'POST',
      auth: true,
    }),
    'in_progress',
  )
);

export const publishLecturerSubmissionResult = async (examId, submissionId) => (
  validateLecturerResultPublication(
    await apiRequest(`${submissionPath(examId, submissionId)}/result/publish`, {
      method: 'POST',
      auth: true,
    }),
  )
);
