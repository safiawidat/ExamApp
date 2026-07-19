import { submitStudentExam } from '../services/studentSubmissionService.js';

export async function createStudentSubmission(request, response, next) {
  try {
    const submission = await submitStudentExam(
      request.params.id,
      request.body,
      request.user.id,
    );

    return response.status(201).json(submission);
  } catch (error) {
    return next(error);
  }
}
