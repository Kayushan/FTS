import React from 'react';
import { AlertCircle, X, RefreshCw } from 'lucide-react';

export interface ErrorDisplayProps {
  error: string | Error | null;
  variant?: 'inline' | 'toast' | 'banner' | 'modal';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
  'aria-label'?: string;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  variant = 'inline',
  size = 'md',
  showIcon = true,
  dismissible = false,
  onDismiss,
  onRetry,
  className = '',
  'aria-label': ariaLabel
}) => {
  if (!error) return null;

  const errorMessage = typeof error === 'string' ? error : error.message;
  
  const baseClasses = 'flex items-start gap-2 rounded-md border';
  const variantClasses = {
    inline: 'bg-red-50 border-red-200 text-red-800',
    toast: 'bg-white border-red-200 shadow-lg text-red-800',
    banner: 'bg-red-100 border-red-300 text-red-900',
    modal: 'bg-white border-red-200 shadow-xl text-red-800'
  };
  
  const sizeClasses = {
    sm: 'p-2 text-sm',
    md: 'p-3 text-base',
    lg: 'p-4 text-lg'
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      role="alert"
      aria-label={ariaLabel || `Error: ${errorMessage}`}
      aria-live="polite"
    >
      {showIcon && (
        <AlertCircle 
          className={`${iconSizes[size]} text-red-500 flex-shrink-0 mt-0.5`}
          aria-hidden="true"
        />
      )}
      
      <div className="flex-1 min-w-0">
        <p className="font-medium break-words">
          {errorMessage}
        </p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="p-1 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
            aria-label="Retry operation"
            title="Retry"
          >
            <RefreshCw className={iconSizes[size]} />
          </button>
        )}
        
        {dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
            aria-label="Dismiss error"
            title="Dismiss"
          >
            <X className={iconSizes[size]} />
          </button>
        )}
      </div>
    </div>
  );
};

// Specialized error components for common use cases
export const FormErrorDisplay: React.FC<{ error: string | null; fieldName?: string }> = ({ 
  error, 
  fieldName 
}) => (
  <ErrorDisplay 
    error={error}
    variant="inline"
    size="sm"
    aria-label={fieldName ? `${fieldName} error: ${error}` : undefined}
    className="mt-1"
  />
);

export const ApiErrorDisplay: React.FC<{ 
  error: string | Error | null; 
  onRetry?: () => void;
  onDismiss?: () => void;
}> = ({ error, onRetry, onDismiss }) => (
  <ErrorDisplay 
    error={error}
    variant="banner"
    size="md"
    showIcon={true}
    dismissible={!!onDismiss}
    onDismiss={onDismiss}
    onRetry={onRetry}
    className="mb-4"
  />
);

export const ToastErrorDisplay: React.FC<{ 
  error: string | Error | null; 
  onDismiss: () => void;
}> = ({ error, onDismiss }) => (
  <ErrorDisplay 
    error={error}
    variant="toast"
    size="md"
    showIcon={true}
    dismissible={true}
    onDismiss={onDismiss}
    className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-right-full"
  />
);