import { FinancialMath } from './decimal-math';
import { DateUtils } from './date-utils';
import { supabase } from './supabase';

export type EntryType = "expense" | "income";

export type Entry = {
  id: string;
  type: EntryType;
  amount: number;
  category: string;
  note?: string;
  createdAt: string; // ISO
};

export type DayData = {
  date: string; // YYYY-MM-DD
  startingBalance: number;
  entries: Entry[];
};

export type DebtStatus = "unpaid" | "paid";
export type Debt = {
  id: string;
  person: string;
  amount: number;
  note?: string;
  status: DebtStatus;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  repaymentRecorded?: boolean;
  repaymentEntryId?: string;
};

/**
 * Validates that the current session is valid and matches stored user ID
 * @throws Error if session is invalid or mismatched
 */
export async function validateUserSession(): Promise<string> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError) {
    localStorage.clear();
    throw new Error(`Authentication error: ${authError.message}`);
  }
  
  if (!user) {
    localStorage.clear();
    throw new Error('No authenticated user found');
  }
  
  const localUserId = localStorage.getItem("current_user_id");
  if (localUserId !== user.id) {
    console.warn('Session mismatch detected:', { localUserId, serverUserId: user.id });
    localStorage.clear();
    throw new Error('Session inconsistency detected. Please sign in again.');
  }
  
  return user.id;
}

function currentUserNs(): string {
  try {
    const uid = localStorage.getItem("current_user_id");
    
    // Strict validation: user ID must exist and be valid UUID format
    if (!uid || uid.length < 32 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      console.warn('Invalid or missing user ID detected');
      // Clear potentially corrupted data and force re-authentication
      localStorage.clear();
      throw new Error('Authentication required');
    }
    
    return `user_${uid}_`;
  } catch (error) {
    console.error('User namespace error:', error);
    // Force logout/re-authentication by clearing storage
    localStorage.clear();
    // Redirect to prevent accessing unnamespaced data
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
    return "";
  }
}

const DAILY_BAL_PREFIX = "daily_balance_";
const DAY_DATA_PREFIX = "day_data_";
const DEBTS_KEY = "debts_v1";
const BORROWS_KEY = "borrows_v1";

export function formatDate(date: Date): string {
  return DateUtils.formatDate(date);
}

export function getStartingBalance(dateKey: string): number | null {
  const value = localStorage.getItem(currentUserNs() + DAILY_BAL_PREFIX + dateKey);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getYesterdayEndingBalance(): number | null {
  const yesterdayKey = DateUtils.getYesterdayKey();
  const yesterdayData = getDayData(yesterdayKey);
  
  // Only return balance if there's actual data for yesterday
  if (yesterdayData.entries.length === 0 && yesterdayData.startingBalance === 0) {
    return null;
  }
  
  const totals = calculateTotals(yesterdayData);
  return totals.remaining;
}

export function setStartingBalance(dateKey: string, amount: number): void {
  localStorage.setItem(currentUserNs() + DAILY_BAL_PREFIX + dateKey, String(amount));
}

export function getDayData(dateKey: string): DayData {
  const raw = localStorage.getItem(currentUserNs() + DAY_DATA_PREFIX + dateKey);
  if (!raw) {
    return { date: dateKey, startingBalance: getStartingBalance(dateKey) ?? 0, entries: [] };
  }
  try {
    const parsed = JSON.parse(raw) as DayData;
    return parsed;
  } catch {
    return { date: dateKey, startingBalance: getStartingBalance(dateKey) ?? 0, entries: [] };
  }
}

export function saveDayData(day: DayData): void {
  localStorage.setItem(currentUserNs() + DAY_DATA_PREFIX + day.date, JSON.stringify(day));
}

export function addEntry(dateKey: string, entry: Omit<Entry, "id" | "createdAt">): Entry {
  // Ensure amount is properly rounded for financial calculations
  const validatedAmount = FinancialMath.round(entry.amount);
  
  const day = getDayData(dateKey);
  const newEntry: Entry = {
    ...entry,
    amount: validatedAmount,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  day.entries.unshift(newEntry);
  saveDayData(day);
  return newEntry;
}

export function deleteEntry(dateKey: string, entryId: string): void {
  const day = getDayData(dateKey);
  day.entries = day.entries.filter((e) => e.id !== entryId);
  saveDayData(day);
}

export function updateEntry(
  dateKey: string,
  entryId: string,
  updates: Partial<Pick<Entry, "type" | "amount" | "category" | "note">>
): Entry | null {
  const day = getDayData(dateKey);
  const idx = day.entries.findIndex((e) => e.id === entryId);
  if (idx === -1) return null;
  const current = day.entries[idx];
  
  // Validate and round amount if it's being updated
  const validatedUpdates = { ...updates };
  if (updates.amount !== undefined) {
    validatedUpdates.amount = FinancialMath.round(updates.amount);
  }
  
  const next: Entry = {
    ...current,
    ...validatedUpdates,
  };
  day.entries[idx] = next;
  saveDayData(day);
  return next;
}

export function getHistoryDates(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const p = currentUserNs() + DAY_DATA_PREFIX;
    if (key.startsWith(p)) {
      keys.push(key.replace(p, ""));
    }
  }
  return keys.sort().reverse();
}

export function calculateTotals(day: DayData): { income: number; expenses: number; remaining: number } {
  // Use decimal math for precise calculations
  const incomeEntries = day.entries.filter((e) => e.type === "income");
  const expenseEntries = day.entries.filter((e) => e.type === "expense");
  
  const income = FinancialMath.sum(incomeEntries.map(e => e.amount));
  const expenses = FinancialMath.sum(expenseEntries.map(e => e.amount));
  
  // Include debts and borrows in balance calculation
  const unpaidDebts = FinancialMath.sum(getDebts().filter((d) => d.status === "unpaid").map(d => d.amount));
  const unpaidBorrows = FinancialMath.sum(getBorrows().filter((b) => b.status === "unpaid").map(b => b.amount));
  
  // Fixed logic: 
  // - Unpaid debts: Money you lent out (reduces available balance)
  // - Unpaid borrows: Money you received (increases available balance)
  let remaining = day.startingBalance;
  remaining = FinancialMath.add(remaining, income);
  remaining = FinancialMath.subtract(remaining, expenses);
  remaining = FinancialMath.subtract(remaining, unpaidDebts);
  remaining = FinancialMath.add(remaining, unpaidBorrows);
  
  // Round all results to 2 decimal places
  return { 
    income: FinancialMath.round(income), 
    expenses: FinancialMath.round(expenses), 
    remaining: FinancialMath.round(remaining) 
  };
}

export function eraseAllData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(currentUserNs() + DAILY_BAL_PREFIX) || key.startsWith(currentUserNs() + DAY_DATA_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem(currentUserNs() + DEBTS_KEY);
  localStorage.removeItem(currentUserNs() + BORROWS_KEY);
}

// Debts
export function getDebts(): Debt[] {
  const raw = localStorage.getItem(currentUserNs() + DEBTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Debt[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDebts(debts: Debt[]): void {
  localStorage.setItem(currentUserNs() + DEBTS_KEY, JSON.stringify(debts));
}

export function addDebt(input: { person: string; amount: number; note?: string }): Debt {
  // Ensure amount is properly rounded for financial calculations
  const validatedAmount = FinancialMath.round(input.amount);
  
  const debts = getDebts();
  const now = new Date().toISOString();
  const debt: Debt = {
    id: crypto.randomUUID(),
    person: input.person.trim(),
    amount: validatedAmount,
    note: input.note?.trim() || undefined,
    status: "unpaid",
    createdAt: now,
    updatedAt: now,
  };
  debts.unshift(debt);
  saveDebts(debts);
  return debt;
}

export function setDebtStatus(debtId: string, status: DebtStatus): Debt | null {
  const debts = getDebts();
  const idx = debts.findIndex((d) => d.id === debtId);
  if (idx === -1) return null;
  debts[idx] = { ...debts[idx], status, updatedAt: new Date().toISOString() };
  saveDebts(debts);
  return debts[idx];
}

export function markDebtPaid(debtId: string): { debt: Debt | null; createdIncome: Entry | null } {
  const debts = getDebts();
  const idx = debts.findIndex((d) => d.id === debtId);
  if (idx === -1) return { debt: null, createdIncome: null };
  const existing = debts[idx];

  // Simply mark as paid - no need to create income entry since balance calculation handles this
  const updated: Debt = { ...existing, status: "paid", updatedAt: new Date().toISOString() };
  debts[idx] = updated;
  saveDebts(debts);
  return { debt: updated, createdIncome: null };
}

// Borrowed (you owe others)
export type BorrowStatus = "unpaid" | "paid";
export type Borrow = {
  id: string;
  person: string;
  amount: number;
  note?: string;
  dueDate?: string; // YYYY-MM-DD
  status: BorrowStatus;
  createdAt: string;
  updatedAt: string;
  repaymentRecorded?: boolean;
  repaymentEntryId?: string;
};

export function getBorrows(): Borrow[] {
  const raw = localStorage.getItem(currentUserNs() + BORROWS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Borrow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBorrows(borrows: Borrow[]): void {
  localStorage.setItem(currentUserNs() + BORROWS_KEY, JSON.stringify(borrows));
}

export function addBorrow(input: { person: string; amount: number; note?: string; dueDate?: string }): Borrow {
  // Ensure amount is properly rounded for financial calculations
  const validatedAmount = FinancialMath.round(input.amount);
  
  const borrows = getBorrows();
  const now = new Date().toISOString();
  const borrow: Borrow = {
    id: crypto.randomUUID(),
    person: input.person.trim(),
    amount: validatedAmount,
    note: input.note?.trim() || undefined,
    dueDate: input.dueDate,
    status: "unpaid",
    createdAt: now,
    updatedAt: now,
  };
  borrows.unshift(borrow);
  saveBorrows(borrows);
  return borrow;
}

export function setBorrowStatus(borrowId: string, status: BorrowStatus): Borrow | null {
  const borrows = getBorrows();
  const idx = borrows.findIndex((b) => b.id === borrowId);
  if (idx === -1) return null;
  borrows[idx] = { ...borrows[idx], status, updatedAt: new Date().toISOString() };
  saveBorrows(borrows);
  return borrows[idx];
}

export function markBorrowPaid(borrowId: string): { borrow: Borrow | null; createdExpense: Entry | null } {
  const borrows = getBorrows();
  const idx = borrows.findIndex((b) => b.id === borrowId);
  if (idx === -1) return { borrow: null, createdExpense: null };
  const existing = borrows[idx];

  // Simply mark as paid - no need to create expense entry since balance calculation handles this
  const updated: Borrow = { ...existing, status: "paid", updatedAt: new Date().toISOString() };
  borrows[idx] = updated;
  saveBorrows(borrows);
  return { borrow: updated, createdExpense: null };
}



