/**
 * Safe date utilities for financial tracking
 */
export class DateUtils {
  /**
   * Format date to YYYY-MM-DD string safely
   */
  static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get yesterday's date key safely
   */
  static getYesterdayKey(): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return this.formatDate(yesterday);
  }

  /**
   * Get today's date key
   */
  static getTodayKey(): string {
    return this.formatDate(new Date());
  }

  /**
   * Parse date string safely
   */
  static parseDate(dateString: string): Date | null {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return null;
      }
      return date;
    } catch {
      return null;
    }
  }

  /**
   * Check if date is today
   */
  static isToday(dateString: string): boolean {
    return dateString === this.getTodayKey();
  }

  /**
   * Check if date is in the past
   */
  static isPast(dateString: string): boolean {
    const date = this.parseDate(dateString);
    if (!date) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    return date < today;
  }

  /**
   * Get date difference in days
   */
  static daysDifference(date1: string, date2: string): number {
    const d1 = this.parseDate(date1);
    const d2 = this.parseDate(date2);
    
    if (!d1 || !d2) return 0;
    
    const timeDiff = d2.getTime() - d1.getTime();
    return Math.round(timeDiff / (1000 * 60 * 60 * 24));
  }

  /**
   * Add days to a date string safely
   */
  static addDays(dateString: string, days: number): string {
    const date = this.parseDate(dateString);
    if (!date) return dateString;
    
    date.setDate(date.getDate() + days);
    return this.formatDate(date);
  }
}