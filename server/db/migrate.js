import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
const migrationFilePattern = /^(\d+)_([a-z0-9_]+)\.sql$/;

const loadMigrations = async () => {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });

  return Promise.all(entries
    .filter((entry) => entry.isFile() && migrationFilePattern.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (entry) => {
      const [, version] = migrationFilePattern.exec(entry.name);

      return {
        version,
        name: entry.name,
        sql: await readFile(new URL(`./migrations/${entry.name}`, import.meta.url), 'utf8'),
      };
    }));
};

export async function runMigrations({ databasePool = pool } = {}) {
  const migrations = await loadMigrations();

  if (migrations.length === 0) {
    throw new Error('No database migrations were found.');
  }

  const client = await databasePool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('examapp_schema_migrations'))",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(20) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const appliedResult = await client.query(
      'SELECT version, name FROM schema_migrations ORDER BY version',
    );
    const appliedMigrations = new Map(
      appliedResult.rows.map((migration) => [migration.version, migration.name]),
    );
    const applied = [];
    const skipped = [];

    for (const migration of migrations) {
      const recordedName = appliedMigrations.get(migration.version);

      if (recordedName) {
        if (recordedName !== migration.name) {
          throw new Error(
            `Migration ${migration.version} is recorded as ${recordedName}, not ${migration.name}.`,
          );
        }

        skipped.push(migration.name);
        continue;
      }

      await client.query(migration.sql);

      const recordedResult = await client.query(
        'SELECT name FROM schema_migrations WHERE version = $1',
        [migration.version],
      );

      if (recordedResult.rows[0] && recordedResult.rows[0].name !== migration.name) {
        throw new Error(
          `Migration ${migration.version} recorded an unexpected name.`,
        );
      }

      if (!recordedResult.rows[0]) {
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name],
        );
      }

      applied.push(migration.name);
    }

    await client.query('COMMIT');
    return { applied, skipped };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
