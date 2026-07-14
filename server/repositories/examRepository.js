import { config } from '../config.js';
import { JsonExamRepository } from './jsonExamRepository.js';
import { PostgresExamRepository } from './postgresExamRepository.js';

const repositories = {
  json: () => new JsonExamRepository(),
  postgres: () => new PostgresExamRepository(),
};

export const examRepository = repositories[config.dataSource]();
