import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { findPublicById } from '../repositories/userRepository.js';
import { HttpError } from './errorHandler.js';

const unauthorized = () => new HttpError(401, 'Authentication required.');

export async function authenticate(request, response, next) {
  const authorization = request.get('authorization');

  if (!authorization) {
    return next(unauthorized());
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorization);

  if (!match) {
    return next(unauthorized());
  }

  let payload;

  try {
    payload = jwt.verify(match[1], config.jwtSecret);
  } catch {
    return next(unauthorized());
  }

  const userId = Number(payload.sub);

  if (!Number.isSafeInteger(userId) || userId < 1) {
    return next(unauthorized());
  }

  try {
    const user = await findPublicById(userId);

    if (!user) {
      return next(unauthorized());
    }

    request.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}
