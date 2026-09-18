type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

let currentLevel: LogLevel = 'info';

const RING_LIMIT = 500;

// Persistent ring buffer so a service worker restart never loses diagnostics.
// Written via dynamic import to keep this module safe in non-extension contexts.
function ringWrite(entry: Record<string, unknown>) {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    chrome.storage.local
      .get(['namaw_logs'])
      .then((data) => {
        const arr = Array.isArray(data.namaw_logs) ? data.namaw_logs : [];
        arr.push(entry);
        if (arr.length > RING_LIMIT) arr.splice(0, arr.length - RING_LIMIT);
        return chrome.storage.local.set({ namaw_logs: arr });
      })
      .catch(() => {});
  } catch {
    // never throw from the logger
  }
}

export const logger = {
  setLevel(level: LogLevel) {
    currentLevel = level;
  },

  error(context: string, message: string, ...args: unknown[]) {
    ringWrite({ ts: Date.now(), lvl: 'error', ctx: context, msg: message, args: safe(args) });
    if (LEVEL_PRIORITY[currentLevel] >= LEVEL_PRIORITY.error) {
      console.error(`[Namaw!][${context}] ❌ ${message}`, ...args);
    }
  },

  warn(context: string, message: string, ...args: unknown[]) {
    ringWrite({ ts: Date.now(), lvl: 'warn', ctx: context, msg: message, args: safe(args) });
    if (LEVEL_PRIORITY[currentLevel] >= LEVEL_PRIORITY.warn) {
      console.warn(`[Namaw!][${context}] ⚠️ ${message}`, ...args);
    }
  },

  info(context: string, message: string, ...args: unknown[]) {
    ringWrite({ ts: Date.now(), lvl: 'info', ctx: context, msg: message, args: safe(args) });
    if (LEVEL_PRIORITY[currentLevel] >= LEVEL_PRIORITY.info) {
      console.info(`[Namaw!][${context}] ℹ️ ${message}`, ...args);
    }
  },

  debug(context: string, message: string, ...args: unknown[]) {
    ringWrite({ ts: Date.now(), lvl: 'debug', ctx: context, msg: message, args: safe(args) });
    if (LEVEL_PRIORITY[currentLevel] >= LEVEL_PRIORITY.debug) {
      console.debug(`[Namaw!][${context}] 🔍 ${message}`, ...args);
    }
  },
};

function safe(args: unknown[]): unknown[] {
  return args.map((a) => {
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    return a;
  });
}
