export const SCORE_DECIMAL_PLACES = 4;
export const PERCENTAGE_DECIMAL_PLACES = 2;

const scoreScale = 10 ** SCORE_DECIMAL_PLACES;
const percentageScale = 10 ** PERCENTAGE_DECIMAL_PLACES;

const validateAwardedMark = (mark) => {
  if (typeof mark !== 'number' || !Number.isFinite(mark)) {
    throw new TypeError('Awarded mark must be a finite number.');
  }

  if (mark < 0 || mark > 1) {
    throw new RangeError('Awarded mark must be between 0 and 1.');
  }

  return mark;
};

const toRoundedScoreUnits = (mark) => (
  Math.round((validateAwardedMark(mark) + Number.EPSILON) * scoreScale)
);

export function gradeMultipleChoiceAnswer(selectedOptionId, storedOptions) {
  if (selectedOptionId === null || selectedOptionId === undefined) {
    return 0;
  }

  if (!Number.isSafeInteger(selectedOptionId) || selectedOptionId <= 0) {
    throw new TypeError('Selected option ID must be a positive integer or null.');
  }

  if (!Array.isArray(storedOptions)) {
    throw new TypeError('Stored multiple-choice options must be an array.');
  }

  const selectedOption = storedOptions.find(
    (option) => option?.id === selectedOptionId,
  );

  if (!selectedOption) {
    throw new RangeError('Selected option was not found in the stored options.');
  }

  if (typeof selectedOption.isCorrect !== 'boolean') {
    throw new TypeError('Stored option correctness must be a Boolean.');
  }

  return selectedOption.isCorrect === true ? 1 : 0;
}

export function gradeTrueFalseAnswer(booleanAnswer, storedCorrectAnswer) {
  if (booleanAnswer === null || booleanAnswer === undefined) {
    return 0;
  }

  if (typeof booleanAnswer !== 'boolean') {
    throw new TypeError('True/false answer must be a Boolean or null.');
  }

  if (!['true', 'false'].includes(storedCorrectAnswer)) {
    throw new TypeError("Stored true/false answer must be 'true' or 'false'.");
  }

  const correctAnswer = storedCorrectAnswer === 'true';
  return booleanAnswer === correctAnswer ? 1 : 0;
}

export function validateShortAnswerMark(mark) {
  return validateAwardedMark(mark);
}

export function calculateGradePercentage(totalAwardedPoints, maximumPoints) {
  if (!Number.isSafeInteger(maximumPoints) || maximumPoints <= 0) {
    throw new RangeError('Maximum points must be a positive integer.');
  }

  if (
    typeof totalAwardedPoints !== 'number'
    || !Number.isFinite(totalAwardedPoints)
    || totalAwardedPoints < 0
    || totalAwardedPoints > maximumPoints
  ) {
    throw new RangeError('Total awarded points must be between 0 and maximum points.');
  }

  const totalScoreUnits = Math.round(
    (totalAwardedPoints + Number.EPSILON) * scoreScale,
  );
  const percentageUnits = Math.round(
    (totalScoreUnits * 100 * percentageScale)
      / (maximumPoints * scoreScale),
  );

  return percentageUnits / percentageScale;
}

export function calculateGradeTotals({ awardedMarks, questionCount }) {
  if (!Number.isSafeInteger(questionCount) || questionCount <= 0) {
    throw new RangeError('Question count must be a positive integer.');
  }

  if (!Array.isArray(awardedMarks) || awardedMarks.length !== questionCount) {
    throw new TypeError('Every question must have exactly one awarded mark.');
  }

  let totalScoreUnits = 0;

  for (let index = 0; index < questionCount; index += 1) {
    totalScoreUnits += toRoundedScoreUnits(awardedMarks[index]);
  }
  const totalAwardedPoints = totalScoreUnits / scoreScale;
  const maximumPoints = questionCount;

  return {
    totalAwardedPoints,
    maximumPoints,
    percentage: calculateGradePercentage(totalAwardedPoints, maximumPoints),
  };
}
