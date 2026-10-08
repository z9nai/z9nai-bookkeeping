import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { EMPTY_YEAR } from '../types';
import { MONTH_NAMES, fmtAmount, fmtChf, genId, pad, parseAmount, yearStats } from '../budget';
import { Signed, themeClasses } from '../ui';

export default function ReconcileView({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  const { isDark, categories, years, settings, setSettings, setBalance } = useStore();
  const t = themeClasses(isDark);
  const data = years[year] ?? EMPTY_YEAR(year);
  const st = yearStats(data, categories);
  const accounts = settings.accounts;
  const [newName, setNewName] = useState('');

  const balanceOf = (ym: string, accId: string): number | undefined => {
    const y = years[Number(ym.slice(0, 4))];
    return y?.balances?.[ym]?.[accId];
  };
  const totalOf = (ym: string): number | null => {
    if (accounts.length === 0) return null;
    let sum = 0;
    for (const a of accounts) {
      const v = balanceOf(ym, a.id);
      if (v == null) return null;
      sum += v;
    }
    return sum;
  };

  const addAccount = () => {
    const name = newName.trim();
    if (!name) return;
    setSettings(s => ({ ...s, accounts: [...s.accounts, { id: genId(), name }] }));
    setNewName('');
  };
  const renameAccount = (id: string, name: string) => setSettings(s => ({ ...s, accounts: s.accounts.map(a => a.id === id ? { ...a, name } : a) }));
  const removeAccount = (id: string, name: string) => {
    if (!confirm(`Konto «${name}» entfernen? Eingetragene Kontostände bleiben in den Jahresdateien, werden aber nicht mehr angezeigt.`)) return;
    setSettings(s => ({ ...s, accounts: s.accounts.filter(a => a.id !== id) }));
  };

  const rows: { ym: string; label: string; month: number | null }[] = [
    { ym: `${year - 1}-12`, label: `Dez ${year - 1} (Anfang)`, month: null },
    ...MONTH_NAMES.map((m, i) => ({ ym: `${year}-${pad(i + 1)}`, label: m, month: i })),
  ];
  let prevTotal: number | null = totalOf(rows[0].ym);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <h2 className={t.title}>Abgleich</h2>
        <div className="flex items-center gap-1 ml-2">
          <button className={t.iconBtn} onClick={() => setYear(year - 1)}><ChevronLeft size={14} /></button>
          <span className="text-xs font-semibold w-10 text-center">{year}</span>
          <button className={t.iconBtn} onClick={() => setYear(year + 1)}><ChevronRight size={14} /></button>
        </div>
      </div>
      <p className={`text-[11px] leading-relaxed mb-5 ${t.muted}`}>
        Kontostände laut Bankauszug am Monatsende eintragen. Die Veränderung gegenüber dem Vormonat muss dem Überschuss
        der Buchhaltung (Einnahmen − Ausgaben) entsprechen. Eine positive Differenz heisst: Es fehlen Einnahmen oder es
        wurden zu viele Ausgaben gebucht; eine negative: Es fehlen Ausgaben.
      </p>

      <div className={`${t.section} mb-2`}>Konten</div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {accounts.map(a => (
          <span key={a.id} className={`flex items-center gap-1 rounded border ${t.border} pl-1`}>
            <input value={a.name} onChange={e => renameAccount(a.id, e.target.value)} className={`${t.input} border-0 bg-transparent w-40`} />
            <button className={t.iconBtn} onClick={() => removeAccount(a.id, a.name)} title="Konto entfernen"><Trash2 size={12} /></button>
          </span>
        ))}
        <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addAccount(); }}
          placeholder="Neues Konto, z. B. Konto Pascal" className={`${t.input} w-56`} />
        <button className={t.btn} onClick={addAccount} disabled={!newName.trim()}><Plus size={12} /> Konto</button>
      </div>

      {accounts.length > 0 && (
        <table className="text-xs">
          <thead>
            <tr className={`text-[10px] uppercase tracking-wider ${t.muted}`}>
              <th className="text-left font-normal py-1.5 px-2">Monat</th>
              {accounts.map(a => <th key={a.id} className="text-right font-normal px-2">{a.name}</th>)}
              <th className={`text-right font-normal px-3 border-l ${t.border}`}>Bank total</th>
              <th className="text-right font-normal px-3">Δ Bank</th>
              <th className="text-right font-normal px-3">Buchhaltung</th>
              <th className="text-right font-normal px-3">Differenz</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const total = totalOf(r.ym);
              const delta = total != null && prevTotal != null ? total - prevTotal : null;
              const book = r.month != null ? st.surplus[r.month] : null;
              const diff = delta != null && book != null ? delta - book : null;
              const ok = diff != null && Math.abs(diff) < 0.5;
              const beyond = r.month != null && r.month >= st.bookedMonths;
              if (total != null) prevTotal = total;
              return (
                <tr key={r.ym} className={`border-t ${t.border} ${t.rowHover} ${r.month == null ? t.muted : ''} ${beyond ? t.faint : ''}`}>
                  <td className="px-2 py-1 whitespace-nowrap">{r.label}</td>
                  {accounts.map(a => (
                    <td key={a.id} className="px-1 py-0.5 text-right">
                      <BalanceInput value={balanceOf(r.ym, a.id)} onCommit={v => setBalance(r.ym, a.id, v)} isDark={isDark} />
                    </td>
                  ))}
                  <td className={`px-3 py-1 text-right tabular-nums border-l ${t.border}`}>{total != null ? fmtChf(total) : '–'}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{delta != null ? <Signed value={delta} fmt={fmtChf} isDark={isDark} zero="0" /> : '–'}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{book != null ? <Signed value={book} fmt={fmtChf} isDark={isDark} zero="0" /> : ''}</td>
                  <td className="px-3 py-1 text-right tabular-nums font-semibold">
                    {diff == null ? '' : ok ? <span className={`inline-flex items-center gap-1 ${t.pos}`}><Check size={12} /> 0</span>
                      : <span className={t.neg}>{fmtAmount(Math.round(diff * 100) / 100)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BalanceInput({ value, onCommit, isDark }: { value: number | undefined; onCommit: (v: number | null) => void; isDark: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text == null) return;
    const n = parseAmount(text);
    onCommit(text.trim() === '' ? null : isNaN(n) ? null : n);
    setText(null);
  };
  return (
    <input value={text ?? (value != null ? String(value) : '')} onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setText(null); }}
      placeholder="–" inputMode="decimal"
      className={`w-[90px] text-right text-xs px-1.5 py-0.5 rounded border outline-none tabular-nums transition-colors ${
        isDark ? 'bg-transparent border-transparent hover:border-white/15 focus:border-white/30 focus:bg-white/5 text-white placeholder-white/25'
               : 'bg-transparent border-transparent hover:border-black/15 focus:border-black/30 focus:bg-black/5 text-black placeholder-black/25'}`} />
  );
}
