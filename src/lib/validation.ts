import { FinancialMath } from './decimal-math';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  value?: any;
}

export class InputValidator {
  /**
   * Validate financial amount input
   */
  static validateAmount(input: string): ValidationResult {
    if (!input || input.trim() === '') {
      return { isValid: false, error: 'Amount is required' };
    }

    const trimmed = input.trim();
    
    // Remove common currency symbols and spaces
    const cleaned = trimmed.replace(/[RM\s,]/g, '');
    
    // Check if it's a valid number
    if (!/^\d*\.?\d+$/.test(cleaned)) {
      return { isValid: false, error: 'Invalid amount format' };
    }

    const numValue = parseFloat(cleaned);
    
    if (!FinancialMath.isValidAmount(numValue)) {
      return { isValid: false, error: 'Invalid amount' };
    }

    if (numValue <= 0) {
      return { isValid: false, error: 'Amount must be greater than 0' };
    }

    if (numValue > 999999999.99) {
      return { isValid: false, error: 'Amount too large' };
    }

    // Round to 2 decimal places
    const rounded = FinancialMath.round(numValue);
    
    return { isValid: true, value: rounded };
  }

  /**
   * Validate person name input
   */
  static validatePersonName(input: string): ValidationResult {
    if (!input || input.trim() === '') {
      return { isValid: false, error: 'Name is required' };
    }

    const trimmed = input.trim();
    
    if (trimmed.length < 2) {
      return { isValid: false, error: 'Name must be at least 2 characters' };
    }

    if (trimmed.length > 50) {
      return { isValid: false, error: 'Name must be less than 50 characters' };
    }

    // Basic XSS prevention - no HTML tags
    if (/<[^>]*>/g.test(trimmed)) {
      return { isValid: false, error: 'Invalid characters in name' };
    }

    return { isValid: true, value: trimmed };
  }

  /**
   * Validate note input
   */
  static validateNote(input: string): ValidationResult {
    const trimmed = input.trim();
    
    if (trimmed.length > 200) {
      return { isValid: false, error: 'Note must be less than 200 characters' };
    }

    // Basic XSS prevention - no HTML tags
    if (/<[^>]*>/g.test(trimmed)) {
      return { isValid: false, error: 'Invalid characters in note' };
    }

    return { isValid: true, value: trimmed || undefined };
  }

  /**
   * Validate category selection
   */
  static validateCategory(category: string, validCategories: string[]): ValidationResult {
    if (!category || category.trim() === '') {
      return { isValid: false, error: 'Category is required' };
    }

    if (!validCategories.includes(category)) {
      return { isValid: false, error: 'Invalid category selected' };
    }

    return { isValid: true, value: category };
  }

  /**
   * Validate date input
   */
  static validateDate(dateString: string): ValidationResult {
    if (!dateString || dateString.trim() === '') {
      return { isValid: false, error: 'Date is required' };
    }

    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) {
      return { isValid: false, error: 'Invalid date format' };
    }

    // Don't allow future dates for transactions
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    if (date > today) {
      return { isValid: false, error: 'Cannot add transactions for future dates' };
    }

    // Don't allow dates too far in the past (5 years)
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    
    if (date < fiveYearsAgo) {
      return { isValid: false, error: 'Date cannot be more than 5 years ago' };
    }

    return { isValid: true, value: dateString };
  }
}