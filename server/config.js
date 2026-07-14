import 'dotenv/config';

const supportedDataSources = ['json', 'postgres'];
const dataSource = process.env.DATA_SOURCE || 'json';

if (!supportedDataSources.includes(dataSource)) {
  throw new Error('DATA_SOURCE must be either "json" or "postgres".');
}

const dbSslValue = process.env.DB_SSL || 'false';

if (!['true', 'false'].includes(dbSslValue)) {
  throw new Error('DB_SSL must be either "true" or "false".');
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  dataSource,
  databaseUrl: process.env.DATABASE_URL,
  dbSsl: dbSslValue === 'true',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  seedLecturerUsername: process.env.SEED_LECTURER_USERNAME,
  seedLecturerPassword: process.env.SEED_LECTURER_PASSWORD,
};

export function validateDatabaseConfig() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }
}

export function validateRuntimeConfig() {
  validateDatabaseConfig();

  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is required.');
  }
}
