export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function errorHandler(error, request, response, next) {
  if (error instanceof HttpError) {
    return response.status(error.status).json({ error: error.message });
  }

  if (error?.code === '23505' && error?.constraint === 'users_username_key') {
    return response.status(409).json({ error: 'Username is already registered.' });
  }

  if (error?.status === 400) {
    return response.status(400).json({ error: 'Invalid JSON payload.' });
  }

  console.error('Unexpected server error.', {
    name: error?.name,
    code: error?.code,
  });

  return response.status(500).json({ error: 'Internal server error.' });
}
