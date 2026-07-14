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
const migrationNames = [migration001Name, migration002Name];
const migration001Sql = await readFile(
  new URL('../db/migrations/001_milestone_2_exam_authoring.sql', import.meta.url),
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
      TO_REGPROCEDURE('public.examapp_set_updated_at()') AS timestamp_function
  `);

  expect(result.rows[0]).toEqual({
    schema_migrations: null,
    exam_types: null,
    questions: null,
    question_options: null,
    timestamp_function: null,
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
           AND NOT tgisinternal) AS timestamp_trigger_count
      `);
      expect(counts.rows[0]).toEqual({
        migration_count: 2,
        timestamp_trigger_count: 3,
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
          TO_REGPROCEDURE('public.examapp_set_updated_at()') AS timestamp_function
      `);
      expect(artifacts.rows[0]).toEqual({
        schema_migrations: null,
        questions: null,
        question_options: null,
        timestamp_function: null,
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
        applied: [migration002Name],
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
        applied: [migration002Name],
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

  test('skips migration 002 idempotently after a successful rerun', async () => {
    await withTemporaryDatabase(async (databasePool) => {
      await prepareMigration002Database(databasePool);

      expect(await runMigrations({ databasePool })).toEqual({
        applied: [migration002Name],
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

  test('runs migrations 001 and 002 in order on a fresh database', async () => {
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
      ]);
      expect(await getQuestionConstraints(databasePool)).toHaveLength(2);
    });
  });
});
