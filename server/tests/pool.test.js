import { describe, expect, test } from 'vitest';
import { createConfig } from '../config.js';
import { createPoolOptions } from '../db/pool.js';

const databaseUrl = 'postgresql://user:password@database.example.test:5432/examapp';

describe('PostgreSQL pool TLS options', () => {
  test.each([undefined, 'true', 'false'])(
    'disables TLS when DB_SSL is false and verification is %s',
    (rejectUnauthorized) => {
      const runtimeConfig = createConfig({
        DATABASE_URL: databaseUrl,
        DB_SSL: 'false',
        DB_SSL_REJECT_UNAUTHORIZED: rejectUnauthorized,
      });

      expect(createPoolOptions(runtimeConfig)).toEqual({
        connectionString: databaseUrl,
        ssl: false,
      });
    },
  );

  test('enables TLS with certificate verification when its control is absent', () => {
    const runtimeConfig = createConfig({
      DATABASE_URL: databaseUrl,
      DB_SSL: 'true',
    });

    expect(createPoolOptions(runtimeConfig)).toEqual({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: true },
    });
  });

  test('enables TLS with explicit certificate verification', () => {
    expect(createPoolOptions({
      databaseUrl,
      dbSsl: true,
      dbSslRejectUnauthorized: true,
    })).toEqual({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: true },
    });
  });

  test('allows an explicit certificate-verification opt-out', () => {
    expect(createPoolOptions({
      databaseUrl,
      dbSsl: true,
      dbSslRejectUnauthorized: false,
    })).toEqual({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
  });
});
