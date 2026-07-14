import { Router } from 'express';
import {
  createLecturerExam,
  destroyLecturerExam,
  getLecturerExamById,
  getLecturerExams,
  patchLecturerExam,
} from '../controllers/lecturerExamController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export const lecturerExamRoutes = Router();

lecturerExamRoutes.use(authenticate, authorize('lecturer'));
lecturerExamRoutes.get('/', getLecturerExams);
lecturerExamRoutes.post('/', createLecturerExam);
lecturerExamRoutes.get('/:id', getLecturerExamById);
lecturerExamRoutes.patch('/:id', patchLecturerExam);
lecturerExamRoutes.delete('/:id', destroyLecturerExam);
