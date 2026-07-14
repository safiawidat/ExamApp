import {
  config,
  validateDatabaseConfig,
} from '../config.js';

let sharedPool;

async function seedLecturer() {
  validateDatabaseConfig();

  if (!config.seedLecturerUsername) {
    throw new Error('SEED_LECTURER_USERNAME is required.');
  }

  if (!config.seedLecturerPassword) {
    throw new Error('SEED_LECTURER_PASSWORD is required.');
  }

  const [authService, userRepository, database] = await Promise.all([
    import('../services/authService.js'),
    import('../repositories/userRepository.js'),
    import('../db/pool.js'),
  ]);

  sharedPool = database.pool;

  const username = authService.normalizeAndValidateUsername(
    config.seedLecturerUsername,
  );
  const password = authService.validatePassword(config.seedLecturerPassword);
  const passwordHash = await authService.hashPassword(password);

  await userRepository.upsertLecturer({ username, passwordHash });
  console.log('Lecturer account seeded.');
}

try {
  await seedLecturer();
} catch (error) {
  const safeMessage = [400, 409].includes(error?.status)
    || error?.message?.endsWith(' is required.')
    ? error.message
    : 'Failed to seed lecturer account.';

  console.error(safeMessage);
  process.exitCode = 1;
} finally {
  if (sharedPool) {
    await sharedPool.end();
  }
}
