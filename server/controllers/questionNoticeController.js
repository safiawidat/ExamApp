import {
  getLecturerQuestionNotice,
  putLecturerQuestionNotice,
  removeLecturerQuestionNotice,
} from '../services/questionNoticeService.js';

export async function getQuestionNotice(request, response, next) {
  try {
    const notice = await getLecturerQuestionNotice(
      request.params.examId,
      request.params.questionId,
      request.user.id,
      { allowMissing: request.query.allow_missing === 'true' },
    );

    if (!notice) {
      return response.status(204).send();
    }

    return response.status(200).json(notice);
  } catch (error) {
    return next(error);
  }
}

export async function putQuestionNotice(request, response, next) {
  try {
    const notice = await putLecturerQuestionNotice(
      request.params.examId,
      request.params.questionId,
      request.body,
      request.user.id,
    );

    return response.status(200).json(notice);
  } catch (error) {
    return next(error);
  }
}

export async function destroyQuestionNotice(request, response, next) {
  try {
    await removeLecturerQuestionNotice(
      request.params.examId,
      request.params.questionId,
      request.user.id,
    );

    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
}
