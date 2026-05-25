// OOP service responsible for application logs

class LoggerService {
  info(message, data = null) {
    console.info('[INFO]', message, data)

    return {
      level: 'info',
      message,
      data,
    }
  }

  warning(message, data = null) {
    console.warn('[WARNING]', message, data)

    return {
      level: 'warning',
      message,
      data,
    }
  }

  error(message, data = null) {
    console.error('[ERROR]', message, data)

    return {
      level: 'error',
      message,
      data,
    }
  }
}

const logger = new LoggerService()

export default logger
