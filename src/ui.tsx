import React from 'react';

// Shared Tailwind class sets for the dark / light theme (same look as Z9nAI Hours)
export function themeClasses(isDark: boolean) {
  return {
    muted: isDark ? 'text-white/40' : 'text-black/40',
    faint: isDark ? 'text-white/25' : 'text-black/25',
    soft: isDark ? 'text-white/70' : 'text-black/70',
    border: isDark ? 'border-white/8' : 'border-black/8',
    rowHover: isDark ? 'hover:bg-white/5' : 'hover:bg-black/5',
    selRow: isDark ? 'bg-white/8' : 'bg-black/8',
    surface: isDark ? 'bg-[#0e0f11]' : 'bg-[#f5f4f0]',
    panel: isDark ? 'bg-[#0c0d0f]' : 'bg-[#eae9e5]',
    title: `text-sm font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`,
    section: `text-[10px] uppercase tracking-wider ${isDark ? 'text-white/40' : 'text-black/40'}`,
    btn: `flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-40 disabled:pointer-events-none ${
      isDark ? 'border-white/15 text-white/60 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/60 hover:border-black/30 hover:text-black'}`,
    btnPrimary: `flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-40 disabled:pointer-events-none ${
      isDark ? 'border-blue-500/40 text-blue-300 hover:border-blue-400 hover:text-blue-200' : 'border-blue-500/40 text-blue-700 hover:border-blue-500'}`,
    iconBtn: `p-1 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none ${
      isDark ? 'text-white/40 hover:text-white hover:bg-white/10' : 'text-black/40 hover:text-black hover:bg-black/10'}`,
    input: `text-xs px-2.5 py-1.5 rounded border outline-none transition-colors ${
      isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30 [color-scheme:dark]'
             : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30'}`,
    seg: (active: boolean) => `text-xs px-2.5 py-1.5 transition-colors ${
      active ? isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-black'
             : isDark ? 'text-white/40 hover:text-white/70' : 'text-black/40 hover:text-black/70'}`,
    segBox: `flex rounded border overflow-hidden ${isDark ? 'border-white/10' : 'border-black/10'}`,
    pos: isDark ? 'text-emerald-400' : 'text-emerald-600',
    neg: 'text-red-400',
  };
}

export function Field({ label, children, isDark, className = '' }: {
  label: string; children: React.ReactNode; isDark: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <label className={`block text-[10px] uppercase tracking-wider mb-1 ${isDark ? 'text-white/40' : 'text-black/40'}`}>{label}</label>
      {children}
    </div>
  );
}

// Signed amount with colour: positive surplus green, negative red
export function Signed({ value, fmt, isDark, zero = '–' }: { value: number; fmt: (n: number) => string; isDark: boolean; zero?: string }) {
  if (Math.round(value) === 0) return <span className={isDark ? 'text-white/25' : 'text-black/25'}>{zero}</span>;
  return <span className={value > 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : 'text-red-400'}>{fmt(value)}</span>;
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
