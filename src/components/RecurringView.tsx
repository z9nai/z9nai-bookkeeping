import React, { useState } from 'react';
import { Plus, Trash2, Repeat, X } from 'lucide-react';
import { useStore } from '../store';
import { Recurring } from '../types';
import { colorClasses } from '../colors';
import { MONTH_SHORT, fmtAmount, fmtChf, genId, parseAmount } from '../budget';
import { bookedSoFar, monthsFor, recurringEnd, ymToday } from '../recurring';
import { Field, themeClasses } from '../ui';

const fmtYm = (ym: string) => ym ? `${MONTH_SHORT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : '–';

export default function RecurringView() {
  const { isDark, categories, settings, setSettings, years } = useStore();
  const t = themeClasses(isDark);
  const [editing, setEditing] = useState<string | null>(null);
  const byId = new Map(categories.map(c => [c.id, c]));

  const update = (id: string, patch: Partial<Recurring>) =>
    setSettings(s => ({ ...s, recurring: s.recurring.map(r => r.id === id ? { ...r, ...patch } : r) }));
  const add = () => {
    const r: Recurring = {
      id: genId(), name: '', categoryId: categories.find(c => c.kind === 'expense' && !c.archived)?.id ?? '',
      amount: 0, text: '', from: ymToday(),
    };
    setSettings(s => ({ ...s, recurring: [...s.recurring, r] }));
    setEditing(r.id);
  };
  const remove = (r: Recurring) => {
    if (!confirm(`Fixbuchung «${r.name || 'ohne Name'}» löschen? Bereits erzeugte Buchungen bleiben bestehen.`)) return;
    setSettings(s => ({ ...s, recurring: s.recurring.filter(x => x.id !== r.id) }));
  };
  const unskip = (r: Recurring, ym: string) => update(r.id, { skip: (r.skip ?? []).filter(x => x !== ym) });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <h2 className={t.title}>Fixbuchungen</h2>
        <button className={`${t.btnPrimary} ml-auto`} onClick={add} disabled={categories.length === 0}><Plus size={12} /> Neue Fixbuchung</button>
      </div>
      <p className={`text-[11px] leading-relaxed mb-5 ${t.muted}`}>
        Monatlich wiederkehrende Buchungen, z.&nbsp;B. Abschreibungen: Die App erzeugt sie automatisch am 1. jedes Monats bis zum
        laufenden Monat. Mit einem Gesamtbetrag endet die Buchung, sobald er abgeschrieben ist (der letzte Monat bucht den Rest).
        Änderungen am Betrag wirken nur auf künftige Monate; einzelne Monate lassen sich in den Buchungen auslassen.
      </p>

      {settings.recurring.length === 0 && <p className={`text-xs ${t.faint}`}>Noch keine Fixbuchungen.</p>}

      <div className="space-y-3">
        {settings.recurring.map(r => {
          const cat = byId.get(r.categoryId);
          const booked = bookedSoFar(r, years);
          const end = recurringEnd(r);
          const n = monthsFor(r);
          const rest = r.total ? Math.max(0, r.total - Math.abs(booked.amount)) : null;
          const open = editing === r.id;
          return (
            <div key={r.id} className={`rounded-xl border ${t.border}`}>
              <div className={`flex items-center gap-3 px-4 py-2.5 text-xs cursor-pointer ${t.rowHover}`} onClick={() => setEditing(open ? null : r.id)}>
                <Repeat size={13} className={t.muted} />
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorClasses(cat?.color ?? 'slate').dot}`} />
                <span className="font-semibold min-w-[160px]">{r.name || <span className={t.faint}>ohne Name</span>}</span>
                <span className={t.muted}>{cat?.name ?? <span className="text-red-400">Kategorie fehlt</span>}</span>
                <span className="ml-auto tabular-nums">{fmtAmount(r.amount)} / Mt</span>
                <span className={`tabular-nums ${t.muted}`}>{fmtYm(r.from)} – {end ? fmtYm(end) : 'offen'}</span>
                {r.total ? (
                  <span className={`tabular-nums ${t.muted}`} title="abgeschrieben / Gesamtbetrag">
                    {fmtChf(Math.abs(booked.amount))} / {fmtChf(r.total)} · Rest <span className={rest === 0 ? t.pos : ''}>{fmtChf(rest ?? 0)}</span>
                  </span>
                ) : (
                  <span className={`tabular-nums ${t.muted}`}>{booked.months} Monate gebucht</span>
                )}
                <button className={t.iconBtn} onClick={e => { e.stopPropagation(); remove(r); }} title="Löschen"><Trash2 size={12} /></button>
              </div>
              {open && (
                <div className={`border-t ${t.border} p-4 grid grid-cols-3 gap-4`}>
                  <Field label="Name" isDark={isDark}>
                    <input value={r.name} onChange={e => update(r.id, { name: e.target.value })} placeholder="Abschreibung Auto" className={`${t.input} w-full`} />
                  </Field>
                  <Field label="Kategorie" isDark={isDark}>
                    <select value={r.categoryId} onChange={e => update(r.id, { categoryId: e.target.value })} className={`${t.input} w-full`}>
                      <option value="">–</option>
                      <optgroup label="Ausgaben">{categories.filter(c => c.kind === 'expense' && (!c.archived || c.id === r.categoryId)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                      <optgroup label="Einnahmen">{categories.filter(c => c.kind === 'income' && (!c.archived || c.id === r.categoryId)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                    </select>
                  </Field>
                  <Field label="Betrag CHF pro Monat" isDark={isDark}>
                    <AmountInput value={r.amount} onCommit={v => update(r.id, { amount: v })} cls={`${t.input} w-full text-right tabular-nums`} />
                  </Field>
                  <Field label="Text der Buchungen" isDark={isDark}>
                    <input value={r.text} onChange={e => update(r.id, { text: e.target.value })} placeholder={r.name || 'wie Name'} className={`${t.input} w-full`} />
                  </Field>
                  <Field label="Von" isDark={isDark}>
                    <input type="month" value={r.from} onChange={e => e.target.value && update(r.id, { from: e.target.value })} className={`${t.input} w-full`} />
                  </Field>
                  <Field label={r.total ? `Bis (aus Gesamtbetrag: ${n} Monate)` : 'Bis (leer = offen)'} isDark={isDark}>
                    <input type="month" value={r.to ?? ''} onChange={e => update(r.id, { to: e.target.value || undefined })} className={`${t.input} w-full`} disabled={!!r.total} />
                  </Field>
                  <Field label="Gesamtbetrag (Abschreibung, optional)" isDark={isDark}>
                    <AmountInput value={r.total ?? 0} onCommit={v => update(r.id, { total: v || undefined, ...(v ? { to: undefined } : {}) })} cls={`${t.input} w-full text-right tabular-nums`} placeholder="–" />
                  </Field>
                  <div className="col-span-2">
                    <div className={`text-[10px] uppercase tracking-wider mb-1 ${t.muted}`}>Ausgelassene Monate</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(r.skip ?? []).length === 0 && <span className={`text-xs ${t.faint}`}>keine</span>}
                      {(r.skip ?? []).map(ym => (
                        <button key={ym} onClick={() => unskip(r, ym)} title="wieder buchen"
                          className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${t.border} ${t.rowHover}`}>
                          {fmtYm(ym)} <X size={10} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AmountInput({ value, onCommit, cls, placeholder }: { value: number; onCommit: (v: number) => void; cls: string; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text == null) return;
    const n = parseAmount(text);
    onCommit(isNaN(n) ? 0 : n);
    setText(null);
  };
  return (
    <input value={text ?? (value ? String(value) : '')} onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} inputMode="decimal" placeholder={placeholder ?? '0.00'} className={cls} />
  );
}
