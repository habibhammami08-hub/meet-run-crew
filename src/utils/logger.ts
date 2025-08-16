// Production-safe logging utility
export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (import.meta.env.DEV) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    if (import.meta.env.DEV) {
      console.info(`[INFO] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (import.meta.env.DEV) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },
  error: (message: string, ...args: any[]) => {
    if (import.meta.env.DEV) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
};

// Performance monitoring utility
export const performanceLogger = {
  startTimer: (label: string) => {
    if (import.meta.env.DEV) {
      console.time(label);
    }
  },
  endTimer: (label: string) => {
    if (import.meta.env.DEV) {
      console.timeEnd(label);
    }
  }
};