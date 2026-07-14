const DEFAULT_API_BASE_URL = 'http://localhost:3001/api';

export const AUTH_TOKEN_KEY = 'examapp.authToken';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = (configuredBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const readStoredToken = () => {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
};

const parseResponseBody = async (response) => {
  const body = await response.text();

  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError(response.status, 'The server returned an invalid response.');
  }
};

export const apiRequest = async (path, { auth = false, body, ...options } = {}) => {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (auth) {
    const token = readStoredToken();

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, '')}`, {
      ...options,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Unable to reach the server. Please try again.');
  }

  const data = await parseResponseBody(response);

  if (!response.ok) {
    const serverMessage = data && typeof data.error === 'string'
      ? data.error
      : 'The request could not be completed. Please try again.';

    throw new ApiError(response.status, serverMessage);
  }

  return data;
};
