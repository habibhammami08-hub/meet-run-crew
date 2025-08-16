import { useCallback, useRef } from 'react';
import { prodConsole } from '@/utils/prodConsole';

interface DebounceConfig {
  delay: number;
  maxWait?: number;
}

export const useRealtimeDebounce = () => {
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastExecutionRefs = useRef<Map<string, number>>(new Map());

  const debounce = useCallback((
    key: string,
    fn: () => Promise<void> | void,
    config: DebounceConfig = { delay: 1000, maxWait: 5000 }
  ) => {
    const { delay, maxWait } = config;
    const now = Date.now();
    
    // Clear existing timeout for this key
    const existingTimeout = timeoutRefs.current.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Check if we should force execution due to maxWait
    const lastExecution = lastExecutionRefs.current.get(key) || 0;
    const shouldForceExecution = maxWait && (now - lastExecution) >= maxWait;

    if (shouldForceExecution) {
      prodConsole.debug(`Force executing debounced function for key: ${key} (maxWait reached)`);
      lastExecutionRefs.current.set(key, now);
      
      try {
        const result = fn();
        if (result instanceof Promise) {
          result.catch(error => {
            prodConsole.error(`Error in force-executed debounced function ${key}:`, error);
          });
        }
      } catch (error) {
        prodConsole.error(`Error in force-executed debounced function ${key}:`, error);
      }
      return;
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      prodConsole.debug(`Executing debounced function for key: ${key}`);
      lastExecutionRefs.current.set(key, Date.now());
      timeoutRefs.current.delete(key);
      
      try {
        const result = fn();
        if (result instanceof Promise) {
          result.catch(error => {
            prodConsole.error(`Error in debounced function ${key}:`, error);
          });
        }
      } catch (error) {
        prodConsole.error(`Error in debounced function ${key}:`, error);
      }
    }, delay);

    timeoutRefs.current.set(key, timeout);
    prodConsole.debug(`Debounced function ${key} scheduled for execution in ${delay}ms`);
  }, []);

  const cancel = useCallback((key: string) => {
    const timeout = timeoutRefs.current.get(key);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(key);
      prodConsole.debug(`Cancelled debounced function for key: ${key}`);
    }
  }, []);

  const cancelAll = useCallback(() => {
    timeoutRefs.current.forEach((timeout, key) => {
      clearTimeout(timeout);
      prodConsole.debug(`Cancelled debounced function for key: ${key}`);
    });
    timeoutRefs.current.clear();
    lastExecutionRefs.current.clear();
    prodConsole.debug('Cancelled all debounced functions');
  }, []);

  const isScheduled = useCallback((key: string): boolean => {
    return timeoutRefs.current.has(key);
  }, []);

  return {
    debounce,
    cancel,
    cancelAll,
    isScheduled,
  };
};