// Mock API service responsible for exam operations

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

export function getSubmissions() {
  return [
    {
      id: 1,
      studentName: "Dana Cohen",
      examTitle: "React Basics",
      grade: 92,
      feedback: "Excellent work",
    },
    {
      id: 2,
      studentName: "Yossi Levi",
      examTitle: "JavaScript Exam",
      grade: 85,
      feedback: "Good job",
    },
  ];
}

export function getPublishedExams() {
  return [...mockExams];
}

export function submitExam(examId, studentAnswers) {
  console.log("Exam submitted:", {
    examId,
    studentAnswers,
  });

  return {
    success: true,
    message: "Exam submitted successfully",
  };
}

export function deleteExam(examId) {
  console.log("Deleting exam:", examId);

  return {
    success: true,
    message: "Exam deleted successfully",
  };
}

export function togglePublishExam(examId) {
  console.log("Toggle publish exam:", examId);

  return {
    success: true,
    message: "Exam publish status updated",
  };
}
