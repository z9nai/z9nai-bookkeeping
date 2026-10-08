import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, Copy } from 'lucide-react';
import { useStore } from '../store';
import { Category, CategoryKind, EMPTY_YEAR } from '../types';
import { colorClasses } from '../colors';
import { LineStats, MONTH_SHORT, categoriesForYear, fmtChf, fmtPct, parseAmount, yearStats } from '../budget';
import { themeClasses, Signed } from '../ui';
import { exportYearXlsx } from '../yearExport';

interface Props {
  year: number;
  setYear: (y: number) => void;
  onOpenBookings: (year: number, month: number, categoryId: string) => void;
}

function BudgetInput({ value, onCommit, isDark }: { value: number; onCommit: (v: number) => void; isDark: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value ? String(value) : '');
  const commit = () => {
    if (text == null) return;
    const n = parseAmount(text);
    onCommit(isNaN(n) ? 0 : n);
    setText(null);
  };
  return (
    <input value={shown} onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setText(null); }}
      placeholder="–" inputMode="decimal"
      className={`w-[70px] text-right text-xs px-1.5 py-0.5 rounded border outline-none tabular-nums transition-colors ${
        isDark ? 'bg-transparent border-transparent hover:border-white/15 focus:border-white/30 focus:bg-white/5 text-white placeholder-white/25'
               : 'bg-transparent border-transparent hover:border-black/15 focus:border-black/30 focus:bg-black/5 text-black placeholder-black/25'}`} />
  );
}

export default function YearView({ year, setYear, onOpenBookings }: Props) {
  const { isDark, categories, years, setBudget, copyBudget, setMonths } = useStore();
  const t = themeClasses(isDark);
  const now = new Date();
  const cy = now.getFullYear(), cm = now.getMonth() + 1;
  const data = years[year] ?? EMPTY_YEAR(year);
  const st = useMemo(() => yearStats(data, categories), [data, categories]);
  const expense = categoriesForYear(categories, years[year], 'expense');
  const income = categoriesForYear(categories, years[year], 'income');
  const hasBudget = Object.values(data.budget).some(v => v);
  const prevHasBudget = Object.values(years[year - 1]?.budget ?? {}).some(v => v);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const monthCls = (m: number) => {
    const future = year > cy || (year === cy && m > cm);
    return `${future ? t.faint : ''} ${year === cy && m === cm ? 'font-semibold' : ''}`;
  };
  const cell = (v: number, extra = '') => (
    <td className={`text-right px-2 py-1 tabular-nums ${extra} ${Math.round(v) === 0 ? t.faint : ''}`}>{Math.round(v) === 0 ? '–' : fmtChf(v)}</td>
  );
  const pct = (ls: LineStats, kind: CategoryKind) => {
    if (ls.deviationPct == null || st.bookedMonths === 0) return <td className={`text-right px-2 py-1 ${t.faint}`}>–</td>;
    const good = kind === 'expense' ? ls.deviation >= 0 : ls.deviation <= 0;
    return <td className={`text-right px-2 py-1 tabular-nums ${good ? t.pos : t.neg}`}>{fmtPct(ls.deviationPct)}</td>;
  };

  const Line = ({ cat, label, ls, kind, bold }: { cat?: Category; label: string; ls: LineStats; kind: CategoryKind; bold?: boolean }) => (
    <tr className={`border-t ${t.border} ${t.rowHover} ${bold ? 'font-semibold' : ''}`}>
      <td className={`sticky left-0 z-10 px-3 py-1 whitespace-nowrap ${t.surface}`}>
        <span className="flex items-center gap-2">
          {cat && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorClasses(cat.color).dot}`} />}
          <span className={cat?.archived ? t.muted : ''}>{label}</span>
        </span>
      </td>
      {ls.months.map((v, i) => (
        <td key={i} onClick={() => onOpenBookings(year, i + 1, cat?.id ?? '')}
          onMouseEnter={() => setHoverCol(i)}
          className={`text-right px-2 py-1 tabular-nums cursor-pointer ${monthCls(i + 1)} ${hoverCol === i ? (isDark ? 'bg-white/[0.03]' : 'bg-black/[0.03]') : ''} ${Math.round(v) === 0 ? t.faint : ''}`}
          title={`${label} · ${MONTH_SHORT[i]} ${year}: Buchungen anzeigen`}>
          {Math.round(v) === 0 ? '–' : fmtChf(v)}
        </td>
      ))}
      {cell(ls.total, `border-l ${t.border} font-semibold`)}
      {cell(ls.avg)}
      <td className={`text-right px-1 py-0.5 border-l ${t.border}`}>
        {cat ? <BudgetInput value={data.budget[cat.id] ?? 0} onCommit={v => setBudget(year, cat.id, v)} isDark={isDark} />
             : <span className="px-1.5 tabular-nums">{Math.round(ls.budgetMonth) === 0 ? <span className={t.faint}>–</span> : fmtChf(ls.budgetMonth)}</span>}
      </td>
      {cell(ls.budgetYear)}
      <td className="text-right px-2 py-1 tabular-nums"><Signed value={kind === 'expense' ? ls.remaining : -ls.remaining} fmt={fmtChf} isDark={isDark} /></td>
      {cell(st.bookedMonths ? ls.forecast : 0, `border-l ${t.border}`)}
      {pct(ls, kind)}
    </tr>
  );

  const surplusLine = (label: string, months: number[], total: number, extra: (number | null)[], bold = true) => (
    <tr className={`border-t ${t.border} ${bold ? 'font-semibold' : ''}`}>
      <td className={`sticky left-0 z-10 px-3 py-1 whitespace-nowrap ${t.surface}`}>{label}</td>
      {months.map((v, i) => (
        <td key={i} className={`text-right px-2 py-1 tabular-nums ${monthCls(i + 1)}`}><Signed value={v} fmt={fmtChf} isDark={isDark} /></td>
      ))}
      <td className={`text-right px-2 py-1 tabular-nums border-l ${t.border}`}><Signed value={total} fmt={fmtChf} isDark={isDark} /></td>
      {extra.map((v, i) => (
        <td key={i} className={`text-right px-2 py-1 tabular-nums ${i === 1 || i === 4 ? `border-l ${t.border}` : ''}`}>
          {v == null ? '' : <Signed value={v} fmt={fmtChf} isDark={isDark} />}
        </td>
      ))}
    </tr>
  );

  const th = (label: string, cls = '') => <th className={`text-right font-normal px-2 py-1.5 whitespace-nowrap ${cls}`}>{label}</th>;
  const section = (label: string) => (
    <tr><td colSpan={21} className={`pt-4 pb-1 px-3 sticky left-0 ${t.section}`}>{label}</td></tr>
  );

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className={t.title}>Jahr</h2>
        <div className="flex items-center gap-1 ml-2">
          <button className={t.iconBtn} onClick={() => setYear(year - 1)}><ChevronLeft size={14} /></button>
          <span className="text-xs font-semibold w-10 text-center">{year}</span>
          <button className={t.iconBtn} onClick={() => setYear(year + 1)}><ChevronRight size={14} /></button>
        </div>
        <label className={`flex items-center gap-1.5 text-[11px] ml-3 ${t.muted}`} title="Anzahl Monate, durch die für Ø / Mt und Hochrechnung geteilt wird (leer = automatisch: vergangene Jahre 12, laufendes Jahr die abgeschlossenen Monate)">
          Ø über
          <input type="number" min={0} max={12} value={data.months ?? ''} placeholder={String(st.bookedMonths)}
            onChange={e => setMonths(year, e.target.value === '' ? null : Math.max(0, Math.min(12, Number(e.target.value))))}
            className={`${t.input} w-14 text-right py-0.5`} />
          Monate{data.months == null ? ' (automatisch)' : ''}
        </label>
        <div className="ml-auto flex items-center gap-2">
          {!hasBudget && prevHasBudget && (
            <button className={t.btn} onClick={() => copyBudget(year - 1, year)} title={`Budget pro Monat von ${year - 1} übernehmen`}>
              <Copy size={12} /> Budget {year - 1} übernehmen
            </button>
          )}
          <button className={t.btn} onClick={() => exportYearXlsx(data, categories)} disabled={data.bookings.length === 0}>
            <FileSpreadsheet size={12} /> Excel {year}
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <p className={`text-xs ${t.muted}`}>Noch keine Kategorien. Lege sie unter «Kategorien» an oder importiere das bestehende Budget-Sheet mit <code>npm run import-xlsx</code>.</p>
      ) : (
        <div className="overflow-x-auto" onMouseLeave={() => setHoverCol(null)}>
          <table className="text-xs min-w-max border-collapse">
            <thead>
              <tr className={`text-[10px] uppercase tracking-wider ${t.muted}`}>
                <th className={`sticky left-0 z-10 text-left font-normal px-3 py-1.5 ${t.surface}`}>Kategorie</th>
                {MONTH_SHORT.map((m, i) => <th key={m} className={`text-right font-normal px-2 py-1.5 ${monthCls(i + 1)}`}>{m}</th>)}
                {th('Total', `border-l ${t.border}`)}
                {th('Ø / Mt')}
                {th('Budget / Mt', `border-l ${t.border}`)}
                {th('Budget / Jahr')}
                {th('Rest')}
                {th('Hochrechnung', `border-l ${t.border}`)}
                {th('Abw.')}
              </tr>
            </thead>
            <tbody>
              {section('Ausgaben')}
              {expense.map(c => <Line key={c.id} cat={c} label={c.name} ls={st.cats[c.id]} kind="expense" />)}
              <Line label="Total Ausgaben" ls={st.expense} kind="expense" bold />
              {section('Einnahmen')}
              {income.map(c => <Line key={c.id} cat={c} label={c.name} ls={st.cats[c.id]} kind="income" />)}
              <Line label="Total Einnahmen" ls={st.income} kind="income" bold />
              {section('Überschuss')}
              {surplusLine('Überschuss', st.surplus, st.surplusTotal,
                [st.bookedMonths ? st.surplusTotal / st.bookedMonths : 0, st.surplusBudgetMonth, st.surplusBudgetYear, st.surplusBudgetYear - st.surplusTotal, st.bookedMonths ? st.surplusForecast : 0, null])}
              {surplusLine('Kumuliert', st.cumulative, st.surplusTotal, [null, null, null, null, null, null], false)}
            </tbody>
          </table>
          <p className={`text-[11px] mt-4 ${t.muted}`}>
            Klick auf eine Monatszelle zeigt die Buchungen. Budget / Mt ist direkt editierbar.
            Rest = Jahresbudget − Ist; Hochrechnung = Ø pro gebuchtem Monat × 12; Abw. = Abweichung der Hochrechnung vom Jahresbudget in %.
          </p>
        </div>
      )}
    </div>
  );
}
