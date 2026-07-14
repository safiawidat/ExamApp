import { randomUUID } from 'node:crypto';
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

const migrationName = '001_milestone_2_exam_authoring.sql';
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

const createLegacySchema = async (databasePool, rows) => {
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

      expect(result).toEqual({ applied: [migrationName], skipped: [] });
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
      expect(migration.rows).toEqual([{ version: '001', name: migrationName }]);
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

      expect(firstRun).toEqual({ applied: [migrationName], skipped: [] });
      expect(secondRun).toEqual({ applied: [], skipped: [migrationName] });

      const counts = await databasePool.query(`
        SELECT
          (SELECT COUNT(*)::INTEGER FROM schema_migrations WHERE version = '001')
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
        migration_count: 1,
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
