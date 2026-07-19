import {
  addLecturerExam,
  editLecturerExam,
  getLecturerExam,
  listLecturerExams,
  publishLecturerExam as publishExam,
  removeLecturerExam,
} from '../services/lecturerExamService.js';

export async function getLecturerExams(request, response, next) {
  try {
    return response.json(await listLecturerExams(request.user.id));
  } catch (error) {
    return next(error);
  }
}

export async function createLecturerExam(request, response, next) {
  try {
    const exam = await addLecturerExam(request.body, request.user.id);
    return response.status(201).json(exam);
  } catch (error) {
    return next(error);
  }
}

export async function getLecturerExamById(request, response, next) {
  try {
    const exam = await getLecturerExam(request.params.id, request.user.id);
    return response.json(exam);
  } catch (error) {
    return next(error);
  }
}

export async function patchLecturerExam(request, response, next) {
  try {
    const exam = await editLecturerExam(
      request.params.id,
      request.body,
      request.user.id,
    );
    return response.json(exam);
  } catch (error) {
    return next(error);
  }
}

export async function publishLecturerExam(request, response, next) {
  try {
    const exam = await publishExam(
      request.params.id,
      request.body,
      request.user.id,
    );
    return response.json(exam);
  } catch (error) {
    return next(error);
  }
}

export async function destroyLecturerExam(request, response, next) {
  try {
    await removeLecturerExam(request.params.id, request.user.id);
    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
}
