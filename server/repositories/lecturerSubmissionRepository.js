import { pool } from '../db/pool.js';

const parseStoredScore = (
  value,
  label,
  { maximum = Number.POSITIVE_INFINITY } = {},
) => {
  if (value === null) {
    return null;
  }

  if (
    (typeof value !== 'string' && typeof value !== 'number')
    || (typeof value === 'string' && value.trim() === '')
  ) {
    throw new Error(`Stored ${label} has an invalid numeric type.`);
  }

  const score = Number(value);

  if (!Number.isFinite(score) || score < 0 || score > maximum) {
    throw new Error(`Stored ${label} is outside its valid range.`);
  }

  return score;
};

const mapSubmission = (row) => ({
  id: row.id,
  examId: row.exam_id,
  studentId: row.student_id,
  studentUsername: row.student_username,
  submittedAt: row.submitted_at,
  gradingState: row.grading_state,
  totalScore: parseStoredScore(row.total_score, 'total score', {
    maximum: row.maximum_score,
  }),
  gradedBy: row.graded_by,
  gradingLecturerUsername: row.grading_lecturer_username ?? null,
  gradingCompletedAt: row.grading_completed_at,
  resultPublishedAt: row.result_published_at,
  maximumScore: row.maximum_score,
});

const mapQuestion = (row, options) => ({
  id: row.id,
  type: row.type,
  prompt: row.text,
  position: row.position,
  correctAnswer: row.correct_answer,
  answerExists: row.answer_exists,
  selectedOptionId: row.selected_option_id,
  booleanAnswer: row.boolean_answer,
  textAnswer: row.text_answer,
  awardedPoints: parseStoredScore(row.awarded_points, 'awarded points', {
    maximum: 1,
  }),
  feedback: row.lecturer_feedback,
  options,
});

export async function withLecturerGradingTransaction(work) {
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

export async function findOwnedExamForSubmissionReview(
  examId,
  lecturerId,
  executor = pool,
) {
  const result = await executor.query(
    `SELECT id
     FROM exams
     WHERE id = $1 AND lecturer_id = $2`,
    [examId, lecturerId],
  );

  return result.rows[0] ?? null;
}

export async function findSubmissionsForOwnedExam(examId, executor = pool) {
  const result = await executor.query(
    `SELECT
       es.id,
       es.exam_id,
       es.student_id,
       student.username AS student_username,
       es.submitted_at,
       es.grading_state,
       es.total_score,
       es.graded_by,
       grader.username AS grading_lecturer_username,
       es.grading_completed_at,
       es.result_published_at,
       COUNT(q.id)::INTEGER AS maximum_score
     FROM exam_submissions es
     JOIN users student ON student.id = es.student_id
     LEFT JOIN users grader ON grader.id = es.graded_by
     LEFT JOIN questions q ON q.exam_id = es.exam_id
     WHERE es.exam_id = $1
     GROUP BY es.id, student.id, grader.id
     ORDER BY es.submitted_at, es.id`,
    [examId],
  );

  return result.rows.map(mapSubmission);
}

export async function findSubmissionForReview(
  examId,
  submissionId,
  executor = pool,
  { lock = false } = {},
) {
  const result = await executor.query(
    `SELECT
       es.id,
       es.exam_id,
       es.student_id,
       student.username AS student_username,
       es.submitted_at,
       es.grading_state,
       es.total_score,
       es.graded_by,
       grader.username AS grading_lecturer_username,
       es.grading_completed_at,
       es.result_published_at,
       (
         SELECT COUNT(*)::INTEGER
         FROM questions q
         WHERE q.exam_id = es.exam_id
       ) AS maximum_score
     FROM exam_submissions es
     JOIN users student ON student.id = es.student_id
     LEFT JOIN users grader ON grader.id = es.graded_by
     WHERE es.id = $1 AND es.exam_id = $2
     ${lock ? 'FOR UPDATE OF es' : ''}`,
    [submissionId, examId],
  );

  return result.rows[0] ? mapSubmission(result.rows[0]) : null;
}

export async function findSubmissionQuestionsForGrading(
  examId,
  submissionId,
  executor = pool,
) {
  const [questionResult, optionResult] = await Promise.all([
    executor.query(
      `SELECT
         q.id,
         q.type,
         q.text,
         q.position,
         q.correct_answer,
         (sa.submission_id IS NOT NULL) AS answer_exists,
         sa.selected_option_id,
         sa.boolean_answer,
         sa.text_answer,
         sa.awarded_points,
         sa.lecturer_feedback
       FROM questions q
       LEFT JOIN submission_answers sa
         ON sa.question_id = q.id
        AND sa.exam_id = q.exam_id
        AND sa.submission_id = $2
       WHERE q.exam_id = $1
       ORDER BY q.position, q.id`,
      [examId, submissionId],
    ),
    executor.query(
      `SELECT qo.id, qo.question_id, qo.text, qo.position, qo.is_correct
       FROM question_options qo
       JOIN questions q ON q.id = qo.question_id
       WHERE q.exam_id = $1
       ORDER BY q.position, q.id, qo.position, qo.id`,
      [examId],
    ),
  ]);
  const optionsByQuestion = new Map();

  for (const option of optionResult.rows) {
    const options = optionsByQuestion.get(option.question_id) ?? [];
    options.push({
      id: option.id,
      text: option.text,
      position: option.position,
      isCorrect: option.is_correct,
    });
    optionsByQuestion.set(option.question_id, options);
  }

  return questionResult.rows.map((row) => (
    mapQuestion(row, optionsByQuestion.get(row.id) ?? [])
  ));
}

export async function updateSubmissionAnswerGrades(
  submissionId,
  gradingAnswers,
  executor,
) {
  for (const answer of gradingAnswers) {
    const result = await executor.query(
      `UPDATE submission_answers
       SET awarded_points = $3, lecturer_feedback = $4
       WHERE submission_id = $1 AND question_id = $2`,
      [
        submissionId,
        answer.questionId,
        answer.awardedPoints,
        answer.feedback,
      ],
    );

    if (result.rowCount !== 1) {
      throw new Error('Submission grading answer row was not found.');
    }
  }
}

export async function markSubmissionGradingInProgress(submissionId, executor) {
  const result = await executor.query(
    `UPDATE exam_submissions
     SET grading_state = 'in_progress',
         total_score = NULL,
         graded_by = NULL,
         grading_completed_at = NULL
     WHERE id = $1
     RETURNING id`,
    [submissionId],
  );

  return result.rowCount === 1;
}

export async function completeSubmissionGrading(
  submissionId,
  lecturerId,
  totalScore,
  executor,
) {
  const result = await executor.query(
    `UPDATE exam_submissions
     SET grading_state = 'completed',
         total_score = $2,
         graded_by = $3,
         grading_completed_at = CURRENT_TIMESTAMP,
         result_published_at = NULL
     WHERE id = $1
     RETURNING grading_completed_at`,
    [submissionId, totalScore, lecturerId],
  );

  return result.rows[0] ?? null;
}

export async function publishSubmissionResult(submissionId, executor) {
  const result = await executor.query(
    `UPDATE exam_submissions
     SET result_published_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND result_published_at IS NULL
     RETURNING result_published_at`,
    [submissionId],
  );

  return result.rows[0] ?? null;
}

export async function reopenSubmissionGrading(submissionId, executor) {
  const result = await executor.query(
    `UPDATE exam_submissions
     SET grading_state = 'in_progress',
         total_score = NULL,
         graded_by = NULL,
         grading_completed_at = NULL
     WHERE id = $1
     RETURNING id`,
    [submissionId],
  );

  return result.rowCount === 1;
}
