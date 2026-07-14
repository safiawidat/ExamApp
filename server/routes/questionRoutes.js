import { Router } from 'express';
import {
  createQuestion,
  destroyQuestion,
  getQuestions,
  patchQuestion,
  putQuestionOrder,
} from '../controllers/questionController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export const questionRoutes = Router();

questionRoutes.use(authenticate, authorize('lecturer'));
questionRoutes.get('/:examId/questions', getQuestions);
questionRoutes.post('/:examId/questions', createQuestion);
questionRoutes.put('/:examId/questions/reorder', putQuestionOrder);
questionRoutes.patch('/:examId/questions/:questionId', patchQuestion);
questionRoutes.delete('/:examId/questions/:questionId', destroyQuestion);
