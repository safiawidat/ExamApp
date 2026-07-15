import {
  addExamType,
  editExamType,
  listExamTypes,
  removeExamType,
} from '../services/examTypeService.js';

export async function getExamTypes(request, response, next) {
  try {
    return response.json(await listExamTypes());
  } catch (error) {
    return next(error);
  }
}

export async function createExamType(request, response, next) {
  try {
    const examType = await addExamType(request.body, request.user.id);
    return response.status(201).json(examType);
  } catch (error) {
    return next(error);
  }
}

export async function patchExamType(request, response, next) {
  try {
    const examType = await editExamType(
      request.params.id,
      request.body,
      request.user.id,
    );
    return response.json(examType);
  } catch (error) {
    return next(error);
  }
}

export async function destroyExamType(request, response, next) {
  try {
    await removeExamType(request.params.id, request.user.id);
    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
}
