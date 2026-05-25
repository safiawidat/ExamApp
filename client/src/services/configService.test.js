import config from './configService'

describe('configService', () => {
  test('should contain app name', () => {
    expect(config.appName).toBe('E-Test System')
  })

  test('should contain default role', () => {
    expect(config.defaultRole).toBe('student')
  })

  test('should contain max questions limit', () => {
    expect(config.maxQuestionsPerExam).toBe(20)
  })
})