import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export const accessRoutes = Router();

accessRoutes.get(
  '/api/lecturer/access',
  authenticate,
  authorize('lecturer'),
  (request, response) => response.json({ message: 'Lecturer access granted.' }),
);

accessRoutes.get(
  '/api/student/access',
  authenticate,
  authorize('student'),
  (request, response) => response.json({ message: 'Student access granted.' }),
);
