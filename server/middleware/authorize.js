import { HttpError } from './errorHandler.js';

export function authorize(...permittedRoles) {
  return (request, response, next) => {
    if (!request.user) {
      return next(new HttpError(401, 'Authentication required.'));
    }

    if (!permittedRoles.includes(request.user.role)) {
      return next(new HttpError(403, 'Access forbidden.'));
    }

    return next();
  };
}
