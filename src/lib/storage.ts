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

function currentUserNs(): string {
  try {
    const uid = localStorage.getItem("current_user_id");
    return uid ? `user_${uid}_` : "";
  } catch {
    return "";
  }
}

const DAILY_BAL_PREFIX = "daily_balance_";
const DAY_DATA_PREFIX = "day_data_";
const DEBTS_KEY = "debts_v1";
const BORROWS_KEY = "borrows_v1";

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getStartingBalance(dateKey: string): number | null {
  const value = localStorage.getItem(currentUserNs() + DAILY_BAL_PREFIX + dateKey);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const day = getDayData(dateKey);
  const newEntry: Entry = {
    ...entry,
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
  const next: Entry = {
    ...current,
    ...updates,
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
  const income = day.entries.filter((e) => e.type === "income").reduce((sum, e) => sum + e.amount, 0);
  const expenses = day.entries.filter((e) => e.type === "expense").reduce((sum, e) => sum + e.amount, 0);
  const remaining = day.startingBalance + income - expenses;
  return { income, expenses, remaining };
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
  const debts = getDebts();
  const now = new Date().toISOString();
  const debt: Debt = {
    id: crypto.randomUUID(),
    person: input.person.trim(),
    amount: input.amount,
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
  let createdIncome: Entry | null = null;
  const todayKey = formatDate(new Date());

  let updated: Debt = { ...existing, status: "paid", updatedAt: new Date().toISOString() };
  if (!updated.repaymentRecorded) {
    const note = `From ${updated.person}${updated.note ? ` - ${updated.note}` : ""}`.trim();
    const entry = addEntry(todayKey, { type: "income", amount: updated.amount, category: "Debt Repayment", note });
    updated = { ...updated, repaymentRecorded: true, repaymentEntryId: entry.id };
    createdIncome = entry;
  }
  debts[idx] = updated;
  saveDebts(debts);
  return { debt: updated, createdIncome };
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
  const borrows = getBorrows();
  const now = new Date().toISOString();
  const borrow: Borrow = {
    id: crypto.randomUUID(),
    person: input.person.trim(),
    amount: input.amount,
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
  const todayKey = formatDate(new Date());
  let createdExpense: Entry | null = null;

  let updated: Borrow = { ...existing, status: "paid", updatedAt: new Date().toISOString() };
  if (!updated.repaymentRecorded) {
    const note = `To ${updated.person}${updated.note ? ` - ${updated.note}` : ""}`.trim();
    const entry = addEntry(todayKey, { type: "expense", amount: updated.amount, category: "Loan Repayment", note });
    createdExpense = entry;
    updated = { ...updated, repaymentRecorded: true, repaymentEntryId: entry.id };
  }
  borrows[idx] = updated;
  saveBorrows(borrows);
  return { borrow: updated, createdExpense };
}



