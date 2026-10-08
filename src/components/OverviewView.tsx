import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { colorClasses } from '../colors';
import { categoriesForYear, fmtChf, yearStats } from '../budget';
import { BarSeries, LegendItem, MonthBar, MonthlyChart, Range, RangePicker, chartTheme, monthState, rangeMonths } from '../charts';
import { Signed, themeClasses } from '../ui';

export default function OverviewView({ onOpenYear }: { onOpenYear: (y: number) => void }) {
  const { isDark, categories, years } = useStore();
  const t = themeClasses(isDark);
  const now = new Date();
  const cy = now.getFullYear(), cm = now.getMonth() + 1;
  const [range, setRange] = useState<Range>('12');
  const [from, setFrom] = useState(`${cy - 1}-01`);
  const [span, setSpan] = useState<5 | 10 | 0>(5);

  const yearList = useMemo(() => Object.values(years).filter(y => y.bookings.length > 0).sort((a, b) => a.year - b.year), [years]);
  const stats = useMemo(() => Object.fromEntries(yearList.map(y => [y.year, yearStats(y, categories)])), [yearList, categories]);
  const axisFmt = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);

  // ── Monthly chart ──
  const months = rangeMonths(range, cy, cm, from);
  const expenseCats = categories.filter(c => c.kind === 'expense');
  const series: BarSeries[] = expenseCats.map(c => ({
    id: c.id, name: c.name, color: c.color,
    values: months.map(({ y, m }) => stats[y]?.cats[c.id]?.months[m - 1] ?? 0),
  })).filter(s => s.values.some(v => v !== 0));
  const bars: MonthBar[] = months.map(ym => {
    const s = stats[ym.y];
    return {
      ym, state: monthState(ym, cy, cm),
      actual: s?.expense.months[ym.m - 1] ?? 0,
      target: s?.income.months[ym.m - 1] ?? 0,
      budget: s?.expense.budgetMonth ?? 0,
    };
  });

  // ── Category × year table ──
  const tableYears = span ? yearList.slice(-span) : yearList;
  const catRows = (kind: 'expense' | 'income') => {
    const ids = new Set<string>();
    for (const y of tableYears) for (const c of categoriesForYear(categories, y, kind)) ids.add(c.id);
    return categories.filter(c => c.kind === kind && ids.has(c.id));
  };

  const num = (v: number) => Math.round(v) === 0 ? <span className={t.faint}>–</span> : fmtChf(v);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h2 className={t.title}>Übersicht</h2>
        <div className="ml-auto"><RangePicker range={range} setRange={setRange} from={from} setFrom={setFrom} cy={cy} isDark={isDark} /></div>
      </div>

      {yearList.length === 0 ? (
        <p className={`text-xs ${t.muted}`}>Noch keine Buchungen vorhanden.</p>
      ) : (
        <>
          <div className={`rounded-xl border p-4 mb-8 ${t.border}`}>
            <div className={`flex items-center gap-4 text-[11px] mb-3 flex-wrap ${t.muted}`}>
              <span className="font-semibold">Ausgaben pro Monat nach Kategorie</span>
              <LegendItem kind="line" color={isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)'} label="Einnahmen" />
              <LegendItem kind="dash" color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)'} label="Budget Ausgaben" />
            </div>
            <MonthlyChart months={bars} series={series} theme={chartTheme(isDark)} fmt={v => `CHF ${fmtChf(v)}`} axisFmt={axisFmt}
              targetLabel="Einnahmen" budgetLabel="Budget" />
            <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] ${t.muted}`}>
              {series.map(s => <LegendItem key={s.id} kind="box" color={colorClasses(s.color).swatch} label={s.name} />)}
            </div>
          </div>

          <div className={`${t.section} mb-2`}>Jahre</div>
          <table className="text-xs mb-8 min-w-[560px]">
            <thead>
              <tr className={`text-[10px] uppercase tracking-wider ${t.muted}`}>
                <th className="text-left font-normal py-1.5 px-2">Jahr</th>
                <th className="text-right font-normal px-3">Ausgaben</th>
                <th className="text-right font-normal px-3">Einnahmen</th>
                <th className="text-right font-normal px-3">Überschuss</th>
                <th className={`text-right font-normal px-3 border-l ${t.border}`}>Ø Ausgaben / Mt</th>
                <th className="text-right font-normal px-3">Ø Einnahmen / Mt</th>
                <th className="text-right font-normal px-3">Budget Ausgaben</th>
              </tr>
            </thead>
            <tbody>
              {[...yearList].reverse().map(y => {
                const s = stats[y.year];
                return (
                  <tr key={y.year} onClick={() => onOpenYear(y.year)} className={`border-t ${t.border} ${t.rowHover} cursor-pointer ${y.year === cy ? 'font-semibold' : ''}`}>
                    <td className="px-2 py-1.5">{y.year}{s.bookedMonths < 12 && s.bookedMonths > 0 ? <span className={`ml-1 font-normal ${t.muted}`}>({s.bookedMonths} Mt)</span> : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtChf(s.expense.total)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtChf(s.income.total)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums"><Signed value={s.surplusTotal} fmt={fmtChf} isDark={isDark} /></td>
                    <td className={`px-3 py-1.5 text-right tabular-nums border-l ${t.border}`}>{num(s.expense.avg)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(s.income.avg)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${t.muted}`}>{num(s.expense.budgetYear)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center gap-3 mb-2">
            <div className={t.section}>Kategorien pro Jahr</div>
            <div className={`${t.segBox} ml-auto`}>
              {([5, 10, 0] as const).map(n => (
                <button key={n} className={t.seg(span === n)} onClick={() => setSpan(n)}>{n === 0 ? 'Alle' : `${n} Jahre`}</button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs min-w-max">
              <thead>
                <tr className={`text-[10px] uppercase tracking-wider ${t.muted}`}>
                  <th className={`sticky left-0 text-left font-normal py-1.5 px-2 ${t.surface}`}>Kategorie</th>
                  {tableYears.map(y => <th key={y.year} className="text-right font-normal px-3">{y.year}</th>)}
                  <th className={`text-right font-normal px-3 border-l ${t.border}`}>Ø / Jahr</th>
                </tr>
              </thead>
              <tbody>
                {(['expense', 'income'] as const).map(kind => (
                  <React.Fragment key={kind}>
                    <tr><td colSpan={tableYears.length + 2} className={`pt-3 pb-1 px-2 ${t.section}`}>{kind === 'expense' ? 'Ausgaben' : 'Einnahmen'}</td></tr>
                    {catRows(kind).map(c => {
                      const vals = tableYears.map(y => stats[y.year]?.cats[c.id]?.total ?? 0);
                      const full = tableYears.filter(y => stats[y.year].bookedMonths === 12);
                      const avg = full.length ? full.reduce((a, y) => a + (stats[y.year]?.cats[c.id]?.total ?? 0), 0) / full.length : 0;
                      return (
                        <tr key={c.id} className={`border-t ${t.border} ${t.rowHover}`}>
                          <td className={`sticky left-0 px-2 py-1 whitespace-nowrap ${t.surface}`}>
                            <span className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorClasses(c.color).dot}`} />
                              <span className={c.archived ? t.muted : ''}>{c.name}</span>
                            </span>
                          </td>
                          {vals.map((v, i) => (
                            <td key={i} onClick={() => onOpenYear(tableYears[i].year)} className="px-3 py-1 text-right tabular-nums cursor-pointer">{num(v)}</td>
                          ))}
                          <td className={`px-3 py-1 text-right tabular-nums border-l ${t.border} ${t.muted}`}>{num(avg)}</td>
                        </tr>
                      );
                    })}
                    <tr className={`border-t ${t.border} font-semibold`}>
                      <td className={`sticky left-0 px-2 py-1 ${t.surface}`}>Total {kind === 'expense' ? 'Ausgaben' : 'Einnahmen'}</td>
                      {tableYears.map(y => <td key={y.year} className="px-3 py-1 text-right tabular-nums">{fmtChf(stats[y.year][kind].total)}</td>)}
                      <td className={`px-3 py-1 text-right tabular-nums border-l ${t.border}`}>
                        {(() => { const full = tableYears.filter(y => stats[y.year].bookedMonths === 12); return full.length ? fmtChf(full.reduce((a, y) => a + stats[y.year][kind].total, 0) / full.length) : '–'; })()}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
                <tr className={`border-t ${t.border} font-semibold`}>
                  <td className={`sticky left-0 px-2 py-1 ${t.surface}`}>Überschuss</td>
                  {tableYears.map(y => <td key={y.year} className="px-3 py-1 text-right tabular-nums"><Signed value={stats[y.year].surplusTotal} fmt={fmtChf} isDark={isDark} /></td>)}
                  <td className={`border-l ${t.border}`} />
                </tr>
              </tbody>
            </table>
          </div>
          <p className={`text-[11px] mt-3 ${t.muted}`}>Ø / Jahr berücksichtigt nur vollständig gebuchte Jahre.</p>
        </>
      )}
    </div>
  );
}
