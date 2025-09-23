import { InputValidator } from './validation';
import { FinancialMath } from './decimal-math';

export interface AITransactionCommand {
  action: string;
  date?: string;
  type?: 'income' | 'expense';
  amount?: number;
  category?: string;
  note?: string;
  person?: string;
  dueDate?: string;
  entryId?: string;
  debtId?: string;
  borrowId?: string;
}

export interface AICommandResult {
  success: boolean;
  error?: string;
  command?: AITransactionCommand;
  commandId?: string;
}

export class AICommandParser {
  private static VALID_ACTIONS = [
    'add_transaction',
    'edit_transaction', 
    'delete_transaction',
    'add_debt',
    'mark_debt_paid',
    'delete_debt',
    'add_borrow',
    'mark_borrow_paid',
    'delete_borrow'
  ];

  private static EXPENSE_CATEGORIES = [
    'Food', 'Transport', 'Bills', 'Groceries', 'Health', 
    'Entertainment', 'Shopping', 'Other'
  ];

  private static INCOME_CATEGORIES = [
    'Salary', 'Business', 'Bonus', 'Gift', 'Interest', 
    'Refund', 'Other'
  ];

  // Track processed commands to prevent duplicates
  private static processedCommands = new Set<string>();

  /**
   * Parse and validate AI command from response text with enhanced duplicate prevention
   */
  static parseCommand(responseText: string, existingCommandIds: Set<string> = new Set()): AICommandResult[] {
    const commands: AICommandResult[] = [];
    
    // Enhanced regex to capture complete JSON objects
    const applyRegex = /__apply__\s*({[^}]*(?:}[^}]*)*})/g;
    let match;
    
    while ((match = applyRegex.exec(responseText)) !== null) {
      try {
        const jsonString = match[1];
        const command = JSON.parse(jsonString) as AITransactionCommand;
        
        const validation = this.validateCommand(command);
        
        if (validation.success && validation.command) {
          const commandId = this.generateCommandId(validation.command);
          validation.commandId = commandId;
          
          // Enhanced duplicate prevention
          if (this.isDuplicate(commandId, existingCommandIds)) {
            commands.push({
              success: false,
              error: `Duplicate command detected and skipped: ${command.action}`,
              commandId
            });
            continue;
          }
          
          // Add to processed commands
          this.processedCommands.add(commandId);
        }
        
        commands.push(validation);
        
      } catch (error) {
        commands.push({
          success: false,
          error: `Failed to parse AI command: ${error instanceof Error ? error.message : 'Invalid JSON format'}`
        });
      }
    }
    
    return commands;
  }

  /**
   * Check if command is duplicate based on ID and existing commands
   */
  private static isDuplicate(commandId: string, existingCommandIds: Set<string>): boolean {
    return this.processedCommands.has(commandId) || existingCommandIds.has(commandId);
  }

  /**
   * Validate AI command structure and data with enhanced validation
   */
  private static validateCommand(command: AITransactionCommand): AICommandResult {
    // Validate action
    if (!command.action || !this.VALID_ACTIONS.includes(command.action)) {
      return {
        success: false,
        error: `Invalid action: ${command.action}. Must be one of: ${this.VALID_ACTIONS.join(', ')}`
      };
    }

    // Validate based on action type
    switch (command.action) {
      case 'add_transaction':
        return this.validateTransactionAdd(command);
      case 'edit_transaction':
        return this.validateTransactionEdit(command);
      case 'delete_transaction':
        return this.validateTransactionDelete(command);
      case 'add_debt':
        return this.validateDebtAdd(command);
      case 'add_borrow':
        return this.validateBorrowAdd(command);
      case 'mark_debt_paid':
      case 'delete_debt':
        return this.validateDebtOperation(command);
      case 'mark_borrow_paid':
      case 'delete_borrow':
        return this.validateBorrowOperation(command);
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  private static validateTransactionAdd(command: AITransactionCommand): AICommandResult {
    const errors: string[] = [];

    // Validate type
    if (!command.type || !['income', 'expense'].includes(command.type)) {
      errors.push('Invalid transaction type. Must be "income" or "expense"');
    }

    // Validate amount with enhanced precision handling
    if (command.amount === undefined || command.amount === null) {
      errors.push('Amount is required');
    } else {
      const amountValidation = InputValidator.validateAmount(String(command.amount));
      if (!amountValidation.isValid) {
        errors.push(amountValidation.error || 'Invalid amount format');
      } else {
        // Ensure amount is positive and reasonable
        const amount = amountValidation.value!;
        if (amount <= 0) {
          errors.push('Amount must be greater than 0');
        }
        if (amount > 1000000) {
          errors.push('Amount seems unreasonably large (max: RM 1,000,000)');
        }
        // Round to prevent precision issues
        command.amount = FinancialMath.round(amount);
      }
    }

    // Validate category against known categories
    if (!command.category || command.category.trim() === '') {
      errors.push('Category is required');
    } else {
      const validCategories = command.type === 'expense' 
        ? this.EXPENSE_CATEGORIES 
        : this.INCOME_CATEGORIES;
      
      if (!validCategories.includes(command.category)) {
        // Allow custom categories but warn
        console.warn(`Unknown category: ${command.category}. Valid categories: ${validCategories.join(', ')}`);
      }
    }

    // Validate note (optional but with limits)
    if (command.note) {
      const noteValidation = InputValidator.validateNote(command.note);
      if (!noteValidation.isValid) {
        errors.push(noteValidation.error || 'Invalid note format');
      }
    }

    // Validate date format if provided
    if (command.date) {
      const dateValidation = InputValidator.validateDate(command.date);
      if (!dateValidation.isValid) {
        errors.push(dateValidation.error || 'Invalid date format');
      }
    }

    if (errors.length > 0) {
      return { success: false, error: errors.join(', ') };
    }

    return { success: true, command };
  }

  private static validateTransactionEdit(command: AITransactionCommand): AICommandResult {
    if (!command.entryId) {
      return { success: false, error: 'Entry ID is required for edit operations' };
    }

    // Validate any provided fields
    if (command.amount !== undefined) {
      const amountValidation = InputValidator.validateAmount(String(command.amount));
      if (!amountValidation.isValid) {
        return { success: false, error: amountValidation.error || 'Invalid amount' };
      }
    }

    return { success: true, command };
  }

  private static validateTransactionDelete(command: AITransactionCommand): AICommandResult {
    if (!command.entryId) {
      return { success: false, error: 'Entry ID is required for delete operations' };
    }

    return { success: true, command };
  }

  private static validateDebtAdd(command: AITransactionCommand): AICommandResult {
    const errors: string[] = [];

    // Validate person name
    if (!command.person || command.person.trim() === '') {
      errors.push('Person name is required for debt entries');
    } else {
      const personValidation = InputValidator.validatePersonName(command.person.trim());
      if (!personValidation.isValid) {
        errors.push(personValidation.error || 'Invalid person name format');
      } else {
        // Normalize person name
        command.person = personValidation.value;
      }
    }

    // Validate amount with enhanced checks
    if (command.amount === undefined || command.amount === null) {
      errors.push('Amount is required for debt entries');
    } else {
      const amountValidation = InputValidator.validateAmount(String(command.amount));
      if (!amountValidation.isValid) {
        errors.push(amountValidation.error || 'Invalid amount format');
      } else {
        const amount = amountValidation.value!;
        if (amount <= 0) {
          errors.push('Debt amount must be greater than 0');
        }
        if (amount > 100000) {
          errors.push('Debt amount seems unreasonably large (max: RM 100,000)');
        }
        // Round to prevent precision issues
        command.amount = FinancialMath.round(amount);
      }
    }

    // Validate note (optional)
    if (command.note) {
      const noteValidation = InputValidator.validateNote(command.note);
      if (!noteValidation.isValid) {
        errors.push(noteValidation.error || 'Invalid note format');
      }
    }

    if (errors.length > 0) {
      return { success: false, error: errors.join(', ') };
    }

    return { success: true, command };
  }

  private static validateBorrowAdd(command: AITransactionCommand): AICommandResult {
    const result = this.validateDebtAdd(command); // Same validation as debt
    
    // Additional validation for due date if provided
    if (result.success && command.dueDate) {
      const dateValidation = InputValidator.validateDate(command.dueDate);
      if (!dateValidation.isValid) {
        return { success: false, error: dateValidation.error || 'Invalid due date' };
      }
    }

    return result;
  }

  private static validateDebtOperation(command: AITransactionCommand): AICommandResult {
    if (!command.debtId) {
      return { success: false, error: 'Debt ID is required for debt operations' };
    }

    return { success: true, command };
  }

  private static validateBorrowOperation(command: AITransactionCommand): AICommandResult {
    if (!command.borrowId) {
      return { success: false, error: 'Borrow ID is required for borrow operations' };
    }

    return { success: true, command };
  }

  /**
   * Generate enhanced unique command ID for duplicate prevention
   */
  static generateCommandId(command: AITransactionCommand): string {
    const parts = [
      command.action,
      command.type || '',
      command.amount ? FinancialMath.round(command.amount).toString() : '',
      command.category || '',
      command.person || '',
      command.note || '',
      command.entryId || '',
      command.debtId || '',
      command.borrowId || '',
    ];
    
    // Create a deterministic hash-like ID
    const baseId = parts.join('|');
    
    // Add some entropy to prevent exact duplicates but allow detection
    return `${command.action}-${this.simpleHash(baseId)}`;
  }

  /**
   * Simple hash function for command ID generation
   */
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  /**
   * Clear processed commands cache
   */
  static clearProcessedCommands(): void {
    this.processedCommands.clear();
  }

  /**
   * Get count of processed commands
   */
  static getProcessedCommandsCount(): number {
    return this.processedCommands.size;
  }
}