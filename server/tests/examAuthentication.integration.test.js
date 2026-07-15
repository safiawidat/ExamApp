import jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  expect,
  test,
  vi,
} from 'vitest';
import {
  cleanTestRecords,
  loadTestApplication,
  username,
} from './testDatabase.js';

vi.mock('../repositories/userRepository.js', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    findPublicById: vi.fn(actual.findPublicById),
  };
});

let app;
let pool;
let findPublicById;
let lecturerId;

beforeAll(async () => {
  ({ app, pool } = await loadTestApplication());
  ({ findPublicById } = await import('../repositories/userRepository.js'));

  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'lecturer')
     RETURNING id`,
    [username('single_exam_auth'), 'test-only-unused-password-hash'],
  );
  lecturerId = result.rows[0].id;
});

afterAll(async () => {
  if (pool) {
    try {
      await cleanTestRecords(pool);
    } finally {
      await pool.end();
    }
  }
});

test('authenticates an exam request exactly once', async () => {
  const token = jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(lecturerId),
    expiresIn: '1h',
  });
  findPublicById.mockClear();

  const response = await request(app)
    .get('/api/exams')
    .set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(findPublicById).toHaveBeenCalledTimes(1);
  expect(findPublicById).toHaveBeenCalledWith(lecturerId);
});
