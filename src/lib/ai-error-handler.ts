export interface AIError {
  code: string;
  message: string;
  retryable: boolean;
  context?: any;
}

export class AIErrorHandler {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [1000, 2000, 4000]; // Progressive delays

  /**
   * Handle AI service errors with retry logic
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    context: string = 'AI operation'
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const aiError = this.classifyError(error, context);
        
        if (!aiError.retryable || attempt === this.MAX_RETRIES - 1) {
          throw aiError;
        }
        
        // Wait before retry
        await this.sleep(this.RETRY_DELAYS[attempt]);
      }
    }
    
    throw this.classifyError(lastError, context);
  }

  /**
   * Classify error type and determine if retryable
   */
  private static classifyError(error: any, context: string): AIError {
    if (error.name === 'NetworkError' || error.message.includes('fetch')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network connection failed. Please check your internet connection.',
        retryable: true,
        context
      };
    }
    
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      return {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait a moment and try again.',
        retryable: true,
        context
      };
    }
    
    if (error.message.includes('401') || error.message.includes('403')) {
      return {
        code: 'AUTH_ERROR',
        message: 'API key is invalid or expired. Please check your API keys.',
        retryable: false,
        context
      };
    }
    
    if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
      return {
        code: 'SERVER_ERROR',
        message: 'AI service is temporarily unavailable. Please try again later.',
        retryable: true,
        context
      };
    }
    
    if (error.message.includes('timeout')) {
      return {
        code: 'TIMEOUT_ERROR',
        message: 'Request timed out. Please try again.',
        retryable: true,
        context
      };
    }
    
    // Unknown error
    return {
      code: 'UNKNOWN_ERROR',
      message: `An unexpected error occurred: ${error.message || 'Unknown error'}`,
      retryable: false,
      context
    };
  }

  /**
   * Get user-friendly error message
   */
  static getUserMessage(error: AIError): string {
    const baseMessage = error.message;
    
    if (error.retryable) {
      return `${baseMessage} The operation will be retried automatically.`;
    }
    
    switch (error.code) {
      case 'AUTH_ERROR':
        return `${baseMessage} Go to API Keys tab to update your credentials.`;
      case 'UNKNOWN_ERROR':
        return `${baseMessage} If this persists, please contact support.`;
      default:
        return baseMessage;
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error should show retry button
   */
  static shouldShowRetry(error: AIError): boolean {
    return error.retryable && !['RATE_LIMITED'].includes(error.code);
  }

  /**
   * Get retry delay for manual retry
   */
  static getRetryDelay(error: AIError): number {
    switch (error.code) {
      case 'RATE_LIMITED':
        return 30000; // 30 seconds
      case 'SERVER_ERROR':
        return 10000; // 10 seconds
      default:
        return 5000; // 5 seconds
    }
  }
}