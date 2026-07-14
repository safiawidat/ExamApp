import { HttpError } from '../middleware/errorHandler.js';
import { findExamTypeById } from '../repositories/examTypeRepository.js';
import {
  createOwnedExam,
  deleteOwnedDraftExam,
  findAllOwnedExams,
  findOwnedExamById,
  updateOwnedDraftExam,
} from '../repositories/lecturerExamRepository.js';

const allowedFields = new Set(['title', 'description', 'exam_type_id']);
const serverManagedFields = new Set([
  'id',
  'lecturer_id',
  'lecturerId',
  'owner_id',
  'ownerId',
  'status',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
  'published_at',
  'publishedAt',
]);
const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value, field);

const validatePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const managedField = Object.keys(payload).find((field) => serverManagedFields.has(field));

  if (managedField) {
    throw new HttpError(400, `Exam field ${managedField} is server-managed.`);
  }

  const unsupportedField = Object.keys(payload).find((field) => !allowedFields.has(field));

  if (unsupportedField) {
    throw new HttpError(400, `Unsupported exam field: ${unsupportedField}.`);
  }
};

const validateTitle = (title) => {
  if (typeof title !== 'string') {
    throw new HttpError(400, 'Exam title is required.');
  }

  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new HttpError(400, 'Exam title is required.');
  }

  if (normalizedTitle.length > 150) {
    throw new HttpError(400, 'Exam title must be at most 150 characters.');
  }

  return normalizedTitle;
};

const validateDescription = (description) => {
  if (description === null || description === undefined) {
    return null;
  }

  if (typeof description !== 'string') {
    throw new HttpError(400, 'Exam description must be a string or null.');
  }

  return description.trim() || null;
};

const validateExamTypeId = (examTypeId) => {
  if (!Number.isSafeInteger(examTypeId) || examTypeId < 1) {
    throw new HttpError(400, 'Exam type ID must be a positive integer.');
  }

  return examTypeId;
};

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

const requireExamType = async (examTypeId) => {
  if (!(await findExamTypeById(examTypeId))) {
    throw new HttpError(400, 'Exam type does not exist.');
  }
};

const requireOwnedExam = async (id, lecturerId) => {
  const exam = await findOwnedExamById(id, lecturerId);

  if (!exam) {
    throw new HttpError(404, 'Exam not found.');
  }

  return exam;
};

const requireDraft = (exam) => {
  if (exam.status !== 'draft') {
    throw new HttpError(409, 'Published exams must be unpublished before modifying.');
  }
};

export function listLecturerExams(lecturerId) {
  return findAllOwnedExams(lecturerId);
}

export function getLecturerExam(idValue, lecturerId) {
  return requireOwnedExam(parseExamId(idValue), lecturerId);
}

export async function addLecturerExam(payload, lecturerId) {
  validatePayload(payload);

  const examTypeId = validateExamTypeId(payload.exam_type_id);
  await requireExamType(examTypeId);

  return createOwnedExam({
    lecturerId,
    examTypeId,
    title: validateTitle(payload.title),
    description: validateDescription(payload.description),
  });
}

export async function editLecturerExam(idValue, payload, lecturerId) {
  const id = parseExamId(idValue);
  validatePayload(payload);

  if (![...allowedFields].some((field) => hasOwn(payload, field))) {
    throw new HttpError(400, 'At least one editable exam field is required.');
  }

  const currentExam = await requireOwnedExam(id, lecturerId);
  requireDraft(currentExam);

  const changes = {};

  if (hasOwn(payload, 'title')) {
    changes.title = validateTitle(payload.title);
  }

  if (hasOwn(payload, 'description')) {
    changes.description = validateDescription(payload.description);
  }

  if (hasOwn(payload, 'exam_type_id')) {
    changes.examTypeId = validateExamTypeId(payload.exam_type_id);
    await requireExamType(changes.examTypeId);
  }

  const updatedExam = await updateOwnedDraftExam(id, lecturerId, changes);

  if (!updatedExam) {
    const latestExam = await requireOwnedExam(id, lecturerId);
    requireDraft(latestExam);
    throw new HttpError(409, 'Exam could not be updated.');
  }

  return updatedExam;
}

export async function removeLecturerExam(idValue, lecturerId) {
  const id = parseExamId(idValue);
  const currentExam = await requireOwnedExam(id, lecturerId);
  requireDraft(currentExam);

  if (!(await deleteOwnedDraftExam(id, lecturerId))) {
    const latestExam = await requireOwnedExam(id, lecturerId);
    requireDraft(latestExam);
    throw new HttpError(409, 'Exam could not be deleted.');
  }
}
