// Import of the "Family Budget" Google Sheet (exported as .xlsx).
//
// Layout of every year tab ("2006" … "2026"):
//   row 1   : year | | | <expense categories…> | TOTAL | <income categories…> | TOTAL | Überschuss
//   row 2   : "Pro Monat" budget per category
//   rows 5–16: Januar … Dezember; a cell is a formula adding the single amounts
//              of that month, e.g. "=400+40+98" → three bookings
//   row 18  : "Total" (used to verify the import)
import type { Booking, Category, CategoryKind, YearData } from './types.ts';
import { MONTH_NAMES, pad, round2 } from './budget.ts';
import { nextColor } from './colors.ts';
import { cellRef, type XCell, type XSheet } from './xlsxRead.ts';

export interface Term { amount: number; text: string } // text: the expression when it is not a plain number

export interface ImportCell {
  header: string;
  month: number;            // 1-12
  terms: Term[];
  cached: number | null;    // value stored in the sheet
  formula?: string;
  mismatch?: boolean;       // terms did not add up to the cached value → one booking with the cached value
}

export interface ImportColumn { header: string; kind: CategoryKind; col: number }

export interface ImportYear {
  year: number;
  columns: ImportColumn[];
  budget: Record<string, number>;     // header → CHF per month
  cells: ImportCell[];
  bookingCount: number;
  cachedTotals: { expense: number | null; income: number | null };
  warnings: string[];
}

export interface Analysis {
  years: ImportYear[];      // newest first
  headers: { name: string; kind: CategoryKind; years: number[] }[]; // distinct, newest first
  warnings: string[];
}

// ── Formula terms ───────────────────────────────────────────────────────────
// Splits "1500-45+99" / "(45+40+30)*1.2+200" / "8004/12+40" into top-level
// terms (split at + / - outside parentheses) and evaluates every term.
class Parser {
  private i = 0;
  private s: string;
  constructor(s: string) { this.s = s; }
  private peek() { return this.s[this.i]; }
  expr(): number {
    let v = this.term();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.s[this.i++];
      const r = this.term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  private term(): number {
    let v = this.factor();
    while (this.peek() === '*' || this.peek() === '/') {
      const op = this.s[this.i++];
      const r = this.factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  private factor(): number {
    const c = this.peek();
    if (c === '+') { this.i++; return this.factor(); }
    if (c === '-') { this.i++; return -this.factor(); }
    if (c === '(') {
      this.i++;
      const v = this.expr();
      if (this.peek() !== ')') throw new Error('Klammer nicht geschlossen');
      this.i++;
      return v;
    }
    const m = this.s.slice(this.i).match(/^\d+(\.\d+)?|^\.\d+/);
    if (!m) throw new Error(`Unerwartetes Zeichen "${c ?? 'Ende'}"`);
    this.i += m[0].length;
    return Number(m[0]);
  }
  done() { return this.i >= this.s.length; }
}

export function evalArithmetic(expr: string): number {
  const p = new Parser(expr.replace(/\s+/g, ''));
  const v = p.expr();
  if (!p.done()) throw new Error('Ausdruck nicht vollständig gelesen');
  return v;
}

// Top-level split: "1500-45+(10+5)*2" → ["1500", "-45", "+(10+5)*2"]
export function splitTerms(body: string): string[] {
  const s = body.replace(/\s+/g, '');
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    if (c === ')') depth--;
    if ((c === '+' || c === '-') && depth === 0 && cur !== '' && !/[+\-*/(]$/.test(cur)) {
      out.push(cur);
      cur = c;
    } else {
      cur += c;
    }
  }
  if (cur !== '') out.push(cur);
  return out;
}

const isPlainNumber = (t: string) => /^[+-]?\d+(\.\d+)?$/.test(t);

export function termsOf(cell: XCell): { terms: Term[]; mismatch: boolean } {
  const cached = typeof cell.v === 'number' ? cell.v : null;
  if (cell.f == null) {
    return { terms: cached != null && cached !== 0 ? [{ amount: round2(cached), text: '' }] : [], mismatch: false };
  }
  try {
    const terms: Term[] = [];
    for (const t of splitTerms(cell.f)) {
      const amount = round2(evalArithmetic(t));
      if (amount === 0) continue;
      terms.push({ amount, text: isPlainNumber(t) ? '' : t.replace(/^\+/, '') });
    }
    const sum = round2(terms.reduce((a, t) => a + t.amount, 0));
    if (cached != null && Math.abs(sum - cached) > 0.011) throw new Error('Summe weicht ab');
    return { terms, mismatch: false };
  } catch {
    return {
      terms: cached != null && cached !== 0 ? [{ amount: round2(cached), text: `=${cell.f}` }] : [],
      mismatch: true,
    };
  }
}

// ── Sheet analysis ──────────────────────────────────────────────────────────
const str = (c: XCell | undefined) => (typeof c?.v === 'string' ? c.v.trim() : c?.v != null ? String(c.v) : '');
const num = (c: XCell | undefined) => (typeof c?.v === 'number' ? c.v : null);

function analyzeYear(sheet: XSheet, year: number): ImportYear | null {
  const get = (col: number, row: number) => sheet.cells.get(cellRef(col, row));
  const warnings: string[] = [];
  // Header row: categories from column D up to the second TOTAL
  const columns: ImportColumn[] = [];
  let kind: CategoryKind = 'expense';
  let totals = 0;
  for (let col = 4; col <= sheet.maxCol; col++) {
    const h = str(get(col, 1));
    if (!h) continue;
    if (h.toUpperCase() === 'TOTAL') { totals++; if (totals === 2) break; kind = 'income'; continue; }
    columns.push({ header: h, kind, col });
  }
  if (totals < 2 || columns.length === 0) return null;
  // Month rows
  const monthRows = new Map<number, number>();
  for (let row = 2; row <= Math.min(sheet.maxRow, 60); row++) {
    const idx = MONTH_NAMES.indexOf(str(get(1, row)));
    if (idx >= 0 && !monthRows.has(idx + 1)) monthRows.set(idx + 1, row);
  }
  if (monthRows.size !== 12) warnings.push(`${monthRows.size} von 12 Monatszeilen gefunden`);
  // Budget row: "Pro Monat" in column B (row 2)
  let budgetRow = 0;
  for (let row = 1; row <= 4; row++) if (str(get(2, row)) === 'Pro Monat') { budgetRow = row; break; }
  const budget: Record<string, number> = {};
  if (budgetRow) for (const c of columns) { const v = num(get(c.col, budgetRow)); if (v) budget[c.header] = round2(v); }
  else warnings.push('Keine Budgetzeile «Pro Monat» gefunden');
  // Total row for verification
  let totalRow = 0;
  for (let row = 17; row <= Math.min(sheet.maxRow, 60); row++) if (str(get(1, row)) === 'Total') { totalRow = row; break; }
  const totalCol = (k: CategoryKind) => {
    let seen = 0;
    for (let col = 4; col <= sheet.maxCol; col++) {
      if (str(get(col, 1)).toUpperCase() === 'TOTAL') { seen++; if ((k === 'expense' && seen === 1) || (k === 'income' && seen === 2)) return col; }
    }
    return 0;
  };
  const cachedTotals = {
    expense: totalRow ? num(get(totalCol('expense'), totalRow)) : null,
    income: totalRow ? num(get(totalCol('income'), totalRow)) : null,
  };
  const cells: ImportCell[] = [];
  let bookingCount = 0;
  for (const c of columns) {
    for (const [month, row] of monthRows) {
      const cell = get(c.col, row);
      if (!cell) continue;
      const { terms, mismatch } = termsOf(cell);
      if (terms.length === 0) continue;
      if (mismatch) warnings.push(`${cellRef(c.col, row)} (${c.header}, ${MONTH_NAMES[month - 1]}): Formel nicht zerlegbar, als eine Buchung übernommen`);
      cells.push({ header: c.header, month, terms, cached: num(cell), formula: cell.f, mismatch });
      bookingCount += terms.length;
    }
  }
  return { year, columns, budget, cells, bookingCount, cachedTotals, warnings };
}

export function analyzeWorkbook(sheets: XSheet[]): Analysis {
  const years: ImportYear[] = [];
  const warnings: string[] = [];
  for (const sh of sheets) {
    if (!/^\d{4}$/.test(sh.name.trim())) continue;
    const y = analyzeYear(sh, Number(sh.name.trim()));
    if (y) years.push(y);
    else warnings.push(`Tab «${sh.name}»: Aufbau nicht erkannt (Kategorien / TOTAL-Spalten fehlen)`);
  }
  years.sort((a, b) => b.year - a.year);
  const headers: Analysis['headers'] = [];
  for (const y of years) for (const c of y.columns) {
    const h = headers.find(x => x.name === c.header && x.kind === c.kind);
    if (h) h.years.push(y.year); else headers.push({ name: c.header, kind: c.kind, years: [y.year] });
  }
  return { years, headers, warnings };
}

// ── Category mapping ────────────────────────────────────────────────────────
// Renamed columns over the years are mapped to the newest name: by explicit
// alias, or when the names share a "/"-separated part (Ferien → Ferien/Ausflüge/Familie).
const ALIASES: Record<string, string> = {
  wohnung: 'Haus',
  krankheit: 'Gesundheit',
};
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const parts = (s: string) => norm(s).split('/').map(p => p.trim()).filter(Boolean);

export type Mapping = Record<string, string>; // header → target category name

export function defaultMapping(headers: Analysis['headers']): Mapping {
  const map: Mapping = {};
  for (const h of headers) { // newest first: the first one with a shared part wins
    const alias = ALIASES[norm(h.name)];
    const aliasTarget = alias && headers.find(x => x.kind === h.kind && norm(x.name) === norm(alias));
    if (aliasTarget) { map[h.name] = aliasTarget.name; continue; }
    const mine = parts(h.name);
    const target = headers.find(x => x !== h && x.kind === h.kind && map[x.name] === x.name
      && parts(x.name).some(p => mine.includes(p)));
    map[h.name] = target ? target.name : h.name;
  }
  return map;
}

// ── Build data files ────────────────────────────────────────────────────────
export interface ImportResult {
  categories: Category[]; // complete list (existing + new)
  years: YearData[];
  newCategories: string[];
  bookings: number;
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kategorie';

export function buildImport(
  analysis: Analysis, mapping: Mapping, existing: Category[], selectedYears: number[],
): ImportResult {
  const categories = existing.map(c => ({ ...c }));
  const byName = new Map(categories.map(c => [norm(c.name), c]));
  const newCategories: string[] = [];
  const latest = analysis.years[0];
  const activeNames = new Set(latest ? latest.columns.map(c => mapping[c.header] ?? c.header) : []);
  const ensure = (name: string, kind: CategoryKind): Category => {
    const found = byName.get(norm(name));
    if (found) return found;
    let id = slug(name);
    while (categories.some(c => c.id === id)) id += '-2';
    const cat: Category = { id, name, kind, color: nextColor(categories.map(c => c.color)) };
    if (latest && !activeNames.has(name)) cat.archived = true;
    categories.push(cat);
    byName.set(norm(name), cat);
    newCategories.push(name);
    return cat;
  };
  // Create categories in the order of the newest year first, then older ones
  for (const h of analysis.headers) ensure(mapping[h.name] ?? h.name, h.kind);
  const years: YearData[] = [];
  let bookings = 0;
  for (const y of analysis.years) {
    if (!selectedYears.includes(y.year)) continue;
    const data: YearData = { year: y.year, budget: {}, bookings: [] };
    for (const c of y.columns) {
      const cat = ensure(mapping[c.header] ?? c.header, c.kind);
      const b = y.budget[c.header];
      if (b) data.budget[cat.id] = round2((data.budget[cat.id] ?? 0) + b);
    }
    for (const cell of y.cells) {
      const cat = ensure(mapping[cell.header] ?? cell.header, 'expense');
      cell.terms.forEach((t, i) => {
        const b: Booking = {
          id: `imp-${y.year}${pad(cell.month)}-${cat.id}-${i + 1}`,
          date: `${y.year}-${pad(cell.month)}-01`,
          categoryId: cat.id,
          amount: t.amount,
          text: t.text,
        };
        data.bookings.push(b);
      });
      bookings += cell.terms.length;
    }
    years.push(data);
  }
  return { categories, years, newCategories, bookings };
}
