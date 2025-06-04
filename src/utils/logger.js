const chalk = require('chalk').default;

/**
 * Simple logger utility with timestamp and colorized output
 */
class Logger {
  /** Log an informational message */
  info(...args) {
    console.log(chalk.blue(`[INFO ${new Date().toISOString()}]`), ...args);
  }

  /** Log a warning message */
  warn(...args) {
    console.warn(chalk.yellow(`[WARN ${new Date().toISOString()}]`), ...args);
  }

  /** Log an error message */
  error(...args) {
    console.error(chalk.red(`[ERROR ${new Date().toISOString()}]`), ...args);
  }
}

module.exports = new Logger();
