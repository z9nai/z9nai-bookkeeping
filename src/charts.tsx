import React, { useLayoutEffect, useRef, useState } from 'react';
import { colorClasses } from './colors';
import { MONTH_NAMES, MONTH_SHORT } from './budget';

export type YM = { y: number; m: number };
export type MonthState = 'past' | 'current' | 'future';

export function fmtYm({ y, m }: YM): string {
  return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
}

// ── Range selection ─────────────────────────────────────────────────────────
export type Range = '6' | '12' | '24' | 'year' | 'from';
const RANGES: { key: Range; label: string }[] = [
  { key: '6', label: '6 Monate' },
  { key: '12', label: '12 Monate' },
  { key: '24', label: '24 Monate' },
  { key: 'year', label: 'Jahr' },
  { key: 'from', label: 'Ab' },
];
const MAX_MONTHS = 60;

export function rangeMonths(range: Range, cy: number, cm: number, from: string): YM[] {
  if (range === 'year') return Array.from({ length: 12 }, (_, i) => ({ y: cy, m: i + 1 }));
  let n: number;
  if (range === 'from') {
    const [fy, fm] = from.split('-').map(Number);
    n = fy && fm ? (cy - fy) * 12 + (cm - fm) + 1 : 1;
    n = Math.max(1, Math.min(MAX_MONTHS, n));
  } else {
    n = Number(range);
  }
  const out: YM[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(cy, cm - 1 - i, 1);
    out.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }
  return out;
}

export function monthState({ y, m }: YM, cy: number, cm: number): MonthState {
  return y < cy || (y === cy && m < cm) ? 'past' : y === cy && m === cm ? 'current' : 'future';
}

export function RangePicker({ range, setRange, from, setFrom, cy, isDark }: {
  range: Range; setRange: (r: Range) => void;
  from: string; setFrom: (v: string) => void;
  cy: number; isDark: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex rounded border overflow-hidden ${isDark ? 'border-white/10' : 'border-black/10'}`}>
        {RANGES.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`text-xs px-2.5 py-1.5 transition-colors ${
              range === r.key
                ? isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-black'
                : isDark ? 'text-white/40 hover:text-white/70' : 'text-black/40 hover:text-black/70'
            }`}>
            {r.key === 'year' ? `Jahr ${cy}` : r.label}
          </button>
        ))}
      </div>
      {range === 'from' && (
        <input type="month" value={from} onChange={e => e.target.value && setFrom(e.target.value)}
          title={`Startmonat (max. ${MAX_MONTHS} Monate)`}
          className={`text-xs px-2 py-1 rounded border outline-none transition-colors ${
            isDark ? 'bg-white/5 border-white/10 text-white focus:border-white/30 [color-scheme:dark]'
                   : 'bg-black/5 border-black/10 text-black focus:border-black/30'
          }`} />
      )}
    </div>
  );
}

// ── Chart primitives ────────────────────────────────────────────────────────
export function niceTicks(max: number): number[] {
  if (!(max > 0) || !isFinite(max)) return [0, 1];
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * pow).find(s => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(v);
  return ticks;
}

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function columnPath(x: number, y: number, w: number, h: number, round: boolean): string {
  if (h <= 0) return '';
  const r = round ? Math.min(4, h, w / 2) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export interface Theme {
  isDark: boolean;
  grid: string;
  axisText: string;
  ink: string;
  surface: string;
  ghost: string;
}

export function chartTheme(isDark: boolean): Theme {
  return {
    isDark,
    grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    axisText: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)',
    ink: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)',
    surface: isDark ? '#0e0f11' : '#f5f4f0',
    ghost: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
  };
}

export function Tooltip({ x, width, children, isDark }: { x: number; width: number; children: React.ReactNode; isDark: boolean }) {
  const half = 115;
  const left = Math.max(half, Math.min(width - half, x));
  return (
    <div
      className={`absolute top-0 pointer-events-none z-10 w-[230px] rounded-lg border shadow-lg px-3 py-2 text-[11px] ${
        isDark ? 'bg-[#1a1b20] border-white/10 text-white/80' : 'bg-white border-black/10 text-black/80'
      }`}
      style={{ left, transform: 'translateX(-50%)' }}
    >
      {children}
    </div>
  );
}

export function TipRow({ label, value, dot, strong, muted }: { label: string; value: string; dot?: string; strong?: boolean; muted?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
      <span className={`flex items-center gap-1.5 truncate ${muted ?? ''}`}>
        {dot && <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />}
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function LegendItem({ kind, color, label, className }: {
  kind: 'dot' | 'line' | 'dash' | 'box'; color: string; label: string; className?: string;
}) {
  return (
    <span className="flex items-center gap-1">
      {kind === 'dot' && <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />}
      {kind === 'line' && <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: color }} />}
      {kind === 'dash' && (
        <svg width={12} height={2} className="inline-block"><line x1={0} x2={12} y1={1} y2={1} stroke={color} strokeWidth={2} strokeDasharray="3 2" /></svg>
      )}
      {kind === 'box' && <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />}
      <span className={className}>{label}</span>
    </span>
  );
}

// ── Monthly columns: expenses stacked per category, income as a tick ────────
export interface MonthBar {
  ym: YM;
  state: MonthState;
  actual: number;   // total expenses
  target: number;   // income (shown as a tick) — 0 = none
  budget?: number;  // expense budget (dashed step line)
}
export interface BarSeries { id: string; name: string; color: string; values: number[] }

export function MonthlyChart({ months, series, theme, fmt, axisFmt, targetLabel, budgetLabel }: {
  months: MonthBar[];
  series: BarSeries[];
  theme: Theme;
  fmt: (v: number) => string;
  axisFmt: (v: number) => string;
  targetLabel: string;
  budgetLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 240, mt = 12, mb = 24, ml = 48, mr = 8;
  const plotW = Math.max(0, width - ml - mr), plotH = H - mt - mb;
  const n = months.length;
  const band = n > 0 ? plotW / n : 0;
  const barW = Math.min(28, band * 0.55);
  const max = Math.max(1, ...months.map(m => Math.max(m.actual, m.target, m.budget ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const yOf = (v: number) => mt + plotH - (Math.max(0, v) / top) * plotH;
  const muted = theme.isDark ? 'text-white/40' : 'text-black/40';

  let budgetPath = '';
  months.forEach((mi, i) => {
    const v = mi.budget ?? 0;
    if (v <= 0) return;
    const x0 = ml + band * i + 3, x1 = ml + band * (i + 1) - 3, y = yOf(v);
    const prev = i > 0 ? months[i - 1].budget ?? 0 : 0;
    budgetPath += prev > 0 ? ` L${x0 - 6},${y} H${x1}` : ` M${x0},${y} H${x1}`;
  });

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} className="block">
          {ticks.map(t => (
            <g key={t}>
              <line x1={ml} x2={width - mr} y1={yOf(t)} y2={yOf(t)} stroke={theme.grid} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={ml - 8} y={yOf(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={theme.axisText} className="tabular-nums">{axisFmt(t)}</text>
            </g>
          ))}
          {months.map((mi, i) => {
            const cx = ml + band * i + band / 2;
            const x = cx - barW / 2;
            const segs: { y: number; h: number; color: string }[] = [];
            let acc = 0;
            series.forEach(s => {
              const v = s.values[i] ?? 0;
              if (v <= 0) return;
              const y0 = yOf(acc), y1 = yOf(acc + v);
              segs.push({ y: y1, h: y0 - y1, color: colorClasses(s.color).swatch });
              acc += v;
            });
            const dim = hover != null && hover !== i;
            return (
              <g key={`${mi.ym.y}-${mi.ym.m}`} opacity={dim ? 0.45 : 1}>
                {hover === i && <rect x={ml + band * i} y={mt} width={band} height={plotH} fill={theme.ghost} />}
                {segs.map((sg, j) => {
                  const h = j > 0 ? sg.h - 1.5 : sg.h;
                  return <path key={j} d={columnPath(x, sg.y, barW, Math.max(0, h), j === segs.length - 1)} fill={sg.color} />;
                })}
                {mi.target > 0 && (
                  <line x1={cx - barW / 2 - 6} x2={cx + barW / 2 + 6} y1={yOf(mi.target)} y2={yOf(mi.target)}
                    stroke={theme.ink} strokeWidth={2} strokeLinecap="round" />
                )}
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={10}
                  fill={mi.state === 'current' ? theme.ink : theme.axisText}
                  fontWeight={mi.state === 'current' ? 600 : 400}>
                  {MONTH_SHORT[mi.ym.m - 1]}{(i === 0 || mi.ym.m === 1) && n <= 24 ? ` ${String(mi.ym.y).slice(2)}` : ''}
                </text>
              </g>
            );
          })}
          {budgetPath && (
            <path d={budgetPath} fill="none" stroke={theme.axisText} strokeWidth={2} strokeDasharray="4 3" strokeLinejoin="round" />
          )}
          {months.map((mi, i) => (
            <rect key={i} x={ml + band * i} y={0} width={band} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
      )}
      {hover != null && months[hover] && (() => {
        const mi = months[hover];
        const cx = ml + band * hover + band / 2;
        const shown = series.filter(s => (s.values[hover] ?? 0) !== 0);
        return (
          <Tooltip x={cx} width={width} isDark={theme.isDark}>
            <div className="font-semibold mb-1">{MONTH_NAMES[mi.ym.m - 1]} {mi.ym.y}{mi.state === 'current' ? ' (laufend)' : ''}</div>
            {shown.slice(0, 12).map(s => (
              <TipRow key={s.id} label={s.name} value={fmt(s.values[hover])} dot={colorClasses(s.color).dot} />
            ))}
            {shown.length > 12 && <div className={muted}>… {shown.length - 12} weitere</div>}
            <TipRow label="Ausgaben" value={fmt(mi.actual)} strong />
            <TipRow label={targetLabel} value={mi.target > 0 ? fmt(mi.target) : '—'} muted={muted} />
            {budgetLabel && (mi.budget ?? 0) > 0 && <TipRow label={budgetLabel} value={fmt(mi.budget!)} muted={muted} />}
            {mi.target > 0 && <TipRow label="Überschuss" value={fmt(mi.target - mi.actual)} muted={muted} />}
          </Tooltip>
        );
      })()}
    </div>
  );
}
