import { HttpError } from '../middleware/errorHandler.js';
import {
  findPublishedExamForStudent,
  findPublishedExamsForStudent,
  findSafePublishedQuestions,
} from '../repositories/studentExamRepository.js';

const parseExamId = (value) => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, 'Exam ID must be a positive integer.');
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id)) {
    throw new HttpError(400, 'Exam ID must be a positive integer.');
  }

  return id;
};

export function listStudentExams(studentId) {
  return findPublishedExamsForStudent(studentId);
}

export async function getStudentExam(idValue, studentId) {
  const examId = parseExamId(idValue);
  const exam = await findPublishedExamForStudent(examId, studentId);

  if (!exam) {
    throw new HttpError(404, 'Exam not found.');
  }

  const questions = await findSafePublishedQuestions(examId);

  return {
    ...exam,
    questions,
  };
}
