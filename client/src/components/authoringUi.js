import { ApiError } from '../api/apiClient';

export const safeApiMessage = (error, fallback) => (
  error instanceof ApiError && typeof error.message === 'string' && error.message.trim()
    ? error.message
    : fallback
);

export const normalizeDescription = (value) => value.trim() || null;
