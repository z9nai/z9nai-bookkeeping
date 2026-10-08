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
}

// One file per year: budget-YYYY.json
export interface YearData {
  year: number;
  budget: Record<string, number>; // categoryId → CHF per month
  bookings: Booking[];
  months?: number;                // months to divide by for Ø and Hochrechnung (sheet cell B19); default: see bookedMonths()
}

export const EMPTY_YEAR = (year: number): YearData => ({ year, budget: {}, bookings: [] });
