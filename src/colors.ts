export const CATEGORY_COLORS: Record<string, { label: string; bg: string; border: string; dot: string; swatch: string }> = {
  blue:    { label: 'Blau',     bg: 'bg-blue-500/70',    border: 'border-blue-400',    dot: 'bg-blue-400',    swatch: '#60a5fa' },
  emerald: { label: 'Grün',     bg: 'bg-emerald-500/70', border: 'border-emerald-400', dot: 'bg-emerald-400', swatch: '#34d399' },
  violet:  { label: 'Violett',  bg: 'bg-violet-500/70',  border: 'border-violet-400',  dot: 'bg-violet-400',  swatch: '#a78bfa' },
  amber:   { label: 'Orange',   bg: 'bg-amber-500/70',   border: 'border-amber-400',   dot: 'bg-amber-400',   swatch: '#fbbf24' },
  rose:    { label: 'Rot',      bg: 'bg-rose-500/70',    border: 'border-rose-400',    dot: 'bg-rose-400',    swatch: '#fb7185' },
  cyan:    { label: 'Cyan',     bg: 'bg-cyan-500/70',    border: 'border-cyan-400',    dot: 'bg-cyan-400',    swatch: '#22d3ee' },
  pink:    { label: 'Pink',     bg: 'bg-pink-500/70',    border: 'border-pink-400',    dot: 'bg-pink-400',    swatch: '#f472b6' },
  lime:    { label: 'Lime',     bg: 'bg-lime-500/70',    border: 'border-lime-400',    dot: 'bg-lime-400',    swatch: '#a3e635' },
  teal:    { label: 'Türkis',   bg: 'bg-teal-500/70',    border: 'border-teal-400',    dot: 'bg-teal-400',    swatch: '#2dd4bf' },
  indigo:  { label: 'Indigo',   bg: 'bg-indigo-500/70',  border: 'border-indigo-400',  dot: 'bg-indigo-400',  swatch: '#818cf8' },
  orange:  { label: 'Ocker',    bg: 'bg-orange-500/70',  border: 'border-orange-400',  dot: 'bg-orange-400',  swatch: '#fb923c' },
  fuchsia: { label: 'Fuchsia',  bg: 'bg-fuchsia-500/70', border: 'border-fuchsia-400', dot: 'bg-fuchsia-400', swatch: '#e879f9' },
  yellow:  { label: 'Gelb',     bg: 'bg-yellow-500/70',  border: 'border-yellow-400',  dot: 'bg-yellow-400',  swatch: '#facc15' },
  sky:     { label: 'Himmel',   bg: 'bg-sky-500/70',     border: 'border-sky-400',     dot: 'bg-sky-400',     swatch: '#38bdf8' },
  red:     { label: 'Dunkelrot', bg: 'bg-red-500/70',    border: 'border-red-400',     dot: 'bg-red-400',     swatch: '#f87171' },
  green:   { label: 'Dunkelgrün', bg: 'bg-green-500/70', border: 'border-green-400',   dot: 'bg-green-400',   swatch: '#4ade80' },
  purple:  { label: 'Purpur',   bg: 'bg-purple-500/70',  border: 'border-purple-400',  dot: 'bg-purple-400',  swatch: '#c084fc' },
  stone:   { label: 'Stein',    bg: 'bg-stone-500/70',   border: 'border-stone-400',   dot: 'bg-stone-400',   swatch: '#a8a29e' },
  slate:   { label: 'Grau',     bg: 'bg-slate-500/70',   border: 'border-slate-400',   dot: 'bg-slate-400',   swatch: '#94a3b8' },
};

export const COLOR_KEYS = Object.keys(CATEGORY_COLORS);
export const DEFAULT_COLOR = 'blue';

export function colorClasses(colorKey: string) {
  return CATEGORY_COLORS[colorKey] ?? CATEGORY_COLORS[DEFAULT_COLOR];
}

// The least used colour of the palette (first in palette order on ties)
export function nextColor(used: string[]): string {
  const counts = new Map(COLOR_KEYS.map(k => [k, 0]));
  for (const u of used) if (counts.has(u)) counts.set(u, counts.get(u)! + 1);
  let best = COLOR_KEYS[0];
  for (const k of COLOR_KEYS) if (counts.get(k)! < counts.get(best)!) best = k;
  return best;
}
