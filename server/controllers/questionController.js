import {
  addQuestion,
  editQuestion,
  listQuestions,
  removeQuestion,
  reorderQuestions,
} from '../services/questionService.js';

export async function getQuestions(request, response, next) {
  try {
    return response.json(await listQuestions(request.params.examId, request.user.id));
  } catch (error) {
    return next(error);
  }
}

export async function createQuestion(request, response, next) {
  try {
    const question = await addQuestion(
      request.params.examId,
      request.body,
      request.user.id,
    );
    return response.status(201).json(question);
  } catch (error) {
    return next(error);
  }
}

export async function patchQuestion(request, response, next) {
  try {
    const question = await editQuestion(
      request.params.examId,
      request.params.questionId,
      request.body,
      request.user.id,
    );
    return response.json(question);
  } catch (error) {
    return next(error);
  }
}

export async function destroyQuestion(request, response, next) {
  try {
    await removeQuestion(
      request.params.examId,
      request.params.questionId,
      request.user.id,
    );
    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
}

export async function putQuestionOrder(request, response, next) {
  try {
    const questions = await reorderQuestions(
      request.params.examId,
      request.body,
      request.user.id,
    );
    return response.json(questions);
  } catch (error) {
    return next(error);
  }
}
