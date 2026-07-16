import { pool } from '../db/pool.js';

const studentExamProjection = `
  e.id,
  e.title,
  e.description,
  e.published_at,
  et.id AS exam_type_id,
  et.name AS exam_type_name,
  (
    SELECT COUNT(*)::INTEGER
    FROM questions q
    WHERE q.exam_id = e.id
  ) AS question_count,
  (
    SELECT COALESCE(SUM(q.points), 0)::INTEGER
    FROM questions q
    WHERE q.exam_id = e.id
  ) AS total_points,
  EXISTS (
    SELECT 1
    FROM exam_submissions es
    WHERE es.exam_id = e.id AND es.student_id = $1
  ) AS has_submitted
`;

const mapStudentExam = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  published_at: row.published_at,
  exam_type: {
    id: row.exam_type_id,
    name: row.exam_type_name,
  },
  question_count: row.question_count,
  total_points: row.total_points,
  has_submitted: row.has_submitted,
});

const mapSafeQuestion = (row, options) => {
  const question = {
    id: row.id,
    question_type: row.type,
    prompt: row.text,
    points: row.points,
    position: row.position,
  };

  if (row.notice_message !== null) {
    question.notice = {
      message: row.notice_message,
      placement: row.notice_placement,
    };
  }

  if (row.type === 'multiple_choice') {
    question.options = options.map((option) => ({
      id: option.id,
      text: option.text,
      position: option.position,
    }));
  }

  return question;
};

export async function findPublishedExamsForStudent(studentId) {
  const result = await pool.query(
    `SELECT ${studentExamProjection}
     FROM exams e
     JOIN exam_types et ON et.id = e.exam_type_id
     WHERE e.status = 'published'
     ORDER BY e.published_at DESC, e.id DESC`,
    [studentId],
  );

  return result.rows.map(mapStudentExam);
}

export async function findPublishedExamForStudent(examId, studentId) {
  const result = await pool.query(
    `SELECT ${studentExamProjection}
     FROM exams e
     JOIN exam_types et ON et.id = e.exam_type_id
     WHERE e.id = $2 AND e.status = 'published'`,
    [studentId, examId],
  );

  return result.rows[0] ? mapStudentExam(result.rows[0]) : null;
}

export async function findSafePublishedQuestions(examId) {
  const [questionResult, optionResult] = await Promise.all([
    pool.query(
      `SELECT
         q.id,
         q.type,
         q.text,
         q.points,
         q.position,
         qn.message AS notice_message,
         qn.placement AS notice_placement
       FROM questions q
       JOIN exams e ON e.id = q.exam_id
       LEFT JOIN question_notices qn
         ON qn.question_id = q.id
        AND qn.exam_id = q.exam_id
       WHERE q.exam_id = $1 AND e.status = 'published'
       ORDER BY q.position, q.id`,
      [examId],
    ),
    pool.query(
      `SELECT qo.id, qo.question_id, qo.text, qo.position
       FROM question_options qo
       JOIN questions q ON q.id = qo.question_id
       JOIN exams e ON e.id = q.exam_id
       WHERE q.exam_id = $1 AND e.status = 'published'
       ORDER BY q.position, q.id, qo.position, qo.id`,
      [examId],
    ),
  ]);
  const optionsByQuestion = new Map();

  for (const option of optionResult.rows) {
    const options = optionsByQuestion.get(option.question_id) ?? [];
    options.push(option);
    optionsByQuestion.set(option.question_id, options);
  }

  return questionResult.rows.map((row) => (
    mapSafeQuestion(row, optionsByQuestion.get(row.id) ?? [])
  ));
}
