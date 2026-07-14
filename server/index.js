import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { examRepository } from './repositories/examRepository.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (request, response) => {
  response.json({
    status: 'ok',
    dataSource: config.dataSource,
  });
});

app.get('/api/exams', async (request, response, next) => {
  try {
    const exams = await examRepository.getAll();
    response.json(exams);
  } catch (error) {
    next(error);
  }
});

app.post('/api/exams', async (request, response, next) => {
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
});

app.use((error, request, response, next) => {
  console.error(error);
  response.status(500).json({ error: 'Internal server error.' });
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
