import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';

const examTypeColumns = `
  id,
  name,
  description,
  created_by,
  created_at,
  updated_at
`;

const duplicateNameError = () => (
  new HttpError(409, 'An exam type with that name already exists.')
);

export async function findAllExamTypes() {
  const result = await pool.query(
    `SELECT ${examTypeColumns}
     FROM exam_types
     ORDER BY LOWER(name), id`,
  );

  return result.rows;
}

export async function findExamTypeById(id) {
  const result = await pool.query(
    `SELECT ${examTypeColumns}
     FROM exam_types
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

export async function createExamType({ name, description, createdBy }) {
  try {
    const result = await pool.query(
      `INSERT INTO exam_types (name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING ${examTypeColumns}`,
      [name, description, createdBy],
    );

    return result.rows[0];
  } catch (error) {
    if (
      error?.code === '23505'
      && error?.constraint === 'exam_types_name_case_insensitive_unique'
    ) {
      throw duplicateNameError();
    }

    throw error;
  }
}

export async function updateExamType(id, createdBy, changes) {
  const assignments = [];
  const values = [];

  if (changes.name !== undefined) {
    values.push(changes.name);
    assignments.push(`name = $${values.length}`);
  }

  if (changes.description !== undefined) {
    values.push(changes.description);
    assignments.push(`description = $${values.length}`);
  }

  values.push(id, createdBy);
  const idParameter = values.length - 1;
  const createdByParameter = values.length;

  try {
    const result = await pool.query(
      `UPDATE exam_types
       SET ${assignments.join(', ')}
       WHERE id = $${idParameter}
         AND created_by = $${createdByParameter}
       RETURNING ${examTypeColumns}`,
      values,
    );

    return result.rows[0] || null;
  } catch (error) {
    if (
      error?.code === '23505'
      && error?.constraint === 'exam_types_name_case_insensitive_unique'
    ) {
      throw duplicateNameError();
    }

    throw error;
  }
}

export async function deleteExamType(id, createdBy) {
  try {
    const result = await pool.query(
      `DELETE FROM exam_types
       WHERE id = $1
         AND created_by = $2
       RETURNING id`,
      [id, createdBy],
    );

    return result.rowCount > 0;
  } catch (error) {
    if (
      ['23503', '23001'].includes(error?.code)
      && error?.constraint === 'exams_exam_type_id_fkey'
    ) {
      throw new HttpError(409, 'Exam types in use by an exam cannot be deleted.');
    }

    throw error;
  }
}
