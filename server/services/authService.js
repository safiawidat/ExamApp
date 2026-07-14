import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  createStudent,
  findByUsername,
} from '../repositories/userRepository.js';

const bcryptCost = 12;
const invalidCredentials = () => new HttpError(401, 'Invalid username or password.');

export function normalizeAndValidateUsername(username) {
  if (typeof username !== 'string') {
    throw new HttpError(400, 'Username is required.');
  }

  const normalizedUsername = username.trim().toLowerCase();

  if (!normalizedUsername) {
    throw new HttpError(400, 'Username is required.');
  }

  if (normalizedUsername.length > 80) {
    throw new HttpError(400, 'Username must be at most 80 characters.');
  }

  return normalizedUsername;
}

export function validatePassword(password) {
  if (typeof password !== 'string') {
    throw new HttpError(400, 'Password is required.');
  }

  if (password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters.');
  }

  if (password.length > 128) {
    throw new HttpError(400, 'Password must be at most 128 characters.');
  }

  return password;
}

function validateLoginPassword(password) {
  if (typeof password !== 'string') {
    throw new HttpError(400, 'Password is required.');
  }

  if (password.length > 128) {
    throw invalidCredentials();
  }

  return password;
}

export function hashPassword(password) {
  return bcrypt.hash(password, bcryptCost);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    created_at: user.created_at,
  };
}

function signToken(userId) {
  return jwt.sign({}, config.jwtSecret, {
    subject: String(userId),
    expiresIn: config.jwtExpiresIn,
  });
}

export async function register(payload) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'role')) {
    throw new HttpError(400, 'Role cannot be supplied during registration.');
  }

  const username = normalizeAndValidateUsername(payload?.username);
  const password = validatePassword(payload?.password);
  const passwordHash = await hashPassword(password);
  const user = await createStudent({ username, passwordHash });

  return {
    token: signToken(user.id),
    user,
  };
}

export async function login(payload) {
  const username = normalizeAndValidateUsername(payload?.username);
  const password = validateLoginPassword(payload?.password);
  const user = await findByUsername(username);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw invalidCredentials();
  }

  const safeUser = publicUser(user);

  return {
    token: signToken(safeUser.id),
    user: safeUser,
  };
}
