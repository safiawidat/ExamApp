import { pool } from '../db/pool.js';

const questionProjection = `
  q.id,
  q.exam_id,
  q.type,
  q.text,
  q.points,
  q.position,
  q.correct_answer,
  q.created_at,
  q.updated_at
`;

const mapQuestion = (row, options = []) => {
  const question = {
    id: row.id,
    exam_id: row.exam_id,
    question_type: row.type,
    prompt: row.text,
    points: row.points,
    position: row.position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (row.type === 'multiple_choice') {
    question.options = options.map((option) => ({
      id: option.id,
      text: option.text,
      is_correct: option.is_correct,
      position: option.position,
    }));
  } else if (row.type === 'true_false') {
    question.correct_answer = row.correct_answer === 'true';
  } else if (row.type === 'short_answer') {
    question.reference_answer = row.correct_answer;
  }

  return question;
};

const findOptionsForExam = async (examId, executor) => {
  const result = await executor.query(
    `SELECT qo.id, qo.question_id, qo.text, qo.is_correct, qo.position
     FROM question_options qo
     JOIN questions q ON q.id = qo.question_id
     WHERE q.exam_id = $1
     ORDER BY q.position, q.id, qo.position, qo.id`,
    [examId],
  );

  return result.rows;
};

const findOptionsForQuestion = async (questionId, executor) => {
  const result = await executor.query(
    `SELECT id, question_id, text, is_correct, position
     FROM question_options
     WHERE question_id = $1
     ORDER BY position, id`,
    [questionId],
  );

  return result.rows;
};

export async function withQuestionTransaction(work) {
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

export async function findOwnedExamState(
  examId,
  lecturerId,
  executor = pool,
  { lock = false } = {},
) {
  const result = await executor.query(
    `SELECT id, status
     FROM exams
     WHERE id = $1 AND lecturer_id = $2
     ${lock ? 'FOR UPDATE' : ''}`,
    [examId, lecturerId],
  );

  return result.rows[0] ?? null;
}

export async function findQuestionsByExamId(examId, executor = pool) {
  const [questionResult, options] = await Promise.all([
    executor.query(
      `SELECT ${questionProjection}
       FROM questions q
       WHERE q.exam_id = $1
       ORDER BY q.position, q.id`,
      [examId],
    ),
    findOptionsForExam(examId, executor),
  ]);
  const optionsByQuestion = new Map();

  for (const option of options) {
    const questionOptions = optionsByQuestion.get(option.question_id) ?? [];
    questionOptions.push(option);
    optionsByQuestion.set(option.question_id, questionOptions);
  }

  return questionResult.rows.map((row) => (
    mapQuestion(row, optionsByQuestion.get(row.id) ?? [])
  ));
}

export async function findQuestionById(
  examId,
  questionId,
  executor = pool,
  { lock = false } = {},
) {
  const result = await executor.query(
    `SELECT ${questionProjection}
     FROM questions q
     WHERE q.exam_id = $1 AND q.id = $2
     ${lock ? 'FOR UPDATE' : ''}`,
    [examId, questionId],
  );

  if (!result.rows[0]) {
    return null;
  }

  const options = result.rows[0].type === 'multiple_choice'
    ? await findOptionsForQuestion(questionId, executor)
    : [];

  return mapQuestion(result.rows[0], options);
}

export async function findQuestionIdsByExamId(examId, executor = pool) {
  const result = await executor.query(
    `SELECT id
     FROM questions
     WHERE exam_id = $1
     ORDER BY position, id`,
    [examId],
  );

  return result.rows.map((row) => row.id);
}

export async function createQuestionRecord(
  {
    examId,
    questionType,
    prompt,
    points,
    correctAnswer,
  },
  executor,
) {
  const result = await executor.query(
    `INSERT INTO questions (
       exam_id,
       type,
       text,
       points,
       position,
       correct_answer
     )
     SELECT $1, $2, $3, $4, COALESCE(MAX(position), 0) + 1, $5
     FROM questions
     WHERE exam_id = $1
     RETURNING id`,
    [examId, questionType, prompt, points, correctAnswer],
  );

  return result.rows[0].id;
}

export async function updateQuestionRecord(
  questionId,
  {
    questionType,
    prompt,
    points,
    correctAnswer,
  },
  executor,
) {
  await executor.query(
    `UPDATE questions
     SET type = $2,
         text = $3,
         points = $4,
         correct_answer = $5
     WHERE id = $1`,
    [questionId, questionType, prompt, points, correctAnswer],
  );
}

export async function replaceQuestionOptions(questionId, options, executor) {
  await executor.query(
    'DELETE FROM question_options WHERE question_id = $1',
    [questionId],
  );

  for (const [index, option] of options.entries()) {
    await executor.query(
      `INSERT INTO question_options (question_id, text, position, is_correct)
       VALUES ($1, $2, $3, $4)`,
      [questionId, option.text, index + 1, option.is_correct],
    );
  }
}

export async function deleteQuestionAndCompact(
  examId,
  questionId,
  position,
  executor,
) {
  await executor.query('SET CONSTRAINTS questions_exam_position_unique DEFERRED');
  await executor.query(
    'DELETE FROM questions WHERE id = $1 AND exam_id = $2',
    [questionId, examId],
  );
  await executor.query(
    `UPDATE questions
     SET position = position - 1
     WHERE exam_id = $1 AND position > $2`,
    [examId, position],
  );
}

export async function reorderQuestionRecords(examId, questionIds, executor) {
  if (questionIds.length === 0) {
    return;
  }

  await executor.query('SET CONSTRAINTS questions_exam_position_unique DEFERRED');
  await executor.query(
    `UPDATE questions q
     SET position = requested.position::INTEGER
     FROM UNNEST($2::INTEGER[]) WITH ORDINALITY AS requested(id, position)
     WHERE q.exam_id = $1 AND q.id = requested.id`,
    [examId, questionIds],
  );
}
