// Production logger that prevents PII leaks and controls verbose logging
const isProduction = !import.meta.env.DEV;

// Helper to sanitize data for production logs
const sanitizeForProduction = (data: any): any => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sanitized = { ...data };
  const sensitiveFields = ['email', 'phone', 'password', 'token', 'key', 'secret', 'address'];
  
  Object.keys(sanitized).forEach(key => {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

export const prodConsole = {
  log: (...args: any[]) => {
    if (!isProduction) {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    // Warnings should always be visible but sanitized in production
    if (isProduction) {
      const sanitizedArgs = args.map(sanitizeForProduction);
      console.warn(...sanitizedArgs);
    } else {
      console.warn(...args);
    }
  },
  
  error: (...args: any[]) => {
    // Errors should always be visible but sanitized in production
    if (isProduction) {
      const sanitizedArgs = args.map(sanitizeForProduction);
      console.error(...sanitizedArgs);
    } else {
      console.error(...args);
    }
  },
  
  debug: (...args: any[]) => {
    // Debug logs only in development
    if (!isProduction) {
      console.log('[DEBUG]', ...args);
    }
  },
  
  info: (...args: any[]) => {
    // Info logs always visible but sanitized in production
    if (isProduction) {
      const sanitizedArgs = args.map(sanitizeForProduction);
      console.info(...sanitizedArgs);
    } else {
      console.info(...args);
    }
  }
};