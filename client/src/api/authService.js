import { apiRequest, AUTH_TOKEN_KEY, ApiError } from './apiClient';

const validRoles = new Set(['student', 'lecturer']);

const validateUser = (user) => {
  const isValid = user
    && (typeof user.id === 'number' || typeof user.id === 'string')
    && user.id !== ''
    && typeof user.username === 'string'
    && user.username.trim() !== ''
    && validRoles.has(user.role);

  if (!isValid) {
    throw new ApiError(500, 'The server returned an invalid authentication response.');
  }

  return user;
};

const validateAuthResponse = (data) => {
  if (!data || typeof data.token !== 'string' || data.token.trim() === '') {
    throw new ApiError(500, 'The server returned an invalid authentication response.');
  }

  return {
    token: data.token,
    user: validateUser(data.user),
  };
};

const storeToken = (token) => {
  try {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    throw new ApiError(0, 'Unable to save the session in this browser.');
  }
};

export const getStoredToken = () => {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const login = async ({ username, password }) => {
  const result = validateAuthResponse(await apiRequest('/auth/login', {
    method: 'POST',
    body: { username, password },
  }));

  storeToken(result.token);
  return result.user;
};

export const registerStudent = async ({ username, password }) => {
  const result = validateAuthResponse(await apiRequest('/auth/register', {
    method: 'POST',
    body: { username, password },
  }));

  storeToken(result.token);
  return result.user;
};

export const getCurrentUser = async () => {
  const data = await apiRequest('/auth/me', { auth: true });
  return validateUser(data?.user);
};

export const logout = () => {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // React state is still cleared by App when browser storage is unavailable.
  }
};
