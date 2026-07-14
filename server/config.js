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

if (dataSource === 'postgres' && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required when DATA_SOURCE is "postgres".');
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  dataSource,
  databaseUrl: process.env.DATABASE_URL,
  dbSsl: dbSslValue === 'true',
};
