import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from 'vitest';
import { runMigrations } from '../db/migrate.js';

const { Pool } = pg;

const migration001Name = '001_milestone_2_exam_authoring.sql';
const migration002Name = '002_question_types.sql';
const migration003Name = '003_exam_submissions.sql';
const migrationNames = [
  migration001Name,
  migration002Name,
  migration003Name,
];
const migration001Sql = await readFile(
  new URL('../db/migrations/001_milestone_2_exam_authoring.sql', import.meta.url),
  'utf8',
);
const migration002Sql = await readFile(
  new URL('../db/migrations/002_question_types.sql', import.meta.url),
  'utf8',
);
const migration003Sql = await readFile(
  new URL('../db/migrations/003_exam_submissions.sql', import.meta.url),
  'utf8',
);
const expectedBootstrapRows = [
  {
    title: 'JavaScript Fundamentals',
    description: 'A sample exam covering JavaScript basics.',
    status: 'draft',
  },
  {
    title: 'Node.js Fundamentals',
    description: 'A sample exam covering Node.js basics.',
    status: 'draft',
  },
];

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const temporaryDatabaseNames = new Set();
let administrationPool;

const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const parseIsolatedTestDatabaseUrl = () => {
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for migration integration tests.');
  }

  if (process.env.TEST_DATABASE_ISOLATED !== 'true') {
    throw new Error('TEST_DATABASE_ISOLATED must be exactly "true".');
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(testDatabaseUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error('TEST_DATABASE_URL must use a PostgreSQL URL scheme.');
  }

  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));

  if (!/^(?:test|vitest)_|_(?:test|vitest)(?:_|$)/i.test(databaseName)) {
    throw new Error(
      'TEST_DATABASE_URL database name must clearly identify a test database.',
    );
  }

  return parsedUrl;
};

const dropTemporaryDatabase = async (databaseName) => {
  await administrationPool.query(
    `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
  );
  temporaryDatabaseNames.delete(databaseName);
};

const withTemporaryDatabase = async (callback) => {
  const databaseName = `vitest_migration_${randomUUID().replaceAll('-', '')}`;
  const databaseUrl = new URL(testDatabaseUrl);
  databaseUrl.pathname = `/${databaseName}`;

  await administrationPool.query(
    `CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`,
  );
  temporaryDatabaseNames.add(databaseName);

  const databasePool = new Pool({
    connectionString: databaseUrl.toString(),
    ssl: false,
  });

  try {
    await callback(databasePool);
  } finally {
    await databasePool.end();
    await dropTemporaryDatabase(databaseName);
  }
};

const createUsersSchema = async (databasePool) => {
  await databasePool.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(80) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT users_role_check CHECK (role IN ('lecturer', 'student')),
      CONSTRAINT users_username_not_blank_check CHECK (BTRIM(username) <> ''),
      CONSTRAINT users_username_lowercase_check CHECK (username = LOWER(username))
    )
  `);
};

const createLegacySchema = async (databasePool, rows) => {
  await createUsersSchema(databasePool);
  await databasePool.query(`
    CREATE TABLE exams (
      id SERIAL PRIMARY KEY,
      title VARCHAR(150) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft'
    )
  `);

  for (const row of rows) {
    await databasePool.query(
      `INSERT INTO exams (title, description, status)
       VALUES ($1, $2, $3)`,
      [row.title, row.description, row.status],
    );
  }
};

const prepareMigration002Database = async (databasePool) => {
  await createUsersSchema(databasePool);
  await databasePool.query(migration001Sql);

  const userResult = await databasePool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'lecturer')
     RETURNING id`,
    ['migration_002_lecturer', 'test-only-hash'],
  );
  const examTypeResult = await databasePool.query(
    `INSERT INTO exam_types (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING id`,
    ['Migration 002 Type', 'Migration test fixture', userResult.rows[0].id],
  );
  const examResult = await databasePool.query(
    `INSERT INTO exams (lecturer_id, exam_type_id, title)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userResult.rows[0].id, examTypeResult.rows[0].id, 'Migration 002 Exam'],
  );

  return examResult.rows[0].id;
};

const insertQuestion = async (
  databasePool,
  examId,
  { type, correctAnswer = null, position = 1 },
) => databasePool.query(
  `INSERT INTO questions (exam_id, type, text, points, position, correct_answer)
   VALUES ($1, $2, $3, $4, $5, $6)
   RETURNING id, exam_id, type, text, points, position, correct_answer`,
  [examId, type, `Question ${position}`, 1, position, correctAnswer],
);

const prepareMigration003Database = async (databasePool) => {
  await createUsersSchema(databasePool);
  await databasePool.query(migration001Sql);
  await databasePool.query(migration002Sql);

  const users = await databasePool.query(`
    INSERT INTO users (username, password_hash, role)
    VALUES
      ('migration_003_lecturer', 'test-only-hash', 'lecturer'),
      ('migration_003_student_one', 'test-only-hash', 'student'),
      ('migration_003_student_two', 'test-only-hash', 'student')
    RETURNING id, username
  `);
  const userIds = Object.fromEntries(
    users.rows.map((row) => [row.username, row.id]),
  );
  const examType = await databasePool.query(
    `INSERT INTO exam_types (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING id`,
    ['Migration 003 Type', 'Migration test fixture', userIds.migration_003_lecturer],
  );
  const exams = await databasePool.query(
    `INSERT INTO exams (
       lecturer_id,
       exam_type_id,
       title,
       status,
       published_at
     )
     VALUES
       ($1, $2, 'Migration 003 Exam A', 'published', CURRENT_TIMESTAMP),
       ($1, $2, 'Migration 003 Exam B', 'published', CURRENT_TIMESTAMP)
     RETURNING id, title`,
    [userIds.migration_003_lecturer, examType.rows[0].id],
  );
  const examIds = Object.fromEntries(
    exams.rows.map((row) => [row.title, row.id]),
  );
  const examAId = examIds['Migration 003 Exam A'];
  const examBId = examIds['Migration 003 Exam B'];
  const questionRows = [];

  questionRows.push((await insertQuestion(databasePool, examAId, {
    type: 'multiple_choice',
    position: 1,
  })).rows[0]);
  questionRows.push((await insertQuestion(databasePool, examAId, {
    type: 'true_false',
    correctAnswer: 'true',
    position: 2,
  })).rows[0]);
  questionRows.push((await insertQuestion(databasePool, examAId, {
    type: 'short_answer',
    correctAnswer: 'Reference answer',
    position: 3,
  })).rows[0]);
  questionRows.push((await insertQuestion(databasePool, examAId, {
    type: 'multiple_choice',
    position: 4,
  })).rows[0]);
  questionRows.push((await insertQuestion(databasePool, examBId, {
    type: 'multiple_choice',
    position: 1,
  })).rows[0]);

  const [multipleChoice, trueFalse, shortAnswer, otherMultipleChoice, examBQuestion]
    = questionRows;
  const options = await databasePool.query(
    `INSERT INTO question_options (question_id, text, position, is_correct)
     VALUES
       ($1, 'Exam A answer', 1, TRUE),
       ($1, 'Exam A distractor', 2, FALSE),
       ($2, 'Other question answer', 1, TRUE),
       ($3, 'Exam B answer', 1, TRUE)
     RETURNING id, question_id, text`,
    [multipleChoice.id, otherMultipleChoice.id, examBQuestion.id],
  );
  const optionIds = Object.fromEntries(
    options.rows.map((row) => [row.text, row.id]),
  );

  return {
    examAId,
    examBId,
    lecturerId: userIds.migration_003_lecturer,
    studentOneId: userIds.migration_003_student_one,
    studentTwoId: userIds.migration_003_student_two,
    questions: {
      multipleChoice,
      trueFalse,
      shortAnswer,
      otherMultipleChoice,
      examBQuestion,
    },
    options: {
      multipleChoice: optionIds['Exam A answer'],
      multipleChoiceDistractor: optionIds['Exam A distractor'],
      otherMultipleChoice: optionIds['Other question answer'],
      examBQuestion: optionIds['Exam B answer'],
    },
  };
};

const insertSubmission = async (databasePool, examId, studentId) => {
  const result = await databasePool.query(
    `INSERT INTO exam_submissions (exam_id, student_id)
     VALUES ($1, $2)
     RETURNING id, exam_id, student_id, submitted_at`,
    [examId, studentId],
  );

  return result.rows[0];
};

const insertAnswer = async (databasePool, {
  submissionId,
  examId,
  questionId,
  selectedOptionId = null,
  booleanAnswer = null,
  textAnswer = null,
}) => databasePool.query(
  `INSERT INTO submission_answers (
     submission_id,
     exam_id,
     question_id,
     selected_option_id,
     boolean_answer,
     text_answer
   )
   VALUES ($1, $2, $3, $4, $5, $6)
   RETURNING *`,
  [
    submissionId,
    examId,
    questionId,
    selectedOptionId,
    booleanAnswer,
    textAnswer,
  ],
);

const expectPostgresError = async (promise, code) => {
  await expect(promise).rejects.toMatchObject({ code });
};

const getQuestionConstraints = async (databasePool) => {
  const result = await databasePool.query(`
    SELECT
      conname AS name,
      PG_GET_CONSTRAINTDEF(oid) AS definition,
      convalidated AS validated
    FROM pg_constraint
    WHERE conrelid = 'questions'::REGCLASS
      AND conname IN ('questions_type_check', 'questions_answer_type_check')
    ORDER BY conname
  `);

  return result.rows;
};

const expectQuestionInsertRejected = async (databasePool, examId, question) => {
  await expect(insertQuestion(databasePool, examId, question)).rejects.toMatchObject({
    code: '23514',
  });
};

const getLegacyRows = async (databasePool) => {
  const result = await databasePool.query(
    `SELECT title, description, status
     FROM exams
     ORDER BY id`,
  );

  return result.rows;
};

const getExamColumns = async (databasePool) => {
  const result = await databasePool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exams'
    ORDER BY ordinal_position
  `);

  return result.rows.map((row) => row.column_name);
};

const expectNoMigrationArtifacts = async (databasePool) => {
  const result = await databasePool.query(`
    SELECT
      TO_REGCLASS('public.schema_migrations') AS schema_migrations,
      TO_REGCLASS('public.exam_types') AS exam_types,
      TO_REGCLASS('public.questions') AS questions,
      TO_REGCLASS('public.question_options') AS question_options,
      TO_REGCLASS('public.exam_submissions') AS exam_submissions,
      TO_REGCLASS('public.submission_answers') AS submission_answers,
      TO_REGPROCEDURE('public.examapp_set_updated_at()') AS timestamp_function,
      TO_REGPROCEDURE('public.examapp_validate_submission_answer()')
        AS answer_validation_function
  `);

  expect(result.rows[0]).toEqual({
    schema_migrations: null,
    exam_types: null,
    questions: null,
    question_options: null,
    exam_submissions: null,
    submission_answers: null,
    timestamp_function: null,
    answer_validation_function: null,
  });
};

const expectGuardFailurePreservesLegacyData = async (databasePool, rows) => {
  await createLegacySchema(databasePool, rows);

  await expect(runMigrations({ databasePool })).rejects.toThrow(
    /does not contain exactly one copy of each expected bootstrap record/i,
  );

  expect(await getExamColumns(databasePool)).toEqual([
    'id',
    'title',
    'description',
    'status',
  ]);
  expect(await getLegacyRows(databasePool)).toEqual(rows);
  await expectNoMigrationArtifacts(databasePool);
};

beforeAll(async () => {
  const parsedUrl = parseIsolatedTestDatabaseUrl();
  administrationPool = new Pool({
    connectionString: parsedUrl.toString(),
    ssl: false,
  });
  const result = await administrationPool.query('SELECT CURRENT_DATABASE() AS name');
  const expectedName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));

  if (result.rows[0].name !== expectedName) {
    throw new Error('Migration tests did not connect to the expected isolated database.');
  }
});

afterAll(async () => {
  if (administrationPool) {
    try {
      for (const databaseName of [...temporaryDatabaseNames]) {
        await dropTemporaryDatabase(databaseName);
      }
    } finally {
      await administrationPool.end();
    }
  }
});

describe('Milestone 2 legacy exam migration', () => {
  test('succeeds for exactly one copy of each expected bootstrap record', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await createLegacySchema(databasePool, expectedBootstrapRows);

      const result = await runMigrations({ databasePool });

      expect(result).toEqual({ applied: migrationNames, skipped: [] });
      expect(await getExamColumns(databasePool)).toEqual([
        'id',
        'lecturer_id',
        'exam_type_id',
        'title',
        'description',
        'status',
        'created_at',
        'updated_at',
        'published_at',
      ]);
      expect(await getLegacyRows(databasePool)).toEqual([]);

      const migration = await databasePool.query(
        'SELECT version, name FROM schema_migrations',
      );
      expect(migration.rows).toEqual([
        { version: '001', name: migration001Name },
        { version: '002', name: migration002Name },
        { version: '003', name: migration003Name },
      ]);
    });
  });

  test('rejects an empty legacy table as a missing bootstrap dataset', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await expectGuardFailurePreservesLegacyData(databasePool, []);
    });
  });

  test('rejects an unexpected title and preserves the legacy table', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await expectGuardFailurePreservesLegacyData(databasePool, [
        { ...expectedBootstrapRows[0], title: 'Unexpected exam' },
        expectedBootstrapRows[1],
      ]);
    });
  });

  test('rejects an unexpected description and preserves the legacy table', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await expectGuardFailurePreservesLegacyData(databasePool, [
        { ...expectedBootstrapRows[0], description: 'Unexpected description.' },
        expectedBootstrapRows[1],
      ]);
    });
  });

  test('rejects an unexpected NULL description and preserves the legacy table', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await expectGuardFailurePreservesLegacyData(databasePool, [
        { ...expectedBootstrapRows[0], description: null },
        expectedBootstrapRows[1],
      ]);
    });
  });

  test('rejects a duplicate bootstrap row and preserves the legacy table', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await expectGuardFailurePreservesLegacyData(databasePool, [
        ...expectedBootstrapRows,
        expectedBootstrapRows[0],
      ]);
    });
  });

  test('rejects a missing bootstrap row and preserves the legacy table', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await expectGuardFailurePreservesLegacyData(databasePool, [
        expectedBootstrapRows[0],
      ]);
    });
  });

  test('skips an already applied migration without duplicating schema changes', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await createLegacySchema(databasePool, expectedBootstrapRows);

      const firstRun = await runMigrations({ databasePool });
      const secondRun = await runMigrations({ databasePool });

      expect(firstRun).toEqual({ applied: migrationNames, skipped: [] });
      expect(secondRun).toEqual({ applied: [], skipped: migrationNames });

      const counts = await databasePool.query(`
        SELECT
          (SELECT COUNT(*)::INTEGER FROM schema_migrations)
            AS migration_count,
          (SELECT COUNT(*)::INTEGER FROM pg_trigger
           WHERE tgname IN (
             'exam_types_set_updated_at',
             'exams_set_updated_at',
             'questions_set_updated_at'
           )
           AND NOT tgisinternal) AS timestamp_trigger_count,
          (SELECT COUNT(*)::INTEGER FROM pg_trigger
           WHERE tgname = 'submission_answers_validate_answer'
             AND NOT tgisinternal) AS answer_trigger_count
      `);
      expect(counts.rows[0]).toEqual({
        migration_count: 3,
        timestamp_trigger_count: 3,
        answer_trigger_count: 1,
      });
    });
  });

  test('rolls back a late failure after the legacy table was provisionally dropped', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await createLegacySchema(databasePool, expectedBootstrapRows);
      await databasePool.query('CREATE TABLE exam_types (sentinel TEXT NOT NULL)');

      await expect(runMigrations({ databasePool })).rejects.toThrow(
        /relation "exam_types" already exists/i,
      );

      expect(await getExamColumns(databasePool)).toEqual([
        'id',
        'title',
        'description',
        'status',
      ]);
      expect(await getLegacyRows(databasePool)).toEqual(expectedBootstrapRows);

      const artifacts = await databasePool.query(`
        SELECT
          TO_REGCLASS('public.schema_migrations') AS schema_migrations,
          TO_REGCLASS('public.questions') AS questions,
          TO_REGCLASS('public.question_options') AS question_options,
          TO_REGCLASS('public.exam_submissions') AS exam_submissions,
          TO_REGCLASS('public.submission_answers') AS submission_answers,
          TO_REGPROCEDURE('public.examapp_set_updated_at()') AS timestamp_function,
          TO_REGPROCEDURE('public.examapp_validate_submission_answer()')
            AS answer_validation_function
      `);
      expect(artifacts.rows[0]).toEqual({
        schema_migrations: null,
        questions: null,
        question_options: null,
        exam_submissions: null,
        submission_answers: null,
        timestamp_function: null,
        answer_validation_function: null,
      });
      expect(await databasePool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'exam_types'`,
      )).toMatchObject({ rows: [{ column_name: 'sentinel' }] });
    });
  });
});

describe('Migration 002 question type constraints', () => {
  test('migrates an empty questions table successfully', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await prepareMigration002Database(databasePool);

      await expect(runMigrations({ databasePool })).resolves.toEqual({
        applied: [migration002Name, migration003Name],
        skipped: [migration001Name],
      });

      const count = await databasePool.query(
        'SELECT COUNT(*)::INTEGER AS count FROM questions',
      );
      expect(count.rows[0].count).toBe(0);
    });
  });

  test('migrates an existing valid multiple-choice question', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await insertQuestion(databasePool, examId, {
        type: 'multiple_choice',
        correctAnswer: null,
      });

      await expect(runMigrations({ databasePool })).resolves.toEqual({
        applied: [migration002Name, migration003Name],
        skipped: [migration001Name],
      });

      const result = await databasePool.query(
        'SELECT type, correct_answer FROM questions',
      );
      expect(result.rows).toEqual([{
        type: 'multiple_choice',
        correct_answer: null,
      }]);
    });
  });

  test('rejects an existing open-text question with a clear error', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await insertQuestion(databasePool, examId, {
        type: 'open_text',
        correctAnswer: 'Legacy answer',
      });

      await expect(runMigrations({ databasePool })).rejects.toThrow(
        /cannot classify existing open_text questions/i,
      );
    });
  });

  test('preserves an open-text row and the original constraints after failure', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      const inserted = await insertQuestion(databasePool, examId, {
        type: 'open_text',
        correctAnswer: 'Legacy answer',
      });
      const constraintsBefore = await getQuestionConstraints(databasePool);

      await expect(runMigrations({ databasePool })).rejects.toThrow(
        /cannot classify existing open_text questions/i,
      );

      const rows = await databasePool.query(
        `SELECT id, exam_id, type, text, points, position, correct_answer
         FROM questions`,
      );
      expect(rows.rows).toEqual(inserted.rows);
      expect(await getQuestionConstraints(databasePool)).toEqual(constraintsBefore);
      const migrations = await databasePool.query(
        'SELECT version, name FROM schema_migrations ORDER BY version',
      );
      expect(migrations.rows).toEqual([
        { version: '001', name: migration001Name },
      ]);
    });
  });

  test('rejects an existing multiple-choice row with a non-NULL answer', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await databasePool.query(
        'ALTER TABLE questions DROP CONSTRAINT questions_answer_type_check',
      );
      await insertQuestion(databasePool, examId, {
        type: 'multiple_choice',
        correctAnswer: 'invalid legacy answer',
      });
      await databasePool.query(`
        ALTER TABLE questions
        ADD CONSTRAINT questions_answer_type_check CHECK (
          type = 'open_text' OR correct_answer IS NULL
        ) NOT VALID
      `);

      await expect(runMigrations({ databasePool })).rejects.toThrow(
        /multiple_choice questions to have a NULL correct_answer/i,
      );

      const result = await databasePool.query(
        'SELECT type, correct_answer FROM questions',
      );
      expect(result.rows).toEqual([{
        type: 'multiple_choice',
        correct_answer: 'invalid legacy answer',
      }]);
    });
  });

  test('rolls back partial constraint replacement when installation fails', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await databasePool.query(
        'ALTER TABLE questions DROP CONSTRAINT questions_type_check',
      );
      await insertQuestion(databasePool, examId, {
        type: 'unsupported_legacy_type',
      });
      await databasePool.query(`
        ALTER TABLE questions
        ADD CONSTRAINT questions_type_check CHECK (
          type IN ('multiple_choice', 'open_text')
        ) NOT VALID
      `);
      const constraintsBefore = await getQuestionConstraints(databasePool);

      await expect(runMigrations({ databasePool })).rejects.toMatchObject({
        code: '23514',
      });

      expect(await getQuestionConstraints(databasePool)).toEqual(constraintsBefore);
      const row = await databasePool.query(
        'SELECT type, correct_answer FROM questions',
      );
      expect(row.rows).toEqual([{
        type: 'unsupported_legacy_type',
        correct_answer: null,
      }]);
    });
  });

  test('installs constraints permitting all three public question types', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await runMigrations({ databasePool });

      await insertQuestion(databasePool, examId, {
        type: 'multiple_choice',
        position: 1,
      });
      await insertQuestion(databasePool, examId, {
        type: 'true_false',
        correctAnswer: 'true',
        position: 2,
      });
      await insertQuestion(databasePool, examId, {
        type: 'short_answer',
        correctAnswer: 'Reference answer',
        position: 3,
      });

      const result = await databasePool.query(
        'SELECT type FROM questions ORDER BY position',
      );
      expect(result.rows.map((row) => row.type)).toEqual([
        'multiple_choice',
        'true_false',
        'short_answer',
      ]);
      expect(await getQuestionConstraints(databasePool)).toHaveLength(2);
    });
  });

  test('rejects unsupported question types after migration', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await runMigrations({ databasePool });

      await expectQuestionInsertRejected(databasePool, examId, {
        type: 'open_text',
      });
      await expectQuestionInsertRejected(databasePool, examId, {
        type: 'essay',
      });
    });
  });

  test("accepts only the exact true/false answer text values 'true' and 'false'", async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await runMigrations({ databasePool });

      await expect(insertQuestion(databasePool, examId, {
        type: 'true_false',
        correctAnswer: 'true',
        position: 1,
      })).resolves.toMatchObject({ rowCount: 1 });
      await expect(insertQuestion(databasePool, examId, {
        type: 'true_false',
        correctAnswer: 'false',
        position: 2,
      })).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  test('rejects NULL and other strings for true/false answers', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await runMigrations({ databasePool });

      for (const [correctAnswer, position] of [
        [null, 1],
        ['TRUE', 2],
        [' false', 3],
        ['yes', 4],
        ['', 5],
      ]) {
        await expectQuestionInsertRejected(databasePool, examId, {
          type: 'true_false',
          correctAnswer,
          position,
        });
      }
    });
  });

  test('accepts trimmed non-empty short-answer text', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await runMigrations({ databasePool });

      await expect(insertQuestion(databasePool, examId, {
        type: 'short_answer',
        correctAnswer: 'A trimmed reference answer',
      })).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  test('rejects invalid short-answer reference text', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await runMigrations({ databasePool });

      for (const [correctAnswer, position] of [
        [null, 1],
        ['', 2],
        ['   ', 3],
        [' untrimmed', 4],
        ['untrimmed ', 5],
      ]) {
        await expectQuestionInsertRejected(databasePool, examId, {
          type: 'short_answer',
          correctAnswer,
          position,
        });
      }
    });
  });

  test('rejects a non-NULL multiple-choice correct answer', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const examId = await prepareMigration002Database(databasePool);
      await runMigrations({ databasePool });

      await expectQuestionInsertRejected(databasePool, examId, {
        type: 'multiple_choice',
        correctAnswer: 'true',
      });
    });
  });

  test('skips migrations 002 and 003 idempotently after a successful rerun', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await prepareMigration002Database(databasePool);

      expect(await runMigrations({ databasePool })).toEqual({
        applied: [migration002Name, migration003Name],
        skipped: [migration001Name],
      });
      expect(await runMigrations({ databasePool })).toEqual({
        applied: [],
        skipped: migrationNames,
      });

      const result = await databasePool.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM schema_migrations
         WHERE version = '002' AND name = $1`,
        [migration002Name],
      );
      expect(result.rows[0].count).toBe(1);
    });
  });

  test('runs migrations 001, 002, and 003 in order on a fresh database', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await createUsersSchema(databasePool);

      await expect(runMigrations({ databasePool })).resolves.toEqual({
        applied: migrationNames,
        skipped: [],
      });

      const migrations = await databasePool.query(
        'SELECT version, name FROM schema_migrations ORDER BY version',
      );
      expect(migrations.rows).toEqual([
        { version: '001', name: migration001Name },
        { version: '002', name: migration002Name },
        { version: '003', name: migration003Name },
      ]);
      expect(await getQuestionConstraints(databasePool)).toHaveLength(2);
    });
  });
});

describe('Migration 003 exam submissions', () => {
  test('requires the prerequisite tables before installation', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await databasePool.query(`
        CREATE TABLE schema_migrations (
          version VARCHAR(20) PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await expect(databasePool.query(migration003Sql)).rejects.toThrow(
        /requires the existing public\.users table/i,
      );

      const artifacts = await databasePool.query(`
        SELECT
          TO_REGCLASS('public.exam_submissions') AS exam_submissions,
          TO_REGCLASS('public.submission_answers') AS submission_answers
      `);
      expect(artifacts.rows[0]).toEqual({
        exam_submissions: null,
        submission_answers: null,
      });
    });
  });

  test('installs tables, metadata, constraints, indexes, and trigger artifacts', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await prepareMigration003Database(databasePool);

      await expect(runMigrations({ databasePool })).resolves.toEqual({
        applied: [migration003Name],
        skipped: [migration001Name, migration002Name],
      });

      const migrations = await databasePool.query(
        'SELECT version, name FROM schema_migrations ORDER BY version',
      );
      expect(migrations.rows).toEqual([
        { version: '001', name: migration001Name },
        { version: '002', name: migration002Name },
        { version: '003', name: migration003Name },
      ]);

      const columns = await databasePool.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('exam_submissions', 'submission_answers')
        ORDER BY table_name, ordinal_position
      `);
      expect(columns.rows).toEqual([
        { table_name: 'exam_submissions', column_name: 'id' },
        { table_name: 'exam_submissions', column_name: 'exam_id' },
        { table_name: 'exam_submissions', column_name: 'student_id' },
        { table_name: 'exam_submissions', column_name: 'submitted_at' },
        { table_name: 'submission_answers', column_name: 'submission_id' },
        { table_name: 'submission_answers', column_name: 'exam_id' },
        { table_name: 'submission_answers', column_name: 'question_id' },
        { table_name: 'submission_answers', column_name: 'selected_option_id' },
        { table_name: 'submission_answers', column_name: 'boolean_answer' },
        { table_name: 'submission_answers', column_name: 'text_answer' },
      ]);

      const constraints = await databasePool.query(`
        SELECT conname
        FROM pg_constraint
        WHERE conname IN (
          'questions_id_exam_id_unique',
          'question_options_id_question_id_unique',
          'exam_submissions_exam_id_fkey',
          'exam_submissions_student_id_fkey',
          'exam_submissions_exam_student_unique',
          'exam_submissions_id_exam_id_unique',
          'submission_answers_pkey',
          'submission_answers_submission_exam_fkey',
          'submission_answers_question_exam_fkey',
          'submission_answers_option_question_fkey',
          'submission_answers_one_value_check',
          'submission_answers_text_valid_check'
        )
        ORDER BY conname
      `);
      expect(constraints.rows.map((row) => row.conname)).toEqual([
        'exam_submissions_exam_id_fkey',
        'exam_submissions_exam_student_unique',
        'exam_submissions_id_exam_id_unique',
        'exam_submissions_student_id_fkey',
        'question_options_id_question_id_unique',
        'questions_id_exam_id_unique',
        'submission_answers_one_value_check',
        'submission_answers_option_question_fkey',
        'submission_answers_pkey',
        'submission_answers_question_exam_fkey',
        'submission_answers_submission_exam_fkey',
        'submission_answers_text_valid_check',
      ]);

      const artifacts = await databasePool.query(`
        SELECT
          TO_REGCLASS('public.exam_submissions') AS exam_submissions,
          TO_REGCLASS('public.submission_answers') AS submission_answers,
          TO_REGCLASS('public.exam_submissions_student_submitted_at_idx')
            AS submissions_index,
          TO_REGCLASS('public.submission_answers_question_id_idx')
            AS answers_index,
          TO_REGPROCEDURE('public.examapp_validate_submission_answer()')
            AS answer_validation_function,
          EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgname = 'submission_answers_validate_answer'
              AND NOT tgisinternal
          ) AS answer_validation_trigger
      `);
      expect(artifacts.rows[0]).toEqual({
        exam_submissions: 'exam_submissions',
        submission_answers: 'submission_answers',
        submissions_index: 'exam_submissions_student_submitted_at_idx',
        answers_index: 'submission_answers_question_id_idx',
        answer_validation_function: 'examapp_validate_submission_answer()',
        answer_validation_trigger: true,
      });
    });
  });

  test('enforces one final submission per student and exam', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const fixture = await prepareMigration003Database(databasePool);
      await runMigrations({ databasePool });

      await expect(insertSubmission(
        databasePool,
        fixture.examAId,
        fixture.studentOneId,
      )).resolves.toMatchObject({
        exam_id: fixture.examAId,
        student_id: fixture.studentOneId,
      });
      await expectPostgresError(
        insertSubmission(databasePool, fixture.examAId, fixture.studentOneId),
        '23505',
      );
      await expect(insertSubmission(
        databasePool,
        fixture.examAId,
        fixture.studentTwoId,
      )).resolves.toMatchObject({ student_id: fixture.studentTwoId });
      await expect(insertSubmission(
        databasePool,
        fixture.examBId,
        fixture.studentOneId,
      )).resolves.toMatchObject({ exam_id: fixture.examBId });

      const count = await databasePool.query(
        'SELECT COUNT(*)::INTEGER AS count FROM exam_submissions',
      );
      expect(count.rows[0].count).toBe(3);
    });
  });

  test('rejects invalid submission, question, and option foreign keys', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const fixture = await prepareMigration003Database(databasePool);
      await runMigrations({ databasePool });
      const submission = await insertSubmission(
        databasePool,
        fixture.examAId,
        fixture.studentOneId,
      );

      await expectPostgresError(
        insertSubmission(databasePool, 2147483647, fixture.studentTwoId),
        '23503',
      );
      await expectPostgresError(
        insertSubmission(databasePool, fixture.examBId, 2147483647),
        '23503',
      );
      await expectPostgresError(insertAnswer(databasePool, {
        submissionId: 2147483647,
        examId: fixture.examAId,
        questionId: fixture.questions.multipleChoice.id,
      }), '23503');
      await expectPostgresError(insertAnswer(databasePool, {
        submissionId: submission.id,
        examId: fixture.examAId,
        questionId: fixture.questions.examBQuestion.id,
      }), '23503');
      await expectPostgresError(insertAnswer(databasePool, {
        submissionId: submission.id,
        examId: fixture.examAId,
        questionId: fixture.questions.multipleChoice.id,
        selectedOptionId: fixture.options.otherMultipleChoice,
      }), '23503');
    });
  });

  test('stores explicit unanswered rows for every public question type', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const fixture = await prepareMigration003Database(databasePool);
      await runMigrations({ databasePool });
      const submission = await insertSubmission(
        databasePool,
        fixture.examAId,
        fixture.studentOneId,
      );

      for (const question of [
        fixture.questions.multipleChoice,
        fixture.questions.trueFalse,
        fixture.questions.shortAnswer,
      ]) {
        await expect(insertAnswer(databasePool, {
          submissionId: submission.id,
          examId: fixture.examAId,
          questionId: question.id,
        })).resolves.toMatchObject({ rowCount: 1 });
      }

      const answers = await databasePool.query(`
        SELECT selected_option_id, boolean_answer, text_answer
        FROM submission_answers
        ORDER BY question_id
      `);
      expect(answers.rows).toHaveLength(3);
      expect(answers.rows).toEqual(answers.rows.map(() => ({
        selected_option_id: null,
        boolean_answer: null,
        text_answer: null,
      })));
    });
  });

  test('accepts valid answered rows for every public question type', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const fixture = await prepareMigration003Database(databasePool);
      await runMigrations({ databasePool });
      const submission = await insertSubmission(
        databasePool,
        fixture.examAId,
        fixture.studentOneId,
      );

      await expect(insertAnswer(databasePool, {
        submissionId: submission.id,
        examId: fixture.examAId,
        questionId: fixture.questions.multipleChoice.id,
        selectedOptionId: fixture.options.multipleChoice,
      })).resolves.toMatchObject({ rowCount: 1 });
      await expect(insertAnswer(databasePool, {
        submissionId: submission.id,
        examId: fixture.examAId,
        questionId: fixture.questions.trueFalse.id,
        booleanAnswer: false,
      })).resolves.toMatchObject({ rowCount: 1 });
      await expect(insertAnswer(databasePool, {
        submissionId: submission.id,
        examId: fixture.examAId,
        questionId: fixture.questions.shortAnswer.id,
        textAnswer: 'A trimmed response',
      })).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  test('rejects multiple values, invalid text, and type-mismatched values', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const fixture = await prepareMigration003Database(databasePool);
      await runMigrations({ databasePool });
      const submission = await insertSubmission(
        databasePool,
        fixture.examAId,
        fixture.studentOneId,
      );
      const base = {
        submissionId: submission.id,
        examId: fixture.examAId,
      };

      await expectPostgresError(insertAnswer(databasePool, {
        ...base,
        questionId: fixture.questions.multipleChoice.id,
        selectedOptionId: fixture.options.multipleChoice,
        booleanAnswer: true,
      }), '23514');

      for (const textAnswer of ['', '   ', ' untrimmed', 'untrimmed ']) {
        await expectPostgresError(insertAnswer(databasePool, {
          ...base,
          questionId: fixture.questions.shortAnswer.id,
          textAnswer,
        }), '23514');
      }

      await expectPostgresError(insertAnswer(databasePool, {
        ...base,
        questionId: fixture.questions.multipleChoice.id,
        booleanAnswer: true,
      }), '23514');
      await expectPostgresError(insertAnswer(databasePool, {
        ...base,
        questionId: fixture.questions.trueFalse.id,
        textAnswer: 'wrong type',
      }), '23514');
      await expectPostgresError(insertAnswer(databasePool, {
        ...base,
        questionId: fixture.questions.shortAnswer.id,
        selectedOptionId: fixture.options.multipleChoice,
      }), '23514');
    });
  });

  test('allows only one answer row per submission question', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const fixture = await prepareMigration003Database(databasePool);
      await runMigrations({ databasePool });
      const submission = await insertSubmission(
        databasePool,
        fixture.examAId,
        fixture.studentOneId,
      );
      const answer = {
        submissionId: submission.id,
        examId: fixture.examAId,
        questionId: fixture.questions.multipleChoice.id,
      };

      await insertAnswer(databasePool, answer);
      await expectPostgresError(insertAnswer(databasePool, {
        ...answer,
        selectedOptionId: fixture.options.multipleChoice,
      }), '23505');
    });
  });

  test('prevents answers from crossing exam ownership', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const fixture = await prepareMigration003Database(databasePool);
      await runMigrations({ databasePool });
      const submission = await insertSubmission(
        databasePool,
        fixture.examAId,
        fixture.studentOneId,
      );

      await expectPostgresError(insertAnswer(databasePool, {
        submissionId: submission.id,
        examId: fixture.examAId,
        questionId: fixture.questions.examBQuestion.id,
      }), '23503');
    });
  });

  test('prevents selecting an option owned by another question', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const fixture = await prepareMigration003Database(databasePool);
      await runMigrations({ databasePool });
      const submission = await insertSubmission(
        databasePool,
        fixture.examAId,
        fixture.studentOneId,
      );

      await expectPostgresError(insertAnswer(databasePool, {
        submissionId: submission.id,
        examId: fixture.examAId,
        questionId: fixture.questions.multipleChoice.id,
        selectedOptionId: fixture.options.otherMultipleChoice,
      }), '23503');
    });
  });

  test('cascades answer deletion from a deleted submission', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      const fixture = await prepareMigration003Database(databasePool);
      await runMigrations({ databasePool });
      const submission = await insertSubmission(
        databasePool,
        fixture.examAId,
        fixture.studentOneId,
      );
      await insertAnswer(databasePool, {
        submissionId: submission.id,
        examId: fixture.examAId,
        questionId: fixture.questions.multipleChoice.id,
      });

      await databasePool.query(
        'DELETE FROM exam_submissions WHERE id = $1',
        [submission.id],
      );
      const count = await databasePool.query(
        'SELECT COUNT(*)::INTEGER AS count FROM submission_answers',
      );
      expect(count.rows[0].count).toBe(0);
    });
  });

  test('skips all three migrations idempotently after migration 003 succeeds', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await prepareMigration003Database(databasePool);

      expect(await runMigrations({ databasePool })).toEqual({
        applied: [migration003Name],
        skipped: [migration001Name, migration002Name],
      });
      expect(await runMigrations({ databasePool })).toEqual({
        applied: [],
        skipped: migrationNames,
      });

      const artifacts = await databasePool.query(`
        SELECT
          (SELECT COUNT(*)::INTEGER FROM schema_migrations)
            AS migration_count,
          (SELECT COUNT(*)::INTEGER FROM pg_trigger
           WHERE tgname = 'submission_answers_validate_answer'
             AND NOT tgisinternal) AS trigger_count,
          (SELECT COUNT(*)::INTEGER FROM pg_proc
           WHERE oid = TO_REGPROCEDURE('public.examapp_validate_submission_answer()'))
            AS function_count
      `);
      expect(artifacts.rows[0]).toEqual({
        migration_count: 3,
        trigger_count: 1,
        function_count: 1,
      });
    });
  });
});
