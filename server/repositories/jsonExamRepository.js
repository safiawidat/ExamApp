import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const examsFile = fileURLToPath(new URL('../data/exams.json', import.meta.url));

export class JsonExamRepository {
  async getAll() {
    const contents = await readFile(examsFile, 'utf8');
    return JSON.parse(contents);
  }

  async create({ title, description }) {
    const exams = await this.getAll();
    const maximumId = exams.reduce((maximum, exam) => {
      return Math.max(maximum, Number(exam.id) || 0);
    }, 0);

    const exam = {
      id: maximumId + 1,
      title,
      description,
      status: 'draft',
    };

    exams.push(exam);
    await writeFile(examsFile, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');

    return exam;
  }
}
