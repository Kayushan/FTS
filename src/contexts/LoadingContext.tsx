import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LoadingState {
  [key: string]: boolean;
}

interface LoadingContextType {
  loadingStates: LoadingState;
  setLoading: (key: string, isLoading: boolean) => void;
  isLoading: (key: string) => boolean;
  isAnyLoading: () => boolean;
  clearAllLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

interface LoadingProviderProps {
  children: ReactNode;
}

export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children }) => {
  const [loadingStates, setLoadingStates] = useState<LoadingState>({});

  const setLoading = (key: string, isLoading: boolean) => {
    setLoadingStates(prev => ({
      ...prev,
      [key]: isLoading
    }));
  };

  const isLoading = (key: string) => {
    return Boolean(loadingStates[key]);
  };

  const isAnyLoading = () => {
    return Object.values(loadingStates).some(Boolean);
  };

  const clearAllLoading = () => {
    setLoadingStates({});
  };

  const value: LoadingContextType = {
    loadingStates,
    setLoading,
    isLoading,
    isAnyLoading,
    clearAllLoading
  };

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
};

// Custom hook for async operations with loading state
export const useAsyncOperation = () => {
  const { setLoading } = useLoading();

  const executeWithLoading = async <T,>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> => {
    try {
      setLoading(key, true);
      const result = await operation();
      return result;
    } finally {
      setLoading(key, false);
    }
  };

  return { executeWithLoading };
};