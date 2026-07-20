import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { errorHandler } from './middleware/errorHandler.js';
import { accessRoutes } from './routes/accessRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { examRoutes } from './routes/examRoutes.js';
import { examTypeRoutes } from './routes/examTypeRoutes.js';
import { studentExamRoutes } from './routes/studentExamRoutes.js';

export const createApp = ({
  clientOrigin = config.clientOrigin,
  databasePool = pool,
} = {}) => {
  const application = express();
  const corsOrigin = (requestOrigin, callback) => {
    if (!requestOrigin || requestOrigin === clientOrigin) {
      return callback(null, true);
    }

    return callback(null, false);
  };

  application.use(helmet());
  application.use(cors({ origin: corsOrigin }));
  application.use(express.json({ limit: '100kb' }));

  application.get('/api/health', async (request, response) => {
    try {
      await databasePool.query('SELECT 1');
      return response.json({ status: 'ok' });
    } catch (error) {
      console.error('Database health check failed.', {
        name: error?.name,
        code: error?.code,
      });
      return response.status(503).json({ status: 'unavailable' });
    }
  });

  application.use('/api/auth', authRoutes);
  application.use('/api/exam-types', examTypeRoutes);
  application.use('/api/exams', examRoutes);
  application.use('/api/student/exams', studentExamRoutes);
  application.use(accessRoutes);

  application.use((request, response) => (
    response.status(404).json({ error: 'Not found.' })
  ));

  application.use(errorHandler);

  return application;
};

export const app = createApp();
