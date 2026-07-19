import { pool } from '../db/pool.js';

const noticeProjection = `
  question_id,
  exam_id,
  message,
  placement,
  created_at,
  updated_at
`;

const mapNotice = (row) => ({
  question_id: row.question_id,
  exam_id: row.exam_id,
  message: row.message,
  placement: row.placement,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export async function findOwnedExamForQuestionNotice(examId, lecturerId) {
  const result = await pool.query(
    `SELECT id, status
     FROM exams
     WHERE id = $1 AND lecturer_id = $2`,
    [examId, lecturerId],
  );

  return result.rows[0] ?? null;
}

export async function findQuestionForNotice(examId, questionId) {
  const result = await pool.query(
    `SELECT id
     FROM questions
     WHERE exam_id = $1 AND id = $2`,
    [examId, questionId],
  );

  return result.rows[0] ?? null;
}

export async function findQuestionNotice(examId, questionId) {
  const result = await pool.query(
    `SELECT ${noticeProjection}
     FROM question_notices
     WHERE exam_id = $1 AND question_id = $2`,
    [examId, questionId],
  );

  return result.rows[0] ? mapNotice(result.rows[0]) : null;
}

export async function upsertQuestionNotice({
  examId,
  questionId,
  message,
  placement,
}) {
  const result = await pool.query(
    `INSERT INTO question_notices (question_id, exam_id, message, placement)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (question_id) DO UPDATE
     SET exam_id = EXCLUDED.exam_id,
         message = EXCLUDED.message,
         placement = EXCLUDED.placement
     RETURNING ${noticeProjection}`,
    [questionId, examId, message, placement],
  );

  return mapNotice(result.rows[0]);
}

export async function deleteQuestionNotice(examId, questionId) {
  const result = await pool.query(
    `DELETE FROM question_notices
     WHERE exam_id = $1 AND question_id = $2`,
    [examId, questionId],
  );

  return result.rowCount > 0;
}
