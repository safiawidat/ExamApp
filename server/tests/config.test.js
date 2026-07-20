import {
  describe,
  expect,
  test,
} from 'vitest';
import {
  createConfig,
  validateDatabaseConfig,
  validateRuntimeConfig,
} from '../config.js';

const strongSecret = 'test-only-strong-production-secret-42';
const developmentEnvironment = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/examapp',
  JWT_SECRET: 'development-secret',
};
const productionEnvironment = {
  ...developmentEnvironment,
  NODE_ENV: 'production',
  JWT_SECRET: strongSecret,
  CLIENT_ORIGIN: 'https://client.example.test',
  DB_SSL: 'true',
};

describe('server configuration', () => {
  test('accepts valid development configuration with local defaults', () => {
    const runtimeConfig = createConfig(developmentEnvironment);

    expect(() => validateRuntimeConfig(runtimeConfig)).not.toThrow();
    expect(runtimeConfig).toMatchObject({
      nodeEnv: 'development',
      clientOrigin: 'http://localhost:5173',
      dbSsl: false,
      dbSslRejectUnauthorized: true,
    });
  });

  test('accepts valid explicit production configuration', () => {
    const runtimeConfig = createConfig(productionEnvironment);

    expect(() => validateRuntimeConfig(runtimeConfig)).not.toThrow();
    expect(runtimeConfig.clientOrigin).toBe('https://client.example.test');
  });

  test('normalizes a trailing origin slash without changing the CORS origin', () => {
    const runtimeConfig = createConfig({
      ...productionEnvironment,
      CLIENT_ORIGIN: 'https://client.example.test/',
    });

    expect(runtimeConfig.clientOrigin).toBe('https://client.example.test');
  });

  test.each([
    ['missing', undefined],
    ['blank', '   '],
  ])('rejects a %s production CLIENT_ORIGIN', (_label, clientOrigin) => {
    const runtimeConfig = createConfig({
      ...productionEnvironment,
      CLIENT_ORIGIN: clientOrigin,
    });

    expect(() => validateRuntimeConfig(runtimeConfig)).toThrow('CLIENT_ORIGIN is required');
  });

  test('rejects a malformed production CLIENT_ORIGIN', () => {
    expect(() => createConfig({
      ...productionEnvironment,
      CLIENT_ORIGIN: 'not an origin',
    })).toThrow('absolute HTTP(S) origin');
  });

  test('rejects an unsupported production CLIENT_ORIGIN scheme', () => {
    expect(() => createConfig({
      ...productionEnvironment,
      CLIENT_ORIGIN: 'ftp://client.example.test',
    })).toThrow('must use http:// or https://');
  });

  test('rejects CLIENT_ORIGIN credentials without echoing them', () => {
    const clientOrigin = 'https://private-user:private-password@client.example.test';

    let validationError;
    try {
      createConfig({
        ...productionEnvironment,
        CLIENT_ORIGIN: clientOrigin,
      });
    } catch (error) {
      validationError = error;
    }

    expect(validationError).toBeInstanceOf(Error);
    expect(validationError.message).toContain('CLIENT_ORIGIN');
    expect(validationError.message).not.toContain(clientOrigin);
    expect(validationError.message).not.toContain('private-password');
  });

  test('rejects an insecure non-local production CLIENT_ORIGIN', () => {
    expect(() => createConfig({
      ...productionEnvironment,
      CLIENT_ORIGIN: 'http://client.example.test',
    })).toThrow('must use https://');
  });

  test.each([
    'https://client.example.test/path',
    'https://client.example.test?preview=true',
    'https://client.example.test#fragment',
  ])('rejects a production CLIENT_ORIGIN with non-origin content: %s', (clientOrigin) => {
    expect(() => createConfig({
      ...productionEnvironment,
      CLIENT_ORIGIN: clientOrigin,
    })).toThrow('must not contain a path, query, or fragment');
  });

  test.each([
    'too-short',
    'REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS',
    'EXAMPLE_SECRET_THAT_MUST_NOT_BE_USED_123456',
  ])('rejects a weak or placeholder production JWT_SECRET', (jwtSecret) => {
    const runtimeConfig = createConfig({
      ...productionEnvironment,
      JWT_SECRET: jwtSecret,
    });

    expect(() => validateRuntimeConfig(runtimeConfig)).toThrow('JWT_SECRET must be at least');
  });

  test('does not include a rejected secret value in an error', () => {
    const rejectedSecret = 'private-too-short';
    const runtimeConfig = createConfig({
      ...productionEnvironment,
      JWT_SECRET: rejectedSecret,
    });

    let validationError;
    try {
      validateRuntimeConfig(runtimeConfig);
    } catch (error) {
      validationError = error;
    }

    expect(validationError).toBeInstanceOf(Error);
    expect(validationError.message).not.toContain(rejectedSecret);
  });

  test('requires DATABASE_URL and JWT_SECRET in every runtime', () => {
    expect(() => validateDatabaseConfig(createConfig({ JWT_SECRET: 'local-secret' })))
      .toThrow('DATABASE_URL is required');
    expect(() => validateRuntimeConfig(createConfig({ DATABASE_URL: developmentEnvironment.DATABASE_URL })))
      .toThrow('JWT_SECRET is required');
  });

  test.each([
    ['not a URL', 'valid PostgreSQL URL'],
    ['https://database.example.test/examapp', 'PostgreSQL URL scheme'],
    [
      'postgresql://database.example.test/examapp?sslmode=no-verify',
      'must not contain TLS options',
    ],
    [
      'postgresql://database.example.test/examapp?SSLMODE=require',
      'must not contain TLS options',
    ],
  ])('rejects malformed DATABASE_URL configuration', (databaseUrl, expectedMessage) => {
    const runtimeConfig = createConfig({
      ...developmentEnvironment,
      DATABASE_URL: databaseUrl,
    });

    expect(() => validateDatabaseConfig(runtimeConfig)).toThrow(expectedMessage);
  });

  test('accepts ordinary non-TLS PostgreSQL URL parameters', () => {
    const runtimeConfig = createConfig({
      ...developmentEnvironment,
      DATABASE_URL: 'postgresql://database.example.test/examapp?application_name=examapp&connect_timeout=5',
    });

    expect(() => validateDatabaseConfig(runtimeConfig)).not.toThrow();
  });

  test('does not reveal a malformed DATABASE_URL or its credentials', () => {
    const databaseUrl = 'https://private-user:private-password@database.example.test/examapp';
    const runtimeConfig = createConfig({
      ...developmentEnvironment,
      DATABASE_URL: databaseUrl,
    });

    let validationError;
    try {
      validateDatabaseConfig(runtimeConfig);
    } catch (error) {
      validationError = error;
    }

    expect(validationError).toBeInstanceOf(Error);
    expect(validationError.message).toContain('DATABASE_URL');
    expect(validationError.message).not.toContain(databaseUrl);
    expect(validationError.message).not.toContain('private-password');
  });

  test('requires an explicit DB_SSL decision in production', () => {
    const runtimeConfig = createConfig({
      ...productionEnvironment,
      DB_SSL: undefined,
    });

    expect(() => validateRuntimeConfig(runtimeConfig)).toThrow('DB_SSL is required in production');
  });

  test.each([
    ['DB_SSL', 'yes'],
    ['DB_SSL_REJECT_UNAUTHORIZED', '0'],
    ['DB_SSL_REJECT_UNAUTHORIZED', 'TRUE'],
  ])('rejects malformed Boolean configuration for %s', (name, value) => {
    expect(() => createConfig({
      ...developmentEnvironment,
      [name]: value,
    })).toThrow(`${name} must be either "true" or "false"`);
  });

  test('parses valid explicit Boolean TLS values', () => {
    expect(createConfig({
      ...developmentEnvironment,
      DB_SSL: 'true',
      DB_SSL_REJECT_UNAUTHORIZED: 'false',
    })).toMatchObject({
      dbSsl: true,
      dbSslRejectUnauthorized: false,
    });
  });

  test.each(['not-a-port', '0', '65536'])('rejects a malformed PORT value: %s', (port) => {
    expect(() => createConfig({
      ...developmentEnvironment,
      PORT: port,
    })).toThrow('PORT must be an integer between 1 and 65535');
  });
});
