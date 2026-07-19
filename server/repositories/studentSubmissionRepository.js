import { pool } from '../db/pool.js';

export async function withStudentSubmissionTransaction(work) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function findPublishedExamForSubmission(examId, executor) {
  const result = await executor.query(
    `SELECT id
     FROM exams
     WHERE id = $1
       AND status = 'published'
     FOR SHARE`,
    [examId],
  );

  return result.rows[0] ?? null;
}

export async function findSubmissionQuestions(examId, executor) {
  const result = await executor.query(
    `SELECT id, type
     FROM questions
     WHERE exam_id = $1
     ORDER BY position, id`,
    [examId],
  );

  return result.rows;
}

export async function insertExamSubmission(examId, studentId, executor) {
  const result = await executor.query(
    `INSERT INTO exam_submissions (exam_id, student_id)
     VALUES ($1, $2)
     RETURNING id, exam_id, submitted_at`,
    [examId, studentId],
  );

  return result.rows[0];
}

export async function insertSubmissionAnswers(
  submissionId,
  examId,
  answers,
  executor,
) {
  let insertedCount = 0;

  for (const answer of answers) {
    const result = await executor.query(
      `INSERT INTO submission_answers (
         submission_id,
         exam_id,
         question_id,
         selected_option_id,
         boolean_answer,
         text_answer
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        submissionId,
        examId,
        answer.questionId,
        answer.selectedOptionId,
        answer.booleanAnswer,
        answer.textAnswer,
      ],
    );

    insertedCount += result.rowCount;
  }

  return insertedCount;
}
