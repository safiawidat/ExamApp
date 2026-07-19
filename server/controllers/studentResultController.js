import { getStudentResult } from '../services/studentResultService.js';

export async function getStudentExamResult(request, response, next) {
  try {
    const result = await getStudentResult(
      request.params.examId,
      request.user.id,
    );
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
