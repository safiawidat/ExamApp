import {
  getStudentExam,
  listStudentExams,
} from '../services/studentExamService.js';

export async function getStudentExams(request, response, next) {
  try {
    const exams = await listStudentExams(request.user.id);
    return response.status(200).json(exams);
  } catch (error) {
    return next(error);
  }
}

export async function getStudentExamById(request, response, next) {
  try {
    const exam = await getStudentExam(request.params.id, request.user.id);
    return response.status(200).json(exam);
  } catch (error) {
    return next(error);
  }
}
