import { Router } from 'express';
import {
  createLecturerExam,
  destroyLecturerExam,
  getLecturerExamById,
  getLecturerExams,
  patchLecturerExam,
  publishLecturerExam,
} from '../controllers/lecturerExamController.js';
import {
  createQuestion,
  destroyQuestion,
  getQuestions,
  patchQuestion,
  putQuestionOrder,
} from '../controllers/questionController.js';
import {
  destroyQuestionNotice,
  getQuestionNotice,
  putQuestionNotice,
} from '../controllers/questionNoticeController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export const examRoutes = Router();

examRoutes.use(authenticate, authorize('lecturer'));
examRoutes.get('/', getLecturerExams);
examRoutes.post('/', createLecturerExam);
examRoutes.get('/:id', getLecturerExamById);
examRoutes.post('/:id/publish', publishLecturerExam);
examRoutes.patch('/:id', patchLecturerExam);
examRoutes.delete('/:id', destroyLecturerExam);
examRoutes.get('/:examId/questions', getQuestions);
examRoutes.post('/:examId/questions', createQuestion);
examRoutes.put('/:examId/questions/reorder', putQuestionOrder);
examRoutes.get('/:examId/questions/:questionId/notice', getQuestionNotice);
examRoutes.put('/:examId/questions/:questionId/notice', putQuestionNotice);
examRoutes.delete('/:examId/questions/:questionId/notice', destroyQuestionNotice);
examRoutes.patch('/:examId/questions/:questionId', patchQuestion);
examRoutes.delete('/:examId/questions/:questionId', destroyQuestion);
