import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spinner' | 'dots' | 'pulse';
  className?: string;
  text?: string;
  fullScreen?: boolean;
  overlay?: boolean;
}

export function Loading({ 
  size = 'md', 
  variant = 'spinner', 
  className, 
  text,
  fullScreen = false,
  overlay = false 
}: LoadingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6', 
    lg: 'h-8 w-8'
  };

  const containerClasses = cn(
    'flex items-center justify-center',
    fullScreen && 'fixed inset-0 z-50',
    overlay && 'bg-white/80 backdrop-blur-sm',
    !fullScreen && 'p-4',
    className
  );

  const renderSpinner = () => (
    <Loader2 
      className={cn('animate-spin text-blue-600', sizeClasses[size])} 
      aria-hidden="true"
    />
  );

  const renderDots = () => (
    <div className="flex space-x-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            'rounded-full bg-blue-600 animate-pulse',
            size === 'sm' && 'h-1 w-1',
            size === 'md' && 'h-2 w-2',
            size === 'lg' && 'h-3 w-3'
          )}
          style={{
            animationDelay: `${i * 0.15}s`,
            animationDuration: '0.6s'
          }}
        />
      ))}
    </div>
  );

  const renderPulse = () => (
    <div
      className={cn(
        'rounded-full bg-blue-600 animate-ping',
        sizeClasses[size]
      )}
      aria-hidden="true"
    />
  );

  const renderVariant = () => {
    switch (variant) {
      case 'dots':
        return renderDots();
      case 'pulse':
        return renderPulse();
      default:
        return renderSpinner();
    }
  };

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      <div className="flex flex-col items-center space-y-2">
        {renderVariant()}
        {text && (
          <span className={cn(
            'text-gray-600',
            size === 'sm' && 'text-xs',
            size === 'md' && 'text-sm',
            size === 'lg' && 'text-base'
          )}>
            {text}
          </span>
        )}
      </div>
      <span className="sr-only">
        {text || 'Loading...'}
      </span>
    </div>
  );
}

// Inline loading component for buttons
export function ButtonLoading({ className }: { className?: string }) {
  return (
    <Loader2 
      className={cn('h-4 w-4 animate-spin', className)} 
      aria-hidden="true"
    />
  );
}

// Loading overlay for content areas
export function LoadingOverlay({ 
  isLoading, 
  children, 
  text = 'Loading...',
  className 
}: {
  isLoading: boolean;
  children: React.ReactNode;
  text?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
          <Loading text={text} />
        </div>
      )}
    </div>
  );
}

// Skeleton loader for content
export function Skeleton({ 
  className, 
  children 
}: { 
  className?: string; 
  children?: React.ReactNode;
}) {
  return (
    <div 
      className={cn(
        'animate-pulse rounded-md bg-gray-200',
        className
      )}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

// Loading button state
export function LoadingButton({ 
  isLoading, 
  children, 
  loadingText,
  ...props 
}: {
  isLoading: boolean;
  children: React.ReactNode;
  loadingText?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button 
      {...props}
      disabled={isLoading || props.disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2',
        props.className
      )}
      aria-busy={isLoading}
    >
      {isLoading && <ButtonLoading />}
      {isLoading ? loadingText || children : children}
    </button>
  );
}