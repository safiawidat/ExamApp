import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { accessRoutes } from './routes/accessRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { examRoutes } from './routes/examRoutes.js';
import { examTypeRoutes } from './routes/examTypeRoutes.js';

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
app.use('/api/exam-types', examTypeRoutes);
app.use('/api/exams', examRoutes);
app.use(accessRoutes);

app.use(errorHandler);
