import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  cleanTestRecords,
  loadTestApplication,
  username,
} from './testDatabase.js';

const password = 'Test-only password 42!';
const replacementPassword = 'Replacement test password 84!';
const genericCredentialError = { error: 'Invalid username or password.' };
const apiBodies = [];
const createdExamIds = [];

let app;
let pool;
let authService;
let userRepository;

const record = (response) => {
  apiBodies.push(response.body);
  return response;
};

const registerStudent = async (label) => {
  const response = record(await request(app)
    .post('/api/auth/register')
    .send({ username: username(label), password }));
  expect(response.status).toBe(201);
  return response;
};

const seedLecturer = async (label, lecturerPassword = password) => {
  const normalizedUsername = authService.normalizeAndValidateUsername(username(label));
  const validatedPassword = authService.validatePassword(lecturerPassword);
  const passwordHash = await authService.hashPassword(validatedPassword);
  return userRepository.upsertLecturer({ username: normalizedUsername, passwordHash });
};

const login = async (loginUsername, loginPassword = password) => record(
  await request(app)
    .post('/api/auth/login')
    .send({ username: loginUsername, password: loginPassword }),
);

const containsPasswordHash = (value) => {
  if (Array.isArray(value)) {
    return value.some(containsPasswordHash);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, nested]) => (
      key === 'password_hash' || containsPasswordHash(nested)
    ));
  }
  return false;
};

beforeAll(async () => {
  ({ app, pool } = await loadTestApplication());
  [authService, userRepository] = await Promise.all([
    import('../services/authService.js'),
    import('../repositories/userRepository.js'),
  ]);
});

afterAll(async () => {
  if (pool) {
    try {
      await cleanTestRecords(pool, createdExamIds);
    } finally {
      await pool.end();
    }
  }
});

describe('registration', () => {
  test('creates a student with a hashed password and a safe 201 response', async () => {
    const response = await registerStudent('registration');
    expect(response.body.user).toMatchObject({
      username: username('registration'),
      role: 'student',
    });
    expect(response.body).not.toHaveProperty('password_hash');
    expect(response.body.user).not.toHaveProperty('password_hash');

    const stored = await userRepository.findByUsername(username('registration'));
    expect(stored.password_hash).not.toBe(password);
    expect(await bcrypt.compare(password, stored.password_hash)).toBe(true);
  });

  test('rejects a duplicate username', async () => {
    await registerStudent('duplicate');
    const response = record(await request(app)
      .post('/api/auth/register')
      .send({ username: username('duplicate'), password }));
    expect(response.status).toBe(409);
  });

  test('rejects a client-supplied role', async () => {
    const response = record(await request(app)
      .post('/api/auth/register')
      .send({ username: username('role_field'), password, role: 'lecturer' }));
    expect(response.status).toBe(400);
  });

  test('rejects a password shorter than eight characters', async () => {
    const response = record(await request(app)
      .post('/api/auth/register')
      .send({ username: username('short_registration'), password: 'short' }));
    expect(response.status).toBe(400);
  });
});

describe('login', () => {
  test('returns a JWT and safe user for valid credentials', async () => {
    await registerStudent('login');
    const response = await login(username('login'));
    expect(response.status).toBe(200);
    expect(typeof response.body.token).toBe('string');
    expect(response.body.token.length).toBeGreaterThan(0);
    expect(response.body.user).toMatchObject({ username: username('login'), role: 'student' });
    expect(response.body.user).not.toHaveProperty('password_hash');
  });

  test('uses the same generic response for short, normal, and unknown invalid credentials', async () => {
    await registerStudent('invalid_login');
    const responses = await Promise.all([
      login(username('invalid_login'), 'bad'),
      login(username('invalid_login'), 'Wrong normal password 19!'),
      login(username('unknown_login'), password),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual(genericCredentialError);
    }
  });
});

describe('authentication', () => {
  test('rejects missing, malformed, invalid, and expired bearer credentials', async () => {
    const expiredToken = jwt.sign({}, process.env.JWT_SECRET, {
      subject: '1',
      expiresIn: -1,
    });
    const responses = [
      await request(app).get('/api/auth/me'),
      await request(app).get('/api/auth/me').set('Authorization', 'Token malformed'),
      await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt'),
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`),
    ].map(record);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required.' });
    }
  });

  test('returns the current student for a valid token', async () => {
    const registration = await registerStudent('current_user');
    const response = record(await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registration.body.token}`));
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      username: username('current_user'),
      role: 'student',
    });
  });

  test('rejects a valid token after its user is deleted', async () => {
    const registration = await registerStudent('deleted_user');
    await pool.query('DELETE FROM users WHERE username = $1', [username('deleted_user')]);
    const response = record(await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registration.body.token}`));
    expect(response.status).toBe(401);
  });
});

describe('role authorization', () => {
  test('allows students only through the student boundary', async () => {
    const registration = await registerStudent('student_access');
    const authorization = `Bearer ${registration.body.token}`;
    const allowed = record(await request(app)
      .get('/api/student/access').set('Authorization', authorization));
    const forbidden = record(await request(app)
      .get('/api/lecturer/access').set('Authorization', authorization));
    expect(allowed.status).toBe(200);
    expect(forbidden.status).toBe(403);
  });

  test('allows lecturers only through the lecturer boundary', async () => {
    await seedLecturer('lecturer_access');
    const session = await login(username('lecturer_access'));
    const authorization = `Bearer ${session.body.token}`;
    const allowed = record(await request(app)
      .get('/api/lecturer/access').set('Authorization', authorization));
    const forbidden = record(await request(app)
      .get('/api/student/access').set('Authorization', authorization));
    expect(allowed.status).toBe(200);
    expect(forbidden.status).toBe(403);
  });
});

describe('lecturer seeding behavior', () => {
  test('creates a lecturer and reseeding changes its password without duplication', async () => {
    const first = await seedLecturer('seeded');
    const originalHash = (await userRepository.findByUsername(username('seeded'))).password_hash;
    const second = await seedLecturer('seeded', replacementPassword);
    const rows = await pool.query(
      'SELECT id, role, password_hash FROM users WHERE username = $1',
      [username('seeded')],
    );
    expect(first.id).toBe(second.id);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].role).toBe('lecturer');
    expect(rows.rows[0].password_hash).not.toBe(originalHash);
    expect(await bcrypt.compare(replacementPassword, rows.rows[0].password_hash)).toBe(true);
  });

  test('cannot promote a student or alter its identity, role, or password hash', async () => {
    const registration = await registerStudent('seed_collision');
    const before = await userRepository.findByUsername(username('seed_collision'));
    await expect(seedLecturer('seed_collision', replacementPassword))
      .rejects.toMatchObject({ status: 409 });
    const after = await userRepository.findByUsername(username('seed_collision'));
    expect(after).toMatchObject({
      id: registration.body.user.id,
      username: before.username,
      role: before.role,
      password_hash: before.password_hash,
    });
  });
});

describe('existing exam boundaries', () => {
  test('requires authentication to list exams and permits a student to list them', async () => {
    const missing = record(await request(app).get('/api/exams'));
    const registration = await registerStudent('exam_student');
    const allowed = record(await request(app)
      .get('/api/exams')
      .set('Authorization', `Bearer ${registration.body.token}`));
    expect(missing.status).toBe(401);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body)).toBe(true);
  });

  test('rejects student exam creation and permits valid lecturer creation', async () => {
    const student = await registerStudent('exam_create_student');
    const forbidden = record(await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${student.body.token}`)
      .send({ title: 'Test-only forbidden exam' }));
    expect(forbidden.status).toBe(403);

    await seedLecturer('exam_lecturer');
    const lecturer = await login(username('exam_lecturer'));
    const created = record(await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${lecturer.body.token}`)
      .send({ title: 'Test-only integration exam', description: 'Created by Vitest.' }));

    if (Number.isSafeInteger(created.body.id) && created.body.id > 0) {
      createdExamIds.push(created.body.id);
    }

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      title: 'Test-only integration exam',
      status: 'draft',
    });
  });
});

test('no recorded successful or failed API response exposes password_hash', () => {
  expect(apiBodies.length).toBeGreaterThan(0);
  expect(apiBodies.some(containsPasswordHash)).toBe(false);
});
