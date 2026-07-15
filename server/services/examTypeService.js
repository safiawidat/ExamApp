import { HttpError } from '../middleware/errorHandler.js';
import {
  createExamType,
  deleteExamType,
  findAllExamTypes,
  updateExamType,
} from '../repositories/examTypeRepository.js';

const allowedFields = new Set(['name', 'description']);
const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value, field);

const validatePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const unsupportedField = Object.keys(payload).find((field) => !allowedFields.has(field));

  if (unsupportedField) {
    throw new HttpError(400, `Unsupported exam type field: ${unsupportedField}.`);
  }
};

const validateName = (name) => {
  if (typeof name !== 'string') {
    throw new HttpError(400, 'Exam type name is required.');
  }

  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new HttpError(400, 'Exam type name is required.');
  }

  if (normalizedName.length > 80) {
    throw new HttpError(400, 'Exam type name must be at most 80 characters.');
  }

  return normalizedName;
};

const validateDescription = (description) => {
  if (description === null || description === undefined) {
    return null;
  }

  if (typeof description !== 'string') {
    throw new HttpError(400, 'Exam type description must be a string or null.');
  }

  return description.trim() || null;
};

const parseId = (value) => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, 'Exam type ID must be a positive integer.');
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id)) {
    throw new HttpError(400, 'Exam type ID must be a positive integer.');
  }

  return id;
};

export function listExamTypes() {
  return findAllExamTypes();
}

export async function addExamType(payload, lecturerId) {
  validatePayload(payload);

  return createExamType({
    name: validateName(payload.name),
    description: validateDescription(payload.description),
    createdBy: lecturerId,
  });
}

export async function editExamType(idValue, payload, lecturerId) {
  const id = parseId(idValue);
  validatePayload(payload);

  if (!hasOwn(payload, 'name') && !hasOwn(payload, 'description')) {
    throw new HttpError(400, 'At least one exam type field is required.');
  }

  const changes = {};

  if (hasOwn(payload, 'name')) {
    changes.name = validateName(payload.name);
  }

  if (hasOwn(payload, 'description')) {
    changes.description = validateDescription(payload.description);
  }

  const examType = await updateExamType(id, lecturerId, changes);

  if (!examType) {
    throw new HttpError(404, 'Exam type not found.');
  }

  return examType;
}

export async function removeExamType(idValue, lecturerId) {
  const deleted = await deleteExamType(parseId(idValue), lecturerId);

  if (!deleted) {
    throw new HttpError(404, 'Exam type not found.');
  }
}
