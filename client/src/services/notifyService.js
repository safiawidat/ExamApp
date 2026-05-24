// Service responsible for creating notification messages

const notify = {
  success(message) {
    return {
      type: 'success',
      message,
    }
  },

  error(message) {
    return {
      type: 'error',
      message,
    }
  },

  warning(message) {
    return {
      type: 'warning',
      message,
    }
  },
}

export default notify