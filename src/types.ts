export type CategoryKind = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;      // key from CATEGORY_COLORS palette
  archived?: boolean; // no longer in use (kept for old years)
}

export interface Booking {
  id: string;
  date: string;       // ISO date "2025-03-14"
  categoryId: string;
  amount: number;     // CHF, positive within its kind; negative = refund / correction
  text: string;
  recurringId?: string; // generated from a recurring booking (Fixbuchung)
  noBank?: boolean;     // pure bookkeeping entry without a bank movement (Abschreiber) → excluded from the bank reconciliation
}

// One file per year: budget-YYYY.json
export interface YearData {
  year: number;
  budget: Record<string, number>; // categoryId → CHF per month
  bookings: Booking[];
  months?: number;                // months to divide by for Ø and Hochrechnung (sheet cell B19); default: see bookedMonths()
  balances?: Record<string, Record<string, number>>; // "YYYY-MM" → accountId → debits on that account in the month; key "_adjust" = non-expense debits (Abgleich)
}

// ── Settings (settings.json) ────────────────────────────────────────────────
export interface Account {
  id: string;
  name: string;
}

// Monthly fixed booking, e.g. a depreciation: the same amount every month from
// `from` until `to`, or until `total` is written off.
export interface Recurring {
  id: string;
  name: string;
  categoryId: string;
  amount: number;      // CHF per month
  text: string;
  from: string;        // "YYYY-MM"
  to?: string;         // "YYYY-MM" (inclusive); omitted = open end or derived from total
  total?: number;      // total to write off (Abschreibung) → the last month books the remainder
  skip?: string[];     // months ("YYYY-MM") left out on purpose
  noBank?: boolean;    // pure bookkeeping entry without a bank movement (Abschreibung) → excluded from the bank reconciliation
}

export interface Settings {
  accounts: Account[];
  recurring: Recurring[];
}

export const EMPTY_SETTINGS: Settings = { accounts: [], recurring: [] };

export const EMPTY_YEAR = (year: number): YearData => ({ year, budget: {}, bookings: [] });
