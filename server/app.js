import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { authenticate } from './middleware/authenticate.js';
import { authorize } from './middleware/authorize.js';
import { errorHandler } from './middleware/errorHandler.js';
import { examRepository } from './repositories/examRepository.js';
import { accessRoutes } from './routes/accessRoutes.js';
import { authRoutes } from './routes/authRoutes.js';

export const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (request, response) => {
  response.json({
    status: 'ok',
    dataSource: config.dataSource,
  });
});

app.use('/api/auth', authRoutes);
app.use(accessRoutes);

app.get(
  '/api/exams',
  authenticate,
  authorize('student', 'lecturer'),
  async (request, response, next) => {
    try {
      const exams = await examRepository.getAll();
      return response.json(exams);
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  '/api/exams',
  authenticate,
  authorize('lecturer'),
  async (request, response, next) => {
    const title = typeof request.body.title === 'string'
      ? request.body.title.trim()
      : '';

    if (!title) {
      return response.status(400).json({ error: 'Title is required.' });
    }

    const description = typeof request.body.description === 'string'
      ? request.body.description
      : null;

    try {
      const exam = await examRepository.create({ title, description });
      return response.status(201).json(exam);
    } catch (error) {
      return next(error);
    }
  },
);

app.use(errorHandler);
