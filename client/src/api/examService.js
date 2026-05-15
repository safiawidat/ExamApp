import { mockExams } from './mockDb';

export const getAllExams = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([...mockExams]);
    }, 800);
  });
};

export const getExamById = (id) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const exam = mockExams.find((e) => e.id === id);
      if (exam) {
        resolve(exam);
      } else {
        reject(new Error('Exam not found'));
      }
    }, 600);
  });
};

export const createExam = (exam) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      mockExams.push(exam);
      resolve(exam);
    }, 1000);
  });
};
