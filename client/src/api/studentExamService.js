import { apiRequest } from './apiClient';
import {
  requireStudentPositiveId,
  validateStudentAnswers,
  validateStudentExam,
  validateStudentExamList,
  validateStudentSubmission,
} from './studentExamValidation';

export const listStudentExams = async () => validateStudentExamList(
  await apiRequest('/student/exams', { auth: true }),
);

export const getStudentExam = async (examId) => {
  const validatedExamId = requireStudentPositiveId(examId, 'Exam ID');
  const response = await apiRequest(`/student/exams/${validatedExamId}`, {
    auth: true,
  });

  return validateStudentExam(response);
};

export const submitStudentExam = async (examId, answers) => {
  const validatedExamId = requireStudentPositiveId(examId, 'Exam ID');
  const validatedAnswers = validateStudentAnswers(answers);
  const response = await apiRequest(
    `/student/exams/${validatedExamId}/submissions`,
    {
      method: 'POST',
      auth: true,
      body: {
        answers: validatedAnswers,
      },
    },
  );

  return validateStudentSubmission(
    response,
    validatedExamId,
    validatedAnswers.length,
  );
};
