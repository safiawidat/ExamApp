// Service responsible for saving, reading and removing data from localStorage

const storage = {
  save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      console.error('Storage save error:', error)
      return false
    }
  },

  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key)

      if (!value) {
        return defaultValue
      }

      return JSON.parse(value)
    } catch (error) {
      console.error('Storage get error:', error)
      return defaultValue
    }
  },

  remove(key) {
    localStorage.removeItem(key)
  },

  clear() {
    localStorage.clear()
  }
}

export default storage