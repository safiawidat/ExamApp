import { pool } from '../db/pool.js';

const parseStoredScore = (
  value,
  label,
  { maximum = Number.POSITIVE_INFINITY } = {},
) => {
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

const mapResultSummary = (row) => ({
  examId: row.exam_id,
  examTitle: row.exam_title,
  submissionId: row.submission_id,
  submittedAt: row.submitted_at,
  resultPublishedAt: row.result_published_at,
  totalScore: parseStoredScore(row.total_score, 'total score', {
    maximum: row.maximum_score,
  }),
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
  awardedPoints: row.awarded_points === null
    ? null
    : parseStoredScore(row.awarded_points, 'awarded points', { maximum: 1 }),
  feedback: row.lecturer_feedback,
  options,
});

export async function findPublishedResultForStudent(examId, studentId) {
  const result = await pool.query(
    `SELECT
       e.id AS exam_id,
       e.title AS exam_title,
       es.id AS submission_id,
       es.submitted_at,
       es.result_published_at,
       es.total_score,
       (
         SELECT COUNT(*)::INTEGER
         FROM questions q
         WHERE q.exam_id = e.id
       ) AS maximum_score
     FROM exams e
     JOIN exam_submissions es
       ON es.exam_id = e.id
      AND es.student_id = $2
     WHERE e.id = $1
       AND e.status = 'published'
       AND es.grading_state = 'completed'
       AND es.total_score IS NOT NULL
       AND es.result_published_at IS NOT NULL`,
    [examId, studentId],
  );

  return result.rows[0] ? mapResultSummary(result.rows[0]) : null;
}

export async function findPublishedResultQuestions(examId, submissionId) {
  const [questionResult, optionResult] = await Promise.all([
    pool.query(
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
    pool.query(
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
