import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { accessRoutes } from './routes/accessRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { examTypeRoutes } from './routes/examTypeRoutes.js';
import { lecturerExamRoutes } from './routes/lecturerExamRoutes.js';
import { questionRoutes } from './routes/questionRoutes.js';

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
app.use('/api/exams', questionRoutes);
app.use('/api/exams', lecturerExamRoutes);
app.use(accessRoutes);

app.use(errorHandler);
