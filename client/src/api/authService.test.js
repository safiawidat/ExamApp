import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AUTH_TOKEN_KEY, ApiError, apiRequest } from './apiClient';
import {
  getCurrentUser,
  login,
  logout,
  registerStudent,
} from './authService';

vi.mock('./apiClient', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: vi.fn(),
}));

const student = { id: 101, username: 'test_student', role: 'student' };
const token = 'test-only-jwt-placeholder';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('login', () => {
  test('stores only the returned JWT after a successful login', async () => {
    apiRequest.mockResolvedValue({ token, user: student });
    await expect(login({ username: student.username, password: 'Test password 42!' }))
      .resolves.toEqual(student);
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe(token);
    expect(sessionStorage.length).toBe(1);
  });

  test('stores no JWT when login fails', async () => {
    apiRequest.mockRejectedValue(new ApiError(401, 'Invalid username or password.'));
    await expect(login({ username: student.username, password: 'Wrong password 42!' }))
      .rejects.toThrow('Invalid username or password.');
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });
});

describe('registration', () => {
  test('sends username and password without a role and stores the JWT', async () => {
    apiRequest.mockResolvedValue({ token, user: student });
    await registerStudent({ username: student.username, password: 'Test password 42!' });
    expect(apiRequest).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      body: { username: student.username, password: 'Test password 42!' },
    });
    expect(apiRequest.mock.calls[0][1].body).not.toHaveProperty('role');
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe(token);
  });
});

describe('session validation', () => {
  test('getCurrentUser returns a valid server user', async () => {
    apiRequest.mockResolvedValue({ user: student });
    await expect(getCurrentUser()).resolves.toEqual(student);
    expect(apiRequest).toHaveBeenCalledWith('/auth/me', { auth: true });
  });

  test.each([
    { token: '', user: student },
    { token, user: { ...student, role: 'administrator' } },
    { token, user: { ...student, username: '' } },
  ])('rejects an invalid authentication response', async (response) => {
    apiRequest.mockResolvedValue(response);
    await expect(login({ username: student.username, password: 'Test password 42!' }))
      .rejects.toThrow('invalid authentication response');
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  test('logout removes only the authentication token', () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    sessionStorage.setItem('unrelated.preference', 'keep-me');
    logout();
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem('unrelated.preference')).toBe('keep-me');
  });
});
