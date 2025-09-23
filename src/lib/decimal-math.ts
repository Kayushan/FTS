import Decimal from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.config({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -28,
  toExpPos: 28,
  minE: -324,
  maxE: 308,
  crypto: false,
  modulo: Decimal.ROUND_DOWN
});

export class FinancialMath {
  /**
   * Safely add financial amounts
   */
  static add(a: number | string, b: number | string): number {
    return new Decimal(a).plus(new Decimal(b)).toNumber();
  }

  /**
   * Safely subtract financial amounts
   */
  static subtract(a: number | string, b: number | string): number {
    return new Decimal(a).minus(new Decimal(b)).toNumber();
  }

  /**
   * Safely multiply financial amounts
   */
  static multiply(a: number | string, b: number | string): number {
    return new Decimal(a).times(new Decimal(b)).toNumber();
  }

  /**
   * Safely divide financial amounts
   */
  static divide(a: number | string, b: number | string): number {
    return new Decimal(a).dividedBy(new Decimal(b)).toNumber();
  }

  /**
   * Sum an array of financial amounts
   */
  static sum(amounts: (number | string)[]): number {
    return amounts.reduce((acc: number, amount) => 
      new Decimal(acc).plus(new Decimal(amount)).toNumber(), 0
    );
  }

  /**
   * Round to 2 decimal places (standard for currency)
   */
  static round(amount: number | string): number {
    return new Decimal(amount).toDecimalPlaces(2).toNumber();
  }

  /**
   * Check if amount is valid financial value
   */
  static isValidAmount(amount: any): boolean {
    try {
      const decimal = new Decimal(amount);
      return decimal.isFinite() && decimal.gte(0);
    } catch {
      return false;
    }
  }

  /**
   * Format for display (ensures 2 decimal places)
   */
  static toFixed(amount: number | string, places: number = 2): string {
    return new Decimal(amount).toFixed(places);
  }
}