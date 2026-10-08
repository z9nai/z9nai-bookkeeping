// Excel export of one year in the layout of the original Google Sheet
// (months as rows, categories as columns) plus a sheet with all bookings.
import { Cell, Sheet, buildXlsx } from './xlsx';
import { Category, YearData } from './types';
import { MONTH_NAMES, categoriesForYear, fmtDate, yearStats } from './budget';
import { download } from './ui';

export function exportYearXlsx(year: YearData, categories: Category[]) {
  const st = yearStats(year, categories);
  const exp = categoriesForYear(categories, year, 'expense');
  const inc = categoriesForYear(categories, year, 'income');
  const money = (v: number, bold = false): Cell => ({ v: Math.round(v * 100) / 100, s: bold ? 'moneyBold' : 'money' });
  const header: Cell[] = [{ v: year.year, s: 'title' }, null, null,
    ...exp.map(c => ({ v: c.name, s: 'bold' as const })), { v: 'TOTAL', s: 'bold' },
    ...inc.map(c => ({ v: c.name, s: 'bold' as const })), { v: 'TOTAL', s: 'bold' }, { v: 'Überschuss', s: 'bold' }];
  const line = (label: string, sub: string | null, f: (id: string | null, kind: 'expense' | 'income') => number, surplus: number, bold = false): Cell[] => [
    label ? { v: label, s: bold ? 'bold' : 'text' } : null, sub,  null,
    ...exp.map(c => money(f(c.id, 'expense'), bold)), money(f(null, 'expense'), true),
    ...inc.map(c => money(f(c.id, 'income'), bold)), money(f(null, 'income'), true), money(surplus, true),
  ];
  const agg = (id: string | null, kind: 'expense' | 'income') => id ? st.cats[id] : st[kind];
  const rows: Cell[][] = [
    header,
    line('', 'Pro Monat', (id, k) => agg(id, k)?.budgetMonth ?? 0, st.surplusBudgetMonth),
    line('', 'Pro Jahr', (id, k) => agg(id, k)?.budgetYear ?? 0, st.surplusBudgetYear),
    [],
    ...MONTH_NAMES.map((m, i) => line(m, null, (id, k) => agg(id, k)?.months[i] ?? 0, st.surplus[i])),
    [],
    line('Total', null, (id, k) => agg(id, k)?.total ?? 0, st.surplusTotal, true),
    line('Pro Monat', String(st.bookedMonths), (id, k) => agg(id, k)?.avg ?? 0, st.bookedMonths ? st.surplusTotal / st.bookedMonths : 0),
    line('Überschuss (Budget − Ist)', null, (id, k) => agg(id, k)?.remaining ?? 0, st.surplusBudgetYear - st.surplusTotal),
    line('Hochrechnung bis Ende Jahr', null, (id, k) => agg(id, k)?.forecast ?? 0, st.surplusForecast),
    line('Abweichung vom Budget', null, (id, k) => agg(id, k)?.deviation ?? 0, st.surplusBudgetYear - st.surplusForecast),
    line('', 'in %', (id, k) => agg(id, k)?.deviationPct ?? 0, 0),
  ];
  const byId = new Map(categories.map(c => [c.id, c]));
  const bookings: Cell[][] = [
    [{ v: 'Datum', s: 'bold' }, { v: 'Kategorie', s: 'bold' }, { v: 'Art', s: 'bold' }, { v: 'Text', s: 'bold' }, { v: 'Betrag', s: 'bold' }],
    ...year.bookings.map(b => {
      const c = byId.get(b.categoryId);
      return [fmtDate(b.date), c?.name ?? b.categoryId, c?.kind === 'income' ? 'Einnahme' : 'Ausgabe', b.text, money(b.amount)] as Cell[];
    }),
  ];
  const sheets: Sheet[] = [
    { name: String(year.year), rows, widths: [26, 10, 2, ...Array(exp.length + inc.length + 3).fill(12)] },
    { name: 'Buchungen', rows: bookings, widths: [12, 36, 10, 40, 12] },
  ];
  download(buildXlsx(sheets), `Budget-${year.year}.xlsx`);
}
