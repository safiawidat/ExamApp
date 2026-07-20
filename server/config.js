import 'dotenv/config';

const DEFAULT_CLIENT_ORIGIN = 'http://localhost:5173';
const MINIMUM_PRODUCTION_JWT_SECRET_LENGTH = 32;
const DATABASE_URL_TLS_PARAMETERS = new Set([
  'ssl',
  'sslcert',
  'sslkey',
  'sslmode',
  'sslnegotiation',
  'sslrootcert',
  'uselibpqcompat',
]);
const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'changeme',
  'jwt-secret',
  'password',
  'placeholder',
  'replace-me',
  'secret',
  'your-jwt-secret',
]);

const parseBoolean = (name, value, defaultValue) => {
  if (value === undefined) {
    return defaultValue;
  }

  if (!['true', 'false'].includes(value)) {
    throw new Error(`${name} must be either "true" or "false".`);
  }

  return value === 'true';
};

const parsePort = (value) => {
  if (value === undefined || value.trim() === '') {
    return 3001;
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const port = Number(value);

  if (port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
};

const isLocalHostname = (hostname) => {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');

  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
    || normalized === '0.0.0.0'
    || normalized === '[::1]';
};

const parseClientOrigin = (value, { isProduction }) => {
  if (!value) {
    return isProduction ? undefined : DEFAULT_CLIENT_ORIGIN;
  }

  let parsedOrigin;

  try {
    parsedOrigin = new URL(value);
  } catch {
    throw new Error('CLIENT_ORIGIN must be an absolute HTTP(S) origin.');
  }

  if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
    throw new Error('CLIENT_ORIGIN must use http:// or https://.');
  }

  if (parsedOrigin.username || parsedOrigin.password) {
    throw new Error('CLIENT_ORIGIN must not contain credentials.');
  }

  if (parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
    throw new Error('CLIENT_ORIGIN must not contain a path, query, or fragment.');
  }

  if (isProduction
    && parsedOrigin.protocol !== 'https:'
    && !isLocalHostname(parsedOrigin.hostname)) {
    throw new Error('CLIENT_ORIGIN must use https:// for non-local production origins.');
  }

  return parsedOrigin.origin;
};

const validateProductionJwtSecret = (jwtSecret) => {
  const normalizedSecret = jwtSecret.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isObviousPlaceholder = PLACEHOLDER_SECRETS.has(jwtSecret.toLowerCase())
    || normalizedSecret.includes('placeholder')
    || normalizedSecret.startsWith('example')
    || normalizedSecret.startsWith('replaceme')
    || normalizedSecret.startsWith('replacewith')
    || normalizedSecret.startsWith('sample')
    || normalizedSecret === 'yourjwtsecret';

  if (jwtSecret.length < MINIMUM_PRODUCTION_JWT_SECRET_LENGTH
    || isObviousPlaceholder) {
    throw new Error(
      `JWT_SECRET must be at least ${MINIMUM_PRODUCTION_JWT_SECRET_LENGTH} characters and not a placeholder in production.`,
    );
  }
};

export function createConfig(environment = process.env) {
  const nodeEnv = environment.NODE_ENV?.trim() || 'development';
  const isProduction = nodeEnv === 'production';
  const rawClientOrigin = environment.CLIENT_ORIGIN?.trim();
  const rawDatabaseUrl = environment.DATABASE_URL?.trim();
  const rawJwtSecret = environment.JWT_SECRET?.trim();

  return {
    port: parsePort(environment.PORT),
    nodeEnv,
    databaseUrl: rawDatabaseUrl || undefined,
    dbSsl: parseBoolean('DB_SSL', environment.DB_SSL, false),
    dbSslExplicit: environment.DB_SSL !== undefined,
    dbSslRejectUnauthorized: parseBoolean(
      'DB_SSL_REJECT_UNAUTHORIZED',
      environment.DB_SSL_REJECT_UNAUTHORIZED,
      true,
    ),
    jwtSecret: rawJwtSecret || undefined,
    jwtExpiresIn: environment.JWT_EXPIRES_IN || '1h',
    clientOrigin: parseClientOrigin(rawClientOrigin, { isProduction }),
    seedLecturerUsername: environment.SEED_LECTURER_USERNAME,
    seedLecturerPassword: environment.SEED_LECTURER_PASSWORD,
  };
}

export const config = createConfig();

export function validateDatabaseConfig(runtimeConfig = config) {
  if (!runtimeConfig.databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  let parsedDatabaseUrl;

  try {
    parsedDatabaseUrl = new URL(runtimeConfig.databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use a PostgreSQL URL scheme.');
  }

  const hasTlsParameter = [...parsedDatabaseUrl.searchParams.keys()]
    .some((name) => DATABASE_URL_TLS_PARAMETERS.has(name.toLowerCase()));

  if (hasTlsParameter) {
    throw new Error(
      'DATABASE_URL must not contain TLS options; use DB_SSL and DB_SSL_REJECT_UNAUTHORIZED.',
    );
  }
}

export function validateRuntimeConfig(runtimeConfig = config) {
  validateDatabaseConfig(runtimeConfig);

  if (!runtimeConfig.jwtSecret) {
    throw new Error('JWT_SECRET is required.');
  }

  if (runtimeConfig.nodeEnv !== 'production') {
    return;
  }

  if (!runtimeConfig.clientOrigin) {
    throw new Error('CLIENT_ORIGIN is required in production.');
  }

  if (!runtimeConfig.dbSslExplicit) {
    throw new Error('DB_SSL is required in production to make the database TLS decision explicit.');
  }

  validateProductionJwtSecret(runtimeConfig.jwtSecret);
}
