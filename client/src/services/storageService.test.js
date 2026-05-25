import storage from './storageService'

describe('storageService', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('should save and retrieve data correctly', () => {
    const key = 'test_key'
    const value = { name: 'Test Object', id: 123 }

    const success = storage.save(key, value)
    const retrievedValue = storage.get(key)

    expect(success).toBe(true)
    expect(retrievedValue).toEqual(value)
  })

  test('should return default value if key does not exist', () => {
    const defaultValue = 'default'

    const result = storage.get('missing_key', defaultValue)

    expect(result).toBe(defaultValue)
  })

  test('should remove items correctly', () => {
    const key = 'remove_me'

    storage.save(key, 'some value')
    storage.remove(key)

    expect(storage.get(key)).toBeNull()
  })
})