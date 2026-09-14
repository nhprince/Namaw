type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

// Default level
let currentLevel: LogLevel = 'info';

export const logger = {
  setLevel(level: LogLevel) {
    currentLevel = level;
  },

  error(context: string, message: string, ...args: unknown[]) {
    if (LEVEL_PRIORITY[currentLevel] >= LEVEL_PRIORITY.error) {
      console.error(`[Namaw!][${context}] ❌ ${message}`, ...args);
    }
  },

  warn(context: string, message: string, ...args: unknown[]) {
    if (LEVEL_PRIORITY[currentLevel] >= LEVEL_PRIORITY.warn) {
      console.warn(`[Namaw!][${context}] ⚠️ ${message}`, ...args);
    }
  },

  info(context: string, message: string, ...args: unknown[]) {
    if (LEVEL_PRIORITY[currentLevel] >= LEVEL_PRIORITY.info) {
      console.info(`[Namaw!][${context}] ℹ️ ${message}`, ...args);
    }
  },

  debug(context: string, message: string, ...args: unknown[]) {
    if (LEVEL_PRIORITY[currentLevel] >= LEVEL_PRIORITY.debug) {
      console.debug(`[Namaw!][${context}] 🔍 ${message}`, ...args);
    }
  },
};
