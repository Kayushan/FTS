import React, { useState, useCallback, forwardRef } from 'react';
import { InputValidator, ValidationResult } from '../../lib/validation';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';

interface ValidatedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  type: 'amount' | 'person' | 'note' | 'text' | 'email';
  value: string;
  onChange: (value: string, isValid: boolean, validationResult?: ValidationResult) => void;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  required?: boolean;
  showErrorImmediately?: boolean;
  errorClassName?: string;
}

export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>((
  {
    type,
    value,
    onChange,
    onValidationChange,
    placeholder,
    className,
    disabled = false,
    required = false,
    showErrorImmediately = false,
    errorClassName,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    id,
    ...props
  },
  ref
) => {
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true });
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);

  const validate = useCallback((inputValue: string): ValidationResult => {
    if (!required && (!inputValue || inputValue.trim() === '')) {
      return { isValid: true };
    }

    switch (type) {
      case 'amount':
        return InputValidator.validateAmount(inputValue);
      case 'person':
        return InputValidator.validatePersonName(inputValue);
      case 'note':
        return InputValidator.validateNote(inputValue);
      case 'email':
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(inputValue)) {
          return { isValid: false, error: 'Please enter a valid email address' };
        }
        return { isValid: true, value: inputValue };
      default:
        return { isValid: true, value: inputValue };
    }
  }, [type, required]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const validationResult = validate(newValue);
    
    setValidation(validationResult);
    onChange(newValue, validationResult.isValid, validationResult);
    onValidationChange?.(validationResult.isValid, validationResult.error);
  }, [validate, onChange, onValidationChange]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setTouched(true);
    setFocused(false);
    
    const validationResult = validate(value);
    setValidation(validationResult);
    onChange(value, validationResult.isValid, validationResult);
    onValidationChange?.(validationResult.isValid, validationResult.error);
    
    props.onBlur?.(e);
  }, [validate, value, onChange, onValidationChange, props]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    props.onFocus?.(e);
  }, [props]);

  const showError = (touched || showErrorImmediately || focused) && !validation.isValid && validation.error;
  const inputMode = type === 'amount' ? 'decimal' : type === 'email' ? 'email' : 'text';
  const inputType = type === 'email' ? 'email' : 'text';
  
  const errorId = id ? `${id}-error` : undefined;
  const helpTextId = ariaDescribedBy || (showError && errorId ? errorId : undefined);

  return (
    <div className="w-full space-y-1">
      <Input
        {...props}
        ref={ref}
        id={id}
        type={inputType}
        inputMode={inputMode}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={showError ? 'true' : 'false'}
        aria-describedby={helpTextId}
        className={cn(
          className,
          showError && 'border-red-500 focus:border-red-500 focus:ring-red-200',
          focused && 'ring-2 ring-blue-200',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      {showError && (
        <div 
          id={errorId}
          className={cn(
            "text-xs text-red-600 flex items-center gap-1",
            errorClassName
          )}
          role="alert"
          aria-live="polite"
        >
          <svg 
            className="h-3 w-3 flex-shrink-0" 
            fill="currentColor" 
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path 
              fillRule="evenodd" 
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" 
              clipRule="evenodd" 
            />
          </svg>
          {validation.error}
        </div>
      )}
    </div>
  );
});

ValidatedInput.displayName = 'ValidatedInput';