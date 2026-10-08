import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { colorClasses } from '../colors';
import { fmtChf, fmtPct, yearStats } from '../budget';
import { LegendItem, chartTheme } from '../charts';
import { AreaChart, ColumnChart, Donut } from '../analysisCharts';
import { themeClasses } from '../ui';

export default function AnalysisView() {
  const { isDark, categories, years } = useStore();
  const t = themeClasses(isDark);
  const theme = chartTheme(isDark);
  const cy = new Date().getFullYear();
  const yearList = useMemo(() => Object.values(years).filter(y => y.bookings.length > 0).sort((a, b) => a.year - b.year), [years]);
  const stats = useMemo(() => yearList.map(y => yearStats(y, categories)), [yearList, categories]);
  const labels = stats.map(s => String(s.year));
  const [donutYear, setDonutYear] = useState(() => (yearList.some(y => y.year === cy) ? cy : yearList[yearList.length - 1]?.year ?? cy));
  const expenseCats = categories.filter(c => c.kind === 'expense');
  const [catId, setCatId] = useState(expenseCats[0]?.id ?? '');
  const axisFmt = (v: number) => Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));
  const chf = (v: number) => `CHF ${fmtChf(v)}`;
  const incomeColor = isDark ? '#34d399' : '#059669';
  const expenseColor = isDark ? '#60a5fa' : '#2563eb';
  const inkLine = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)';
  const curIdx = labels.indexOf(String(cy));

  if (yearList.length === 0) return <div className="p-6"><p className={`text-xs ${t.muted}`}>Noch keine Buchungen vorhanden.</p></div>;

  // Booked months only (`booked`), so the running year is comparable
  const income = stats.map(s => s.income.booked);
  const expense = stats.map(s => s.expense.booked);
  const surplus = stats.map(s => s.surplusBooked);
  const rate = stats.map(s => s.income.booked ? s.surplusBooked / s.income.booked * 100 : 0);
  const avgRate = rate.length ? rate.reduce((a, b) => a + b, 0) / rate.length : 0;
  const cumulative: number[] = [];
  surplus.reduce((acc, v, i) => { cumulative[i] = acc + v; return acc + v; }, 0);

  const donutStats = stats.find(s => s.year === donutYear);
  const slices = expenseCats.map(c => ({ id: c.id, label: c.name, color: colorClasses(c.color).swatch, value: donutStats?.cats[c.id]?.booked ?? 0 }));

  const cat = categories.find(c => c.id === catId);
  const catValues = stats.map(s => s.cats[catId]?.booked ?? 0);
  const catBudget = stats.map(s => s.cats[catId]?.budgetYear || null);
  const catAvg = catValues.length ? catValues.reduce((a, b) => a + b, 0) / catValues.length : 0;

  const card = `rounded-xl border p-4 ${t.border}`;
  const head = (title: string, extra?: React.ReactNode) => (
    <div className={`flex items-center gap-4 text-[11px] mb-3 flex-wrap ${t.muted}`}><span className="font-semibold">{title}</span>{extra}</div>
  );
  const sel = `${t.input} py-1`;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className={`${t.title} mb-5`}>Analyse</h2>
      <p className={`text-[11px] mb-5 ${t.muted}`}>Alle Auswertungen berücksichtigen nur die verbuchten Monate (laufendes Jahr: {stats[curIdx]?.bookedMonths ?? 0} Monate).</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${card} lg:col-span-2`}>
          {head('Einnahmen, Ausgaben und Überschuss pro Jahr',
            <><LegendItem kind="box" color={incomeColor} label="Einnahmen" /><LegendItem kind="box" color={expenseColor} label="Ausgaben" /><LegendItem kind="line" color={inkLine} label="Überschuss" /></>)}
          <ColumnChart labels={labels} theme={theme} fmt={chf} axisFmt={axisFmt} highlight={curIdx}
            series={[{ name: 'Einnahmen', color: incomeColor, values: income }, { name: 'Ausgaben', color: expenseColor, values: expense }]}
            lines={[{ name: 'Überschuss', color: inkLine, values: surplus }]} />
        </div>

        <div className={card}>
          {head('Sparquote (Überschuss in % der Einnahmen)', <LegendItem kind="dash" color={theme.axisText} label={`Ø ${fmtPct(avgRate)}`} />)}
          <ColumnChart labels={labels} theme={theme} fmt={v => fmtPct(v)} axisFmt={v => `${Math.round(v)}%`} height={200} highlight={curIdx}
            series={[{ name: 'Sparquote', color: isDark ? '#a78bfa' : '#7c3aed', values: rate }]}
            lines={[{ name: 'Durchschnitt', color: theme.axisText, values: labels.map(() => avgRate), dashed: true }]} />
        </div>

        <div className={card}>
          {head('Kumulierter Überschuss seit ' + labels[0])}
          <AreaChart labels={labels} values={cumulative} color={isDark ? '#34d399' : '#059669'} theme={theme} fmt={chf} axisFmt={axisFmt} height={200} />
        </div>

        <div className={card}>
          {head('Ausgaben nach Kategorie',
            <select value={donutYear} onChange={e => setDonutYear(Number(e.target.value))} className={`${sel} ml-auto`}>
              {[...yearList].reverse().map(y => <option key={y.year} value={y.year}>{y.year}</option>)}
            </select>)}
          <Donut slices={slices} theme={theme} fmt={fmtChf} />
        </div>

        <div className={card}>
          {head('Kategorie im Zeitverlauf',
            <select value={catId} onChange={e => setCatId(e.target.value)} className={`${sel} ml-auto max-w-[240px]`}>
              <optgroup label="Ausgaben">{expenseCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              <optgroup label="Einnahmen">{categories.filter(c => c.kind === 'income').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            </select>)}
          <div className={`flex gap-4 text-[11px] mb-2 ${t.muted}`}>
            <LegendItem kind="box" color={colorClasses(cat?.color ?? 'blue').swatch} label={cat?.name ?? ''} />
            <LegendItem kind="dash" color={theme.axisText} label="Budget" />
            <LegendItem kind="line" color={inkLine} label={`Ø ${fmtChf(catAvg)}`} />
          </div>
          <ColumnChart labels={labels} theme={theme} fmt={chf} axisFmt={axisFmt} height={200} highlight={curIdx}
            series={[{ name: cat?.name ?? '', color: colorClasses(cat?.color ?? 'blue').swatch, values: catValues }]}
            lines={[{ name: 'Budget', color: theme.axisText, values: catBudget, dashed: true }, { name: 'Durchschnitt', color: inkLine, values: labels.map(() => catAvg), dashed: true }]} />
        </div>
      </div>
    </div>
  );
}
