import {
  completeLecturerSubmissionGrading,
  getLecturerSubmission,
  listLecturerSubmissions,
  reopenLecturerSubmissionGrading,
  saveLecturerSubmissionGrading,
} from '../services/lecturerSubmissionService.js';

export async function getLecturerSubmissions(request, response, next) {
  try {
    return response.json(await listLecturerSubmissions(
      request.params.examId,
      request.user.id,
    ));
  } catch (error) {
    return next(error);
  }
}

export async function getLecturerSubmissionById(request, response, next) {
  try {
    return response.json(await getLecturerSubmission(
      request.params.examId,
      request.params.submissionId,
      request.user.id,
    ));
  } catch (error) {
    return next(error);
  }
}

export async function putLecturerSubmissionGrading(request, response, next) {
  try {
    return response.json(await saveLecturerSubmissionGrading(
      request.params.examId,
      request.params.submissionId,
      request.body,
      request.user.id,
    ));
  } catch (error) {
    return next(error);
  }
}

export async function postLecturerSubmissionGradingComplete(
  request,
  response,
  next,
) {
  try {
    return response.json(await completeLecturerSubmissionGrading(
      request.params.examId,
      request.params.submissionId,
      request.body,
      request.user.id,
    ));
  } catch (error) {
    return next(error);
  }
}

export async function postLecturerSubmissionGradingReopen(
  request,
  response,
  next,
) {
  try {
    return response.json(await reopenLecturerSubmissionGrading(
      request.params.examId,
      request.params.submissionId,
      request.body,
      request.user.id,
    ));
  } catch (error) {
    return next(error);
  }
}
