export const mockExams = [
  {
    id: 'math101',
    title: 'Mathematics Basic Algebra',
    questions: [
      { id: 1, question: 'What is 2 + 2?', options: ['3', '4', '5'], answer: '4' },
      { id: 2, question: 'Solve for x: x - 5 = 10', options: ['5', '10', '15'], answer: '15' }
    ]
  },
  {
    id: 'sci202',
    title: 'General Science Quiz',
    questions: [
      { id: 1, question: 'What planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter'], answer: 'Mars' },
      { id: 2, question: 'What is the chemical symbol for water?', options: ['H2O', 'CO2', 'O2'], answer: 'H2O' }
    ]
  }
];

export const mockScores = [
  { studentName: 'Alice Johnson', examId: 'math101', score: 90 },
  { studentName: 'Bob Smith', examId: 'sci202', score: 75 }
];
