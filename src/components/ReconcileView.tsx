import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Plus, Trash2, Repeat } from 'lucide-react';
import { useStore } from '../store';
import { Booking, EMPTY_YEAR } from '../types';
import { colorClasses } from '../colors';
import { MONTH_NAMES, MONTH_SHORT, fmtAmount, fmtChf, fmtDate, genId, monthOf, pad, parseAmount, yearStats } from '../budget';
import { Signed, themeClasses } from '../ui';

const ADJUST = '_adjust'; // pseudo account: debits that are no expense (e.g. transfers to savings)

// Abgleich mit dem Bankauszug, wie im bisherigen Sheet: Belastungen laut Bank
// pro Monat gegen die gebuchten Ausgaben. Abschreiber (Fixbuchungen ohne
// Bankbewegung) und Negativbuchungen (Rückerstattungen) werden herausgerechnet.
export default function ReconcileView({ year, setYear, month, setMonth }: {
  year: number; setYear: (y: number) => void; month: number; setMonth: (m: number) => void;
}) {
  const { isDark, categories, years, settings, setSettings, setBalance } = useStore();
  const t = themeClasses(isDark);
  const data = years[year] ?? EMPTY_YEAR(year);
  const st = yearStats(data, categories);
  const accounts = settings.accounts;
  const [newName, setNewName] = useState('');
  const byId = new Map(categories.map(c => [c.id, c]));
  const noBank = new Set(settings.recurring.filter(r => r.noBank).map(r => r.id));
  const isExpense = (b: Booking) => (byId.get(b.categoryId)?.kind ?? 'expense') === 'expense';

  const addAccount = () => {
    const name = newName.trim();
    if (!name) return;
    setSettings(s => ({ ...s, accounts: [...s.accounts, { id: genId(), name }] }));
    setNewName('');
  };
  const renameAccount = (id: string, name: string) => setSettings(s => ({ ...s, accounts: s.accounts.map(a => a.id === id ? { ...a, name } : a) }));
  const removeAccount = (id: string, name: string) => {
    if (!confirm(`Konto «${name}» entfernen? Eingetragene Beträge bleiben in den Jahresdateien, werden aber nicht mehr angezeigt.`)) return;
    setSettings(s => ({ ...s, accounts: s.accounts.filter(a => a.id !== id) }));
  };

  // Per month: what the bank says and what the books say
  const rows = MONTH_NAMES.map((label, i) => {
    const m = i + 1;
    const ym = `${year}-${pad(m)}`;
    const entered = data.balances?.[ym] ?? {};
    const bankParts = accounts.map(a => entered[a.id]);
    const bank = bankParts.some(v => v != null) ? bankParts.reduce((s, v) => s + (v ?? 0), 0) : null;
    const adjust = entered[ADJUST] ?? 0;
    const list = data.bookings.filter(b => monthOf(b.date) === m && isExpense(b));
    const writeOffs = list.filter(b => b.recurringId && noBank.has(b.recurringId));
    const negatives = list.filter(b => b.amount < 0 && !(b.recurringId && noBank.has(b.recurringId)));
    const booked = st.expense.months[i];
    const writeOff = writeOffs.reduce((s, b) => s + b.amount, 0);
    const refund = -negatives.reduce((s, b) => s + b.amount, 0) || 0;
    const expected = booked - writeOff + refund;
    const diff = bank != null ? bank - adjust - expected : null;
    return { m, ym, label, entered, bank, adjust, booked, writeOff, refund, expected, diff, writeOffs, negatives };
  });
  const sel = rows[month - 1];
  const num = (v: number) => Math.round(v) === 0 ? <span className={t.faint}>–</span> : fmtChf(v);

  const BookingList = ({ title, list, empty }: { title: string; list: Booking[]; empty: string }) => (
    <div className={`rounded-xl border p-4 ${t.border}`}>
      <div className={`${t.section} mb-2`}>{title}</div>
      {list.length === 0 ? <p className={`text-xs ${t.faint}`}>{empty}</p> : (
        <table className="text-xs w-full">
          <tbody>
            {list.map(b => {
              const c = byId.get(b.categoryId);
              return (
                <tr key={b.id} className={`border-t ${t.border}`}>
                  <td className="py-1 pr-3 whitespace-nowrap">{fmtDate(b.date)}</td>
                  <td className="py-1 pr-3"><span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${colorClasses(c?.color ?? 'slate').dot}`} />{c?.name}</span></td>
                  <td className={`py-1 pr-3 ${b.text ? '' : t.faint}`}><span className="flex items-center gap-1.5">{b.recurringId && <Repeat size={11} className={t.muted} />}{b.text || '–'}</span></td>
                  <td className={`py-1 text-right tabular-nums ${b.amount < 0 ? t.neg : ''}`}>{fmtAmount(b.amount)}</td>
                </tr>
              );
            })}
            <tr className={`border-t ${t.border} font-semibold`}>
              <td className="py-1" colSpan={3}>Total</td>
              <td className="py-1 text-right tabular-nums">{fmtAmount(list.reduce((s, b) => s + b.amount, 0))}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <h2 className={t.title}>Abgleich</h2>
        <div className="flex items-center gap-1 ml-2">
          <button className={t.iconBtn} onClick={() => setYear(year - 1)}><ChevronLeft size={14} /></button>
          <span className="text-xs font-semibold w-10 text-center">{year}</span>
          <button className={t.iconBtn} onClick={() => setYear(year + 1)}><ChevronRight size={14} /></button>
        </div>
      </div>
      <p className={`text-[11px] leading-relaxed mb-5 ${t.muted}`}>
        Pro Monat die <b>Belastungen laut Bankauszug</b> je Konto eintragen (Summe aller Abbuchungen), unter «Abzüge» Belastungen,
        die keine Ausgabe sind (z.&nbsp;B. Übertrag aufs Sparkonto). Die Buchhaltung muss aufgehen:
        gebuchte Ausgaben − Abschreiber (Fixbuchungen ohne Bankbewegung) + Rückerstattungen (Negativbuchungen) = Bank − Abzüge.
        Eine positive Differenz heisst, es fehlen Ausgaben in der Buchhaltung; eine negative, es ist zu viel gebucht.
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
          placeholder="Neues Konto, z. B. Pascal" className={`${t.input} w-56`} />
        <button className={t.btn} onClick={addAccount} disabled={!newName.trim()}><Plus size={12} /> Konto</button>
      </div>

      {accounts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-xs min-w-max">
            <thead>
              <tr className={`text-[10px] uppercase tracking-wider ${t.muted}`}>
                <th className="text-left font-normal py-1.5 px-2">Monat</th>
                {accounts.map(a => <th key={a.id} className="text-right font-normal px-2" title="Belastungen laut Bankauszug">{a.name}</th>)}
                <th className="text-right font-normal px-2" title="Belastungen, die keine Ausgabe sind">Abzüge</th>
                <th className={`text-right font-normal px-3 border-l ${t.border}`}>Bank netto</th>
                <th className={`text-right font-normal px-3 border-l ${t.border}`}>Gebucht</th>
                <th className="text-right font-normal px-3">− Abschreiber</th>
                <th className="text-right font-normal px-3">+ Rückerst.</th>
                <th className="text-right font-normal px-3">= Erwartet</th>
                <th className={`text-right font-normal px-3 border-l ${t.border}`}>Differenz</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const beyond = r.m > st.bookedMonths;
                const ok = r.diff != null && Math.abs(r.diff) < 0.5;
                return (
                  <tr key={r.ym} onClick={() => setMonth(r.m)}
                    className={`border-t ${t.border} ${t.rowHover} cursor-pointer ${month === r.m ? t.selRow : ''} ${beyond ? t.faint : ''}`}>
                    <td className="px-2 py-1 whitespace-nowrap">{r.label}</td>
                    {accounts.map(a => (
                      <td key={a.id} className="px-1 py-0.5 text-right" onClick={e => e.stopPropagation()}>
                        <AmountCell value={r.entered[a.id]} onCommit={v => setBalance(r.ym, a.id, v)} isDark={isDark} />
                      </td>
                    ))}
                    <td className="px-1 py-0.5 text-right" onClick={e => e.stopPropagation()}>
                      <AmountCell value={r.entered[ADJUST]} onCommit={v => setBalance(r.ym, ADJUST, v)} isDark={isDark} />
                    </td>
                    <td className={`px-3 py-1 text-right tabular-nums border-l ${t.border}`}>{r.bank != null ? fmtChf(r.bank - r.adjust) : '–'}</td>
                    <td className={`px-3 py-1 text-right tabular-nums border-l ${t.border}`}>{num(r.booked)}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{num(r.writeOff)}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{num(r.refund)}</td>
                    <td className="px-3 py-1 text-right tabular-nums font-semibold">{num(r.expected)}</td>
                    <td className={`px-3 py-1 text-right tabular-nums font-semibold border-l ${t.border}`}>
                      {r.diff == null ? '' : ok ? <span className={`inline-flex items-center gap-1 ${t.pos}`}><Check size={12} /> 0</span>
                        : <Signed value={Math.round(r.diff * 100) / 100} fmt={fmtAmount} isDark={isDark} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <BookingList title={`Abschreiber im ${MONTH_NAMES[month - 1]} ${year}`} list={sel.writeOffs}
          empty="Keine. Fixbuchungen mit «keine Bankbewegung» erscheinen hier." />
        <BookingList title={`Rückerstattungen / Negativbuchungen im ${MONTH_NAMES[month - 1]} ${year}`} list={sel.negatives}
          empty="Keine Negativbuchungen in diesem Monat." />
      </div>
      <p className={`text-[11px] mt-3 ${t.muted}`}>
        {MONTH_SHORT[month - 1]} {year}: gebucht {fmtChf(sel.booked)} − Abschreiber {fmtChf(sel.writeOff)} + Rückerstattungen {fmtChf(sel.refund)} = erwartete Belastungen {fmtChf(sel.expected)}.
      </p>
    </div>
  );
}

function AmountCell({ value, onCommit, isDark }: { value: number | undefined; onCommit: (v: number | null) => void; isDark: boolean }) {
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
