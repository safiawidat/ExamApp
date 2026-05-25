import { getPublishedExams } from '../examService'

test('returns published exams', () => {
  const exams = getPublishedExams()

  expect(exams.length).toBeGreaterThan(0)
})