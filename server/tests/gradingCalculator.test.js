import { describe, expect, test } from 'vitest';
import {
  calculateGradeTotals,
  gradeMultipleChoiceAnswer,
  gradeTrueFalseAnswer,
  validateShortAnswerMark,
} from '../services/gradingCalculator.js';

describe('objective-answer grading', () => {
  test('grades correct, incorrect, and unanswered multiple-choice answers', () => {
    const storedOptions = [
      { id: 10, isCorrect: true },
      { id: 20, isCorrect: false },
    ];

    expect(gradeMultipleChoiceAnswer(10, storedOptions)).toBe(1);
    expect(gradeMultipleChoiceAnswer(20, storedOptions)).toBe(0);
    expect(gradeMultipleChoiceAnswer(null)).toBe(0);
    expect(gradeMultipleChoiceAnswer(undefined)).toBe(0);
  });

  test('strictly resolves the selected ID from trusted stored options', () => {
    expect(() => gradeMultipleChoiceAnswer('10', [
      { id: 10, isCorrect: true },
    ])).toThrow(TypeError);
    expect(() => gradeMultipleChoiceAnswer(10, [
      { id: '10', isCorrect: true },
    ])).toThrow('Selected option was not found in the stored options.');
    expect(() => gradeMultipleChoiceAnswer(10, [
      { id: 10, isCorrect: 'true' },
    ])).toThrow('Stored option correctness must be a Boolean.');
  });

  test('strictly grades true and false against the stored correct answer', () => {
    expect(gradeTrueFalseAnswer(true, 'true')).toBe(1);
    expect(gradeTrueFalseAnswer(false, 'false')).toBe(1);
    expect(gradeTrueFalseAnswer(true, 'false')).toBe(0);
    expect(gradeTrueFalseAnswer(false, 'true')).toBe(0);
  });

  test('treats only nullish true/false answers as unanswered', () => {
    expect(gradeTrueFalseAnswer(null, 'true')).toBe(0);
    expect(gradeTrueFalseAnswer(undefined, 'false')).toBe(0);
    expect(gradeTrueFalseAnswer(false, 'false')).toBe(1);
  });

  test('rejects invalid true/false values and stored answers', () => {
    expect(() => gradeTrueFalseAnswer(0, 'false')).toThrow(TypeError);
    expect(() => gradeTrueFalseAnswer(true, true)).toThrow(TypeError);
    expect(() => gradeTrueFalseAnswer(true, 'TRUE')).toThrow(TypeError);
  });
});

describe('short-answer mark validation', () => {
  test.each([0, 1, 0.25, 0.3333])('accepts valid mark %s', (mark) => {
    expect(validateShortAnswerMark(mark)).toBe(mark);
  });

  test.each([
    -0.01,
    1.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '0.5',
    null,
    undefined,
  ])('rejects invalid mark %s', (mark) => {
    expect(() => validateShortAnswerMark(mark)).toThrow();
  });
});

describe('grade total calculation', () => {
  test('calculates total, question-count maximum, and percentage', () => {
    expect(calculateGradeTotals({
      awardedMarks: [1, 0.5, 0],
      questionCount: 3,
    })).toEqual({
      totalAwardedPoints: 1.5,
      maximumPoints: 3,
      percentage: 50,
    });
  });

  test('rounds marks to four decimals and percentages to two decimals', () => {
    expect(calculateGradeTotals({
      awardedMarks: [0.33335, 1, 0],
      questionCount: 3,
    })).toEqual({
      totalAwardedPoints: 1.3334,
      maximumPoints: 3,
      percentage: 44.45,
    });
  });

  test('normalizes marks beyond four decimals consistently before totaling', () => {
    expect(calculateGradeTotals({
      awardedMarks: [0.123456, 0.876544],
      questionCount: 2,
    })).toEqual({
      totalAwardedPoints: 1,
      maximumPoints: 2,
      percentage: 50,
    });
  });

  test('avoids floating-point artifacts in totals', () => {
    expect(calculateGradeTotals({
      awardedMarks: [0.1, 0.2, 0.3],
      questionCount: 3,
    })).toEqual({
      totalAwardedPoints: 0.6,
      maximumPoints: 3,
      percentage: 20,
    });
  });

  test('rejects incomplete grading and invalid awarded marks', () => {
    expect(() => calculateGradeTotals({
      awardedMarks: [1, 0],
      questionCount: 3,
    })).toThrow('Every question must have exactly one awarded mark.');
    expect(() => calculateGradeTotals({
      awardedMarks: [1, undefined, 0],
      questionCount: 3,
    })).toThrow('Awarded mark must be a finite number.');
    expect(() => calculateGradeTotals({
      awardedMarks: [1, 1.1, 0],
      questionCount: 3,
    })).toThrow('Awarded mark must be between 0 and 1.');
  });

  test.each([
    { label: 'a sparse missing value', marks: [1, , 0] },
    { label: 'an explicit missing value', marks: [1, undefined, 0] },
    { label: 'a non-number value', marks: [1, '0.5', 0] },
    { label: 'NaN', marks: [1, Number.NaN, 0] },
    { label: 'positive infinity', marks: [1, Number.POSITIVE_INFINITY, 0] },
    { label: 'negative infinity', marks: [1, Number.NEGATIVE_INFINITY, 0] },
  ])('rejects $label in the awarded-mark array', ({ marks }) => {
    expect(() => calculateGradeTotals({
      awardedMarks: marks,
      questionCount: 3,
    })).toThrow('Awarded mark must be a finite number.');
  });

  test.each([-0.01, 1.01])(
    'rejects out-of-range awarded mark %s during totaling',
    (mark) => {
      expect(() => calculateGradeTotals({
        awardedMarks: [1, mark, 0],
        questionCount: 3,
      })).toThrow('Awarded mark must be between 0 and 1.');
    },
  );

  test.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])(
    'rejects invalid question count %s',
    (questionCount) => {
      expect(() => calculateGradeTotals({
        awardedMarks: [],
        questionCount,
      })).toThrow('Question count must be a positive integer.');
    },
  );
});
