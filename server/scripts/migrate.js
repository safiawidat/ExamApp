import { validateDatabaseConfig } from '../config.js';

validateDatabaseConfig();

const [{ pool }, { runMigrations }] = await Promise.all([
  import('../db/pool.js'),
  import('../db/migrate.js'),
]);

try {
  const result = await runMigrations();

  if (result.applied.length > 0) {
    console.log(`Applied migrations: ${result.applied.join(', ')}`);
  } else {
    console.log('Database schema is already up to date.');
  }
} catch (error) {
  console.error(`Database migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
