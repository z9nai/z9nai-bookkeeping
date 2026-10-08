import React, { useState } from 'react';
import { Theme, TipRow, Tooltip, columnPath, useWidth } from './charts';

// ── Shared y-scale with a zero line (values may be negative) ────────────────
function scale(min: number, max: number, top: number, bottom: number) {
  const lo = Math.min(0, min), hi = Math.max(0, max);
  // One step for the whole range so negative and positive ticks are evenly spaced
  const raw = Math.max(1e-9, (hi - lo) / 4);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * pow).find(s => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step * 0.001; v += step) ticks.push(Math.round(v / step) * step);
  const tMin = ticks[0], tMax = ticks[ticks.length - 1];
  const span = tMax - tMin || 1;
  const yOf = (v: number) => top + (tMax - v) / span * (bottom - top);
  return { ticks, yOf, zero: yOf(0) };
}

export interface Series { name: string; color: string; values: number[] }
export interface Line { name: string; color: string; values: (number | null)[]; dashed?: boolean }

// Grouped columns per label (e.g. years) with optional lines on top
export function ColumnChart({ labels, series, lines = [], theme, fmt, axisFmt, height = 240, highlight }: {
  labels: string[]; series: Series[]; lines?: Line[]; theme: Theme;
  fmt: (v: number) => string; axisFmt: (v: number) => string; height?: number; highlight?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = height, mt = 12, mb = 24, ml = 48, mr = 8;
  const plotW = Math.max(0, width - ml - mr);
  const n = labels.length;
  const band = n > 0 ? plotW / n : 0;
  const all = [...series.flatMap(s => s.values), ...lines.flatMap(l => l.values.filter((v): v is number => v != null))];
  const { ticks, yOf, zero } = scale(Math.min(0, ...all), Math.max(1, ...all), mt, H - mb);
  const gap = 2;
  const barW = Math.max(2, Math.min(22, (band * 0.7 - gap * (series.length - 1)) / Math.max(1, series.length)));
  const groupW = barW * series.length + gap * (series.length - 1);
  const muted = theme.isDark ? 'text-white/40' : 'text-black/40';
  const every = n > 14 ? Math.ceil(n / 12) : 1;

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} className="block">
          {ticks.map(tk => (
            <g key={tk}>
              <line x1={ml} x2={width - mr} y1={yOf(tk)} y2={yOf(tk)} stroke={tk === 0 ? theme.axisText : theme.grid} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={ml - 8} y={yOf(tk)} dy="0.32em" textAnchor="end" fontSize={10} fill={theme.axisText} className="tabular-nums">{axisFmt(tk)}</text>
            </g>
          ))}
          {labels.map((label, i) => {
            const cx = ml + band * i + band / 2;
            const dim = hover != null && hover !== i;
            return (
              <g key={label} opacity={dim ? 0.45 : 1}>
                {(hover === i || highlight === i) && <rect x={ml + band * i} y={mt} width={band} height={H - mb - mt} fill={theme.ghost} />}
                {series.map((s, j) => {
                  const v = s.values[i] ?? 0;
                  const x = cx - groupW / 2 + j * (barW + gap);
                  const y0 = yOf(0), y1 = yOf(v);
                  const top = Math.min(y0, y1), h = Math.abs(y0 - y1);
                  return v >= 0
                    ? <path key={j} d={columnPath(x, top, barW, h, true)} fill={s.color} />
                    : <rect key={j} x={x} y={top} width={barW} height={h} fill={s.color} rx={2} />;
                })}
                {(i % every === 0 || i === n - 1) && (
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill={highlight === i ? theme.ink : theme.axisText} fontWeight={highlight === i ? 600 : 400}>{label}</text>
                )}
              </g>
            );
          })}
          {lines.map((l, k) => {
            let d = '';
            l.values.forEach((v, i) => {
              if (v == null) return;
              const x = ml + band * i + band / 2, y = yOf(v);
              d += d && l.values[i - 1] != null ? ` L${x},${y}` : ` M${x},${y}`;
            });
            return (
              <g key={k}>
                <path d={d} fill="none" stroke={l.color} strokeWidth={2} strokeDasharray={l.dashed ? '4 3' : undefined} strokeLinejoin="round" />
                {!l.dashed && l.values.map((v, i) => v == null ? null : (
                  <circle key={i} cx={ml + band * i + band / 2} cy={yOf(v)} r={2.5} fill={theme.surface} stroke={l.color} strokeWidth={2} />
                ))}
              </g>
            );
          })}
          {labels.map((_, i) => (
            <rect key={i} x={ml + band * i} y={0} width={band} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
          <line x1={ml} x2={width - mr} y1={zero} y2={zero} stroke={theme.axisText} strokeWidth={1} shapeRendering="crispEdges" />
        </svg>
      )}
      {hover != null && labels[hover] != null && (
        <Tooltip x={ml + band * hover + band / 2} width={width} isDark={theme.isDark}>
          <div className="font-semibold mb-1">{labels[hover]}</div>
          {series.map((s, j) => <TipRow key={j} label={s.name} value={fmt(s.values[hover] ?? 0)} dot="" />)}
          {lines.map((l, k) => l.values[hover] == null ? null : <TipRow key={k} label={l.name} value={fmt(l.values[hover]!)} muted={muted} />)}
        </Tooltip>
      )}
    </div>
  );
}

// Area under a line, e.g. cumulative savings
export function AreaChart({ labels, values, color, theme, fmt, axisFmt, height = 200 }: {
  labels: string[]; values: number[]; color: string; theme: Theme; fmt: (v: number) => string; axisFmt: (v: number) => string; height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = height, mt = 12, mb = 24, ml = 56, mr = 12;
  const plotW = Math.max(0, width - ml - mr);
  const n = values.length;
  const step = n > 1 ? plotW / (n - 1) : 0;
  const { ticks, yOf, zero } = scale(Math.min(0, ...values), Math.max(1, ...values), mt, H - mb);
  const xOf = (i: number) => ml + step * i;
  let line = '';
  values.forEach((v, i) => { line += `${i ? ' L' : 'M'}${xOf(i)},${yOf(v)}`; });
  const area = n > 0 ? `${line} L${xOf(n - 1)},${zero} L${xOf(0)},${zero} Z` : '';
  const every = n > 14 ? Math.ceil(n / 12) : 1;
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && n > 0 && (
        <svg width={width} height={H} className="block">
          {ticks.map(tk => (
            <g key={tk}>
              <line x1={ml} x2={width - mr} y1={yOf(tk)} y2={yOf(tk)} stroke={tk === 0 ? theme.axisText : theme.grid} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={ml - 8} y={yOf(tk)} dy="0.32em" textAnchor="end" fontSize={10} fill={theme.axisText} className="tabular-nums">{axisFmt(tk)}</text>
            </g>
          ))}
          <path d={area} fill={color} fillOpacity={0.15} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          {values.map((v, i) => (
            <g key={i}>
              {(hover === i) && <line x1={xOf(i)} x2={xOf(i)} y1={mt} y2={H - mb} stroke={theme.axisText} strokeWidth={1} strokeDasharray="2 2" />}
              <circle cx={xOf(i)} cy={yOf(v)} r={hover === i ? 4 : 2.5} fill={theme.surface} stroke={color} strokeWidth={2} />
              {(i % every === 0 || i === n - 1) && <text x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={theme.axisText}>{labels[i]}</text>}
              <rect x={xOf(i) - step / 2} y={0} width={Math.max(step, 8)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          ))}
        </svg>
      )}
      {hover != null && (
        <Tooltip x={xOf(hover)} width={width} isDark={theme.isDark}>
          <div className="font-semibold mb-1">{labels[hover]}</div>
          <TipRow label="Kumuliert" value={fmt(values[hover])} />
          {hover > 0 && <TipRow label="Veränderung" value={fmt(values[hover] - values[hover - 1])} muted={theme.isDark ? 'text-white/40' : 'text-black/40'} />}
        </Tooltip>
      )}
    </div>
  );
}

// Donut with a legend; hovering a slice highlights its legend entry and vice versa
export interface Slice { id: string; label: string; color: string; value: number }
export function Donut({ slices, theme, fmt, size = 220 }: { slices: Slice[]; theme: Theme; fmt: (v: number) => string; size?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0);
  const r = size / 2, ri = r * 0.62, c = size / 2;
  let angle = -Math.PI / 2;
  const arcs = slices.filter(s => s.value > 0).map(s => {
    const a0 = angle, a1 = angle + (s.value / total) * Math.PI * 2;
    angle = a1;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${c + rad * Math.cos(a)},${c + rad * Math.sin(a)}`;
    const d = `M${p(a0, r)} A${r},${r} 0 ${big} 1 ${p(a1, r)} L${p(a1, ri)} A${ri},${ri} 0 ${big} 0 ${p(a0, ri)} Z`;
    return { ...s, d };
  });
  const sel = slices.find(s => s.id === hover);
  const muted = theme.isDark ? 'text-white/40' : 'text-black/40';
  return (
    <div className="flex items-start gap-6 flex-wrap" onMouseLeave={() => setHover(null)}>
      <svg width={size} height={size} className="flex-shrink-0">
        {arcs.map(a => (
          <path key={a.id} d={a.d} fill={a.color} opacity={hover && hover !== a.id ? 0.35 : 1} stroke={theme.surface} strokeWidth={2}
            onMouseEnter={() => setHover(a.id)} />
        ))}
        <text x={c} y={c - 6} textAnchor="middle" fontSize={11} fill={theme.axisText}>{sel ? sel.label.slice(0, 22) : 'Total'}</text>
        <text x={c} y={c + 12} textAnchor="middle" fontSize={14} fontWeight={600} fill={theme.ink} className="tabular-nums">{fmt(sel ? sel.value : total)}</text>
        {sel && <text x={c} y={c + 28} textAnchor="middle" fontSize={10} fill={theme.axisText}>{total ? `${Math.round(sel.value / total * 100)}%` : ''}</text>}
      </svg>
      <div className="text-[11px] grid grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-0.5 min-w-[260px]">
        {[...slices].filter(s => s.value > 0).sort((a, b) => b.value - a.value).map(s => (
          <React.Fragment key={s.id}>
            <span className="w-2 h-2 rounded-full mt-1" style={{ background: s.color }} onMouseEnter={() => setHover(s.id)} />
            <span className={`truncate cursor-default ${hover && hover !== s.id ? muted : ''}`} onMouseEnter={() => setHover(s.id)}>{s.label}</span>
            <span className="text-right tabular-nums">{fmt(s.value)}</span>
            <span className={`text-right tabular-nums ${muted}`}>{total ? `${Math.round(s.value / total * 100)}%` : ''}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
