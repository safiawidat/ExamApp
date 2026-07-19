import request from 'supertest';
import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { createApp } from '../app.js';

const configuredOrigin = 'https://client.example.test';

const createTestApplication = (query = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })) => ({
  app: createApp({
    clientOrigin: configuredOrigin,
    databasePool: { query },
  }),
  query,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CORS', () => {
  test('accepts only the configured browser origin', async () => {
    const { app } = createTestApplication();
    const response = await request(app)
      .get('/api/health')
      .set('Origin', configuredOrigin);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(configuredOrigin);
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  test('does not grant CORS access to an unrelated origin', async () => {
    const { app } = createTestApplication();
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://unrelated.example.test');

    expect(response.status).toBe(200);
    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    expect(response.body).toEqual({ status: 'ok' });
    expect(JSON.stringify(response.body)).not.toMatch(/origin|config|stack|internal/i);
  });

  test('allows ordinary requests without an Origin header', async () => {
    const { app } = createTestApplication();
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
  });

  test('supports authorization headers for the configured origin', async () => {
    const { app } = createTestApplication();
    const response = await request(app)
      .options('/api/auth/me')
      .set('Origin', configuredOrigin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(configuredOrigin);
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
  });

  test('does not grant CORS access or expose details on an unrelated preflight', async () => {
    const { app } = createTestApplication();
    const response = await request(app)
      .options('/api/auth/me')
      .set('Origin', 'https://unrelated.example.test')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.status).toBe(200);
    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    expect(response.headers).not.toHaveProperty('access-control-allow-credentials');
    expect(response.text).not.toMatch(/origin|config|stack|internal/i);
  });
});

describe('database health', () => {
  test('returns healthy only after a minimal read-only database query succeeds', async () => {
    const { app, query } = createTestApplication();
    const response = await request(app).get('/api/health');

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('returns a safe 503 response when the database query fails', async () => {
    const databaseError = Object.assign(
      new Error('password authentication failed for postgresql://private-connection'),
      { code: '28P01' },
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, query } = createTestApplication(vi.fn().mockRejectedValue(databaseError));
    const response = await request(app).get('/api/health');

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(response.body)).not.toContain(databaseError.message);
    expect(JSON.stringify(response.body)).not.toContain('28P01');
    expect(consoleError).toHaveBeenCalledWith(
      'Database health check failed.',
      { name: 'Error', code: '28P01' },
    );
  });
});

describe('application initialization', () => {
  test('preserves the authentication boundary on mounted protected routes', async () => {
    const { app } = createTestApplication();
    const responses = await Promise.all([
      request(app).get('/api/auth/me'),
      request(app).get('/api/exams'),
      request(app).get('/api/student/exams'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required.' });
    }
  });
});
