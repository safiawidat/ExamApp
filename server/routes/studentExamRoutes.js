import { Router } from 'express';
import {
  getStudentExamById,
  getStudentExams,
} from '../controllers/studentExamController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export const studentExamRoutes = Router();

studentExamRoutes.use(authenticate, authorize('student'));
studentExamRoutes.get('/', getStudentExams);
studentExamRoutes.get('/:id', getStudentExamById);
