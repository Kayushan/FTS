import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';

/**
 * Custom hook for debouncing values to reduce re-renders
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Custom hook for throttling function calls
 */
export function useThrottle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T {
  const lastRan = useRef<number>(Date.now());

  return useCallback(
    ((...args: any[]) => {
      if (Date.now() - lastRan.current >= delay) {
        func(...args);
        lastRan.current = Date.now();
      }
    }) as T,
    [func, delay]
  );
}

/**
 * Custom hook for memoizing expensive calculations
 */
export function useExpensiveCalculation<T>(
  calculate: () => T,
  dependencies: React.DependencyList
): T {
  return useMemo(calculate, dependencies);
}

/**
 * Custom hook for preventing unnecessary localStorage operations
 */
export function useLocalStorageOptimized<T>(
  key: string,
  initialValue: T
): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T) => {
    try {
      setStoredValue(value);
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);

  return [storedValue, setValue];
}

/**
 * Batch multiple state updates to reduce re-renders
 */
export function useBatchedUpdates() {
  const pendingUpdates = useRef<(() => void)[]>([]);
  const isScheduled = useRef(false);

  const batchUpdate = useCallback((update: () => void) => {
    pendingUpdates.current.push(update);
    
    if (!isScheduled.current) {
      isScheduled.current = true;
      
      // Use React's automatic batching in React 18
      Promise.resolve().then(() => {
        const updates = pendingUpdates.current;
        pendingUpdates.current = [];
        isScheduled.current = false;
        
        updates.forEach(update => update());
      });
    }
  }, []);

  return batchUpdate;
}