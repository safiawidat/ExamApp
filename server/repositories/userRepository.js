import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';

const publicUserColumns = 'id, username, role, created_at';

export async function findByUsername(username) {
  const result = await pool.query(
    `SELECT ${publicUserColumns}, password_hash
     FROM users
     WHERE username = $1`,
    [username],
  );

  return result.rows[0] || null;
}

export async function findPublicById(id) {
  const result = await pool.query(
    `SELECT ${publicUserColumns}
     FROM users
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

export async function createStudent({ username, passwordHash }) {
  try {
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, 'student')
       RETURNING ${publicUserColumns}`,
      [username, passwordHash],
    );

    return result.rows[0];
  } catch (error) {
    if (error?.code === '23505') {
      throw new HttpError(409, 'Username is already registered.');
    }

    throw error;
  }
}

export async function upsertLecturer({ username, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'lecturer')
     ON CONFLICT (username) DO UPDATE
     SET password_hash = EXCLUDED.password_hash
     WHERE users.role = 'lecturer'
     RETURNING ${publicUserColumns}`,
    [username, passwordHash],
  );

  if (!result.rows[0]) {
    throw new HttpError(
      409,
      'Lecturer seed cannot use a student account.',
    );
  }

  return result.rows[0];
}
