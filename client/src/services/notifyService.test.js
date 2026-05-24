import notify from './notifyService'

describe('notifyService', () => {
  test('should create success notification', () => {
    const result = notify.success('Operation successful')

    expect(result.type).toBe('success')
    expect(result.message).toBe('Operation successful')
  })

  test('should create error notification', () => {
    const result = notify.error('Something failed')

    expect(result.type).toBe('error')
    expect(result.message).toBe('Something failed')
  })

  test('should create warning notification', () => {
    const result = notify.warning('Be careful')

    expect(result.type).toBe('warning')
    expect(result.message).toBe('Be careful')
  })
})