import { createContext, useContext, useState, ReactNode } from 'react';

interface LoadingState {
  [key: string]: boolean;
}

interface LoadingContextType {
  isLoading: (key: string) => boolean;
  setLoading: (key: string, loading: boolean) => void;
  anyLoading: () => boolean;
}

const LoadingContext = createContext<LoadingContextType | null>(null);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [loadingStates, setLoadingStates] = useState<LoadingState>({});

  const isLoading = (key: string): boolean => {
    return loadingStates[key] || false;
  };

  const setLoading = (key: string, loading: boolean): void => {
    setLoadingStates(prev => ({
      ...prev,
      [key]: loading
    }));
  };

  const anyLoading = (): boolean => {
    return Object.values(loadingStates).some(loading => loading);
  };

  const contextValue: LoadingContextType = {
    isLoading,
    setLoading,
    anyLoading
  };

  return LoadingContext.Provider({ value: contextValue, children });
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}

// Hook for managing a specific loading state
export function useLoadingState(key: string) {
  const { isLoading, setLoading } = useLoading();
  
  const startLoading = () => setLoading(key, true);
  const stopLoading = () => setLoading(key, false);
  
  return {
    isLoading: isLoading(key),
    startLoading,
    stopLoading,
    setLoading: (loading: boolean) => setLoading(key, loading)
  };
}

// Hook for async operations with loading state
export function useAsyncOperation(key: string) {
  const { startLoading, stopLoading, isLoading } = useLoadingState(key);
  
  const execute = async function<T>(operation: () => Promise<T>): Promise<T> {
    try {
      startLoading();
      return await operation();
    } finally {
      stopLoading();
    }
  };
  
  return {
    execute,
    isLoading
  };
}