// Monthly fixed bookings (Fixbuchungen / Abschreibungen): which months a
// definition covers and which generated bookings are still missing.
import type { Booking, Recurring, YearData } from './types.ts';
import { pad, round2 } from './budget.ts';

export const ymOf = (iso: string) => iso.slice(0, 7);
export const ymToday = (today = new Date()) => `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
export const bookingId = (r: Recurring, ym: string) => `rec-${r.id}-${ym}`;

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// Number of months a total needs at the monthly amount (last month may be partial)
export function monthsFor(r: Recurring): number | null {
  if (!r.total || !r.amount) return null;
  return Math.max(1, Math.ceil(round2(r.total) / Math.abs(r.amount) - 1e-9));
}

// Last month covered ("YYYY-MM"), or null for an open end. Skipped months
// do not consume the total, so they push the end out.
export function recurringEnd(r: Recurring): string | null {
  if (r.to) return r.to;
  const n = monthsFor(r);
  if (n == null) return null;
  let ym = r.from, left = n;
  for (let i = 0; i < 1200 && left > 0; i++) {
    if (!r.skip?.includes(ym)) left--;
    if (left > 0) ym = addMonths(ym, 1);
  }
  return ym;
}

// The months to book with their amounts, up to and including `uptoYm`
export function plannedMonths(r: Recurring, uptoYm: string): { ym: string; amount: number }[] {
  const out: { ym: string; amount: number }[] = [];
  const end = recurringEnd(r);
  let remaining = r.total ?? Infinity;
  for (let ym = r.from, i = 0; ym <= uptoYm && (end == null || ym <= end) && i < 1200; ym = addMonths(ym, 1), i++) {
    if (r.skip?.includes(ym)) continue;
    const amount = r.total ? Math.min(Math.abs(r.amount), round2(remaining)) * Math.sign(r.amount) : r.amount;
    if (r.total && remaining <= 0.004) break;
    out.push({ ym, amount: round2(amount) });
    remaining -= Math.abs(amount);
  }
  return out;
}

function generated(r: Recurring, ym: string, amount: number): Booking {
  return { id: bookingId(r, ym), date: `${ym}-01`, categoryId: r.categoryId, amount, text: r.text || r.name, recurringId: r.id, ...(r.noBank ? { noBank: true } : {}) };
}

const sameBooking = (a: Booking, b: Booking) =>
  a.date === b.date && a.categoryId === b.categoryId && a.amount === b.amount && a.text === b.text && !!a.noBank === !!b.noBank;

// Brings the generated bookings in line with the definitions: adds months
// that are due, updates changed ones and removes months no longer planned.
// Returns the years that changed with their complete new booking lists.
export function syncGenerated(recurring: Recurring[], years: Record<number, YearData>, uptoYm: string): Record<number, Booking[]> {
  const wanted = new Map<string, Booking>(); // booking id → booking as it should be
  for (const r of recurring) {
    if (!r.categoryId || !r.amount || !/^\d{4}-\d{2}$/.test(r.from)) continue;
    for (const { ym, amount } of plannedMonths(r, uptoYm)) wanted.set(bookingId(r, ym), generated(r, ym, amount));
  }
  const ids = new Set(recurring.map(r => r.id));
  const changed: Record<number, Booking[]> = {};
  const touched = new Set<number>();
  for (const b of wanted.values()) touched.add(Number(b.date.slice(0, 4)));
  for (const y of Object.values(years)) if (y.bookings.some(b => b.recurringId && ids.has(b.recurringId))) touched.add(y.year);
  for (const year of touched) {
    const list = years[year]?.bookings ?? [];
    let dirty = false;
    const next: Booking[] = [];
    for (const b of list) {
      if (!b.recurringId || !ids.has(b.recurringId)) { next.push(b); continue; } // hand-made or from a deleted definition: keep
      const w = wanted.get(b.id);
      if (!w) { dirty = true; continue; }        // no longer planned (start moved, skipped, total reached)
      if (!sameBooking(b, w)) dirty = true;
      next.push(w);
      wanted.delete(b.id);
    }
    for (const w of wanted.values()) if (Number(w.date.slice(0, 4)) === year) { next.push(w); dirty = true; }
    if (dirty) changed[year] = next;
  }
  return changed;
}

// Already booked amount of a definition (from the actual bookings)
export function bookedSoFar(r: Recurring, years: Record<number, YearData>): { months: number; amount: number } {
  let months = 0, amount = 0;
  for (const y of Object.values(years)) for (const b of y.bookings) if (b.recurringId === r.id) { months++; amount += b.amount; }
  return { months, amount: round2(amount) };
}
