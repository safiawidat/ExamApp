import logger from './loggerService'

describe('loggerService', () => {
  test('should create info log object', () => {
    const result = logger.info('Test info message')

    expect(result.level).toBe('info')
    expect(result.message).toBe('Test info message')
  })

  test('should create warning log object', () => {
    const result = logger.warning('Test warning message')

    expect(result.level).toBe('warning')
    expect(result.message).toBe('Test warning message')
  })

  test('should create error log object', () => {
    const result = logger.error('Test error message')

    expect(result.level).toBe('error')
    expect(result.message).toBe('Test error message')
  })
})