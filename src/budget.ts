// Pure calculations shared by the views, the import and the CLI script
import type { Booking, Category, CategoryKind, YearData } from './types.ts';

export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export const pad = (n: number) => String(n).padStart(2, '0');
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
export const monthOf = (iso: string) => Number(iso.slice(5, 7)); // 1-12
export const yearOf = (iso: string) => Number(iso.slice(0, 4));
export const round2 = (n: number) => Math.round(n * 100) / 100;

// Whole francs with Swiss grouping: 10'206
export const fmtChf = (n: number) => Math.round(n).toLocaleString('de-CH', { maximumFractionDigits: 0 });
// Exact amount for editing / lists: 1'234.50 (no decimals when integer)
export const fmtAmount = (n: number) => n.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const fmtPct = (n: number) => `${Math.round(n)}%`;

// "1'234.50", "1234,5", "-12" → number (NaN when empty / invalid)
export function parseAmount(s: string): number {
  const t = s.trim().replace(/['’`\s]/g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
}

export function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const sortBookings = (list: Booking[]) =>
  [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

// ── Year statistics ─────────────────────────────────────────────────────────
export interface LineStats {
  months: number[];      // 12 sums (index 0 = Januar)
  total: number;         // all 12 months (also months prepared ahead)
  booked: number;        // the booked months only
  avg: number;           // booked / booked months
  budgetMonth: number;
  budgetYear: number;
  remaining: number;     // budgetYear − total  (sheet: "Überschuss")
  forecast: number;      // avg × 12            (sheet: "Hochrechnung bis Ende Jahr")
  deviation: number;     // budgetYear − forecast (sheet: "Abweichung vom Budget")
  deviationPct: number | null; // deviation × 100 / budgetYear
}

export interface YearStats {
  year: number;
  bookedMonths: number;  // divisor for the monthly average (sheet cell B19)
  cats: Record<string, LineStats>;
  expense: LineStats;
  income: LineStats;
  surplus: number[];     // income − expense per month
  cumulative: number[];  // running surplus
  surplusTotal: number;
  surplusBooked: number; // booked months only
  surplusBudgetMonth: number;
  surplusBudgetYear: number;
  surplusForecast: number;
}

// Divisor for Ø and Hochrechnung (the sheet keeps it by hand in B19): an
// explicit value on the year wins; otherwise past years count 12, the running
// year its completed months (at least 1) and future years 0 → no averages.
export function bookedMonths(year: YearData, today = new Date()): number {
  if (year.months != null && year.months >= 0) return Math.min(12, Math.round(year.months));
  const cy = today.getFullYear();
  if (year.year < cy) return 12;
  if (year.year > cy) return 0;
  return Math.max(1, today.getMonth());
}

function line(months: number[], budgetMonth: number, n: number): LineStats {
  const total = months.reduce((a, b) => a + b, 0);
  const booked = months.slice(0, n).reduce((a, b) => a + b, 0);
  const avg = n > 0 ? booked / n : 0;
  const budgetYear = budgetMonth * 12;
  const forecast = avg * 12;
  const deviation = budgetYear - forecast;
  return {
    months, total, booked, avg, budgetMonth, budgetYear,
    remaining: budgetYear - total, forecast, deviation,
    deviationPct: budgetYear !== 0 ? deviation * 100 / budgetYear : null,
  };
}

export function yearStats(year: YearData, categories: Category[], today = new Date()): YearStats {
  const n = bookedMonths(year, today);
  const sums: Record<string, number[]> = {};
  for (const c of categories) sums[c.id] = Array(12).fill(0);
  for (const b of year.bookings) {
    const m = monthOf(b.date) - 1;
    if (m < 0 || m > 11) continue;
    (sums[b.categoryId] ??= Array(12).fill(0))[m] += b.amount;
  }
  const kindOf = new Map(categories.map(c => [c.id, c.kind]));
  const cats: Record<string, LineStats> = {};
  const agg: Record<CategoryKind, { months: number[]; budget: number }> = {
    expense: { months: Array(12).fill(0), budget: 0 },
    income: { months: Array(12).fill(0), budget: 0 },
  };
  for (const [id, months] of Object.entries(sums)) {
    const kind = kindOf.get(id) ?? 'expense';
    const bm = year.budget[id] ?? 0;
    cats[id] = line(months, bm, n);
    agg[kind].budget += bm;
    months.forEach((v, i) => { agg[kind].months[i] += v; });
  }
  // Budgets for categories without bookings still count
  for (const c of categories) if (!sums[c.id]) {
    cats[c.id] = line(Array(12).fill(0), year.budget[c.id] ?? 0, n);
    agg[c.kind].budget += year.budget[c.id] ?? 0;
  }
  const expense = line(agg.expense.months, agg.expense.budget, n);
  const income = line(agg.income.months, agg.income.budget, n);
  const surplus = income.months.map((v, i) => v - expense.months[i]);
  const surplusBooked = income.booked - expense.booked;
  const cumulative: number[] = [];
  surplus.reduce((acc, v, i) => { cumulative[i] = acc + v; return acc + v; }, 0);
  return {
    year: year.year, bookedMonths: n, cats, expense, income, surplus, cumulative,
    surplusTotal: income.total - expense.total,
    surplusBooked,
    surplusBudgetMonth: income.budgetMonth - expense.budgetMonth,
    surplusBudgetYear: income.budgetYear - expense.budgetYear,
    surplusForecast: income.forecast - expense.forecast,
  };
}

// Categories to show for a year: active ones plus archived ones that still have data there
export function categoriesForYear(categories: Category[], year: YearData | undefined, kind: CategoryKind): Category[] {
  const used = new Set<string>();
  if (year) {
    for (const b of year.bookings) used.add(b.categoryId);
    for (const [id, v] of Object.entries(year.budget)) if (v) used.add(id);
  }
  return categories.filter(c => c.kind === kind && (!c.archived || used.has(c.id)));
}
