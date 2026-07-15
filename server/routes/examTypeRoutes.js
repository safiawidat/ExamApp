import { Router } from 'express';
import {
  createExamType,
  destroyExamType,
  getExamTypes,
  patchExamType,
} from '../controllers/examTypeController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export const examTypeRoutes = Router();

examTypeRoutes.use(authenticate, authorize('lecturer'));
examTypeRoutes.get('/', getExamTypes);
examTypeRoutes.post('/', createExamType);
examTypeRoutes.patch('/:id', patchExamType);
examTypeRoutes.delete('/:id', destroyExamType);
