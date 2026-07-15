import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';

const examProjection = `
  e.id,
  e.lecturer_id,
  e.exam_type_id,
  e.title,
  e.description,
  e.status,
  e.created_at,
  e.updated_at,
  e.published_at,
  et.id AS joined_exam_type_id,
  et.name AS exam_type_name,
  (
    SELECT COUNT(*)::INTEGER
    FROM questions q
    WHERE q.exam_id = e.id
  ) AS question_count
`;

const mapExam = (row) => ({
  id: row.id,
  lecturer_id: row.lecturer_id,
  exam_type_id: row.exam_type_id,
  title: row.title,
  description: row.description,
  status: row.status,
  created_at: row.created_at,
  updated_at: row.updated_at,
  published_at: row.published_at,
  exam_type: {
    id: row.joined_exam_type_id,
    name: row.exam_type_name,
  },
  question_count: row.question_count,
});

const invalidExamTypeError = () => new HttpError(400, 'Exam type does not exist.');

const translateExamForeignKeyError = (error) => {
  if (
    error?.code === '23503'
    && error?.constraint === 'exams_exam_type_id_fkey'
  ) {
    throw invalidExamTypeError();
  }

  throw error;
};

export async function findAllOwnedExams(lecturerId) {
  const result = await pool.query(
    `SELECT ${examProjection}
     FROM exams e
     JOIN exam_types et ON et.id = e.exam_type_id
     WHERE e.lecturer_id = $1
     ORDER BY e.updated_at DESC, e.id DESC`,
    [lecturerId],
  );

  return result.rows.map(mapExam);
}

export async function findOwnedExamById(id, lecturerId) {
  const result = await pool.query(
    `SELECT ${examProjection}
     FROM exams e
     JOIN exam_types et ON et.id = e.exam_type_id
     WHERE e.id = $1 AND e.lecturer_id = $2`,
    [id, lecturerId],
  );

  return result.rows[0] ? mapExam(result.rows[0]) : null;
}

export async function createOwnedExam({
  lecturerId,
  examTypeId,
  title,
  description,
}) {
  try {
    const result = await pool.query(
      `INSERT INTO exams (lecturer_id, exam_type_id, title, description, status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING id`,
      [lecturerId, examTypeId, title, description],
    );

    return findOwnedExamById(result.rows[0].id, lecturerId);
  } catch (error) {
    return translateExamForeignKeyError(error);
  }
}

export async function updateOwnedDraftExam(id, lecturerId, changes) {
  const assignments = [];
  const values = [];

  if (changes.title !== undefined) {
    values.push(changes.title);
    assignments.push(`title = $${values.length}`);
  }

  if (changes.description !== undefined) {
    values.push(changes.description);
    assignments.push(`description = $${values.length}`);
  }

  if (changes.examTypeId !== undefined) {
    values.push(changes.examTypeId);
    assignments.push(`exam_type_id = $${values.length}`);
  }

  values.push(id, lecturerId);
  const idParameter = values.length - 1;
  const lecturerParameter = values.length;

  try {
    const result = await pool.query(
      `UPDATE exams
       SET ${assignments.join(', ')}
       WHERE id = $${idParameter}
         AND lecturer_id = $${lecturerParameter}
         AND status = 'draft'
       RETURNING id`,
      values,
    );

    if (!result.rows[0]) {
      return null;
    }

    return findOwnedExamById(result.rows[0].id, lecturerId);
  } catch (error) {
    return translateExamForeignKeyError(error);
  }
}

export async function deleteOwnedDraftExam(id, lecturerId) {
  const result = await pool.query(
    `DELETE FROM exams
     WHERE id = $1
       AND lecturer_id = $2
       AND status = 'draft'
     RETURNING id`,
    [id, lecturerId],
  );

  return result.rowCount > 0;
}
