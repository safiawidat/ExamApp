import {
  login,
  register,
} from '../services/authService.js';

export async function registerUser(request, response, next) {
  try {
    const result = await register(request.body);
    return response.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function loginUser(request, response, next) {
  try {
    const result = await login(request.body);
    return response.json(result);
  } catch (error) {
    return next(error);
  }
}

export function getCurrentUser(request, response) {
  return response.json({ user: request.user });
}
