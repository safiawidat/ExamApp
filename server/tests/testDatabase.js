import { randomUUID } from 'node:crypto';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for server integration tests; DATABASE_URL is never used as a fallback.',
  );
}

if (process.env.TEST_DATABASE_ISOLATED !== 'true') {
  throw new Error('TEST_DATABASE_ISOLATED must be exactly "true".');
}

if (originalDatabaseUrl && originalDatabaseUrl === testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must not match the existing DATABASE_URL.');
}

let parsedTestDatabaseUrl;

try {
  parsedTestDatabaseUrl = new URL(testDatabaseUrl);
} catch {
  throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL.');
}

if (!['postgres:', 'postgresql:'].includes(parsedTestDatabaseUrl.protocol)) {
  throw new Error('TEST_DATABASE_URL must use a PostgreSQL URL scheme.');
}

let testDatabaseName;

const hasExplicitTestDatabaseName = (databaseName) => (
  /^(?:test|vitest)_|_(?:test|vitest)(?:_|$)/i.test(databaseName)
);

try {
  testDatabaseName = decodeURIComponent(
    parsedTestDatabaseUrl.pathname.replace(/^\/+/, ''),
  );
} catch {
  throw new Error('TEST_DATABASE_URL must contain a valid database name.');
}

if (!testDatabaseName || !hasExplicitTestDatabaseName(testDatabaseName)) {
  throw new Error(
    'TEST_DATABASE_URL database name must clearly identify a test database.',
  );
}

process.env.NODE_ENV = 'test';
process.env.DATA_SOURCE = 'postgres';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = `test-only-${randomUUID()}`;
process.env.JWT_EXPIRES_IN = '1h';

export const runPrefix = `vitest_${randomUUID().replaceAll('-', '')}`;
export const username = (label) => `${runPrefix}_${label}`;

export async function loadTestApplication() {
  const { pool } = await import('../db/pool.js');

  try {
    const { app } = await import('../app.js');
    return { app, pool };
  } catch (error) {
    try {
      await pool.end();
    } catch {
      // Preserve the application import error after attempting pool closure.
    }

    throw error;
  }
}

export async function cleanTestRecords(pool, examIds = [], examTypeIds = []) {
  if (examIds.length > 0) {
    await pool.query('DELETE FROM exams WHERE id = ANY($1::int[])', [examIds]);
  }

  if (examTypeIds.length > 0) {
    await pool.query(
      'DELETE FROM exam_types WHERE id = ANY($1::int[])',
      [examTypeIds],
    );
  }

  const usernamePrefix = `${runPrefix}_`;
  await pool.query(
    'DELETE FROM users WHERE LEFT(username, LENGTH($1)) = $1',
    [usernamePrefix],
  );
}
