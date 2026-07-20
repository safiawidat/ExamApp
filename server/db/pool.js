import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const createPoolOptions = (runtimeConfig = config) => ({
  connectionString: runtimeConfig.databaseUrl,
  ssl: runtimeConfig.dbSsl
    ? { rejectUnauthorized: runtimeConfig.dbSslRejectUnauthorized }
    : false,
});

export const pool = new Pool(createPoolOptions());
