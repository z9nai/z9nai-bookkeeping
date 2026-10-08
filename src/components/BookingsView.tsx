import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Copy, Trash2, X, Search } from 'lucide-react';
import { useStore } from '../store';
import { Booking, Category, EMPTY_YEAR } from '../types';
import { colorClasses } from '../colors';
import { MONTH_NAMES, MONTH_SHORT, fmtAmount, fmtChf, fmtDate, genId, monthOf, pad, parseAmount, todayIso } from '../budget';
import { Field, Signed, themeClasses } from '../ui';

interface Props {
  year: number; setYear: (y: number) => void;
  month: number; setMonth: (m: number) => void;
  catFilter: string; setCatFilter: (id: string) => void;
}

interface Draft { booking: Booking; isNew: boolean }

const fmtDay = (iso: string) => {
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(iso + 'T00:00:00').getDay()];
  return `${wd} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
};

export default function BookingsView({ year, setYear, month, setMonth, catFilter, setCatFilter }: Props) {
  const { isDark, categories, years, addBooking, updateBooking, deleteBooking, lastCategoryId, dirHandle } = useStore();
  const t = themeClasses(isDark);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const data = years[year] ?? EMPTY_YEAR(year);
  const byId = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const kindOf = (b: Booking) => byId.get(b.categoryId)?.kind ?? 'expense';

  const monthList = useMemo(() => data.bookings.filter(b => monthOf(b.date) === month), [data, month]);
  const q = search.trim().toLowerCase();
  const shown = monthList.filter(b => (!catFilter || b.categoryId === catFilter)
    && (!q || b.text.toLowerCase().includes(q) || (byId.get(b.categoryId)?.name.toLowerCase().includes(q) ?? false) || String(b.amount).includes(q)));
  const sum = (list: Booking[], kind: 'expense' | 'income') => list.filter(b => kindOf(b) === kind).reduce((a, b) => a + b.amount, 0);
  const mExp = sum(monthList, 'expense'), mInc = sum(monthList, 'income');
  const shownTotal = shown.reduce((a, b) => a + (kindOf(b) === 'income' ? b.amount : -b.amount), 0);
  const monthTotals = Array.from({ length: 12 }, (_, i) => {
    const l = data.bookings.filter(b => monthOf(b.date) === i + 1);
    return sum(l, 'income') - sum(l, 'expense');
  });

  const active = (kind: 'expense' | 'income') => categories.filter(c => c.kind === kind && !c.archived);
  const defaultCategory = () => (catFilter && byId.get(catFilter)) ? catFilter
    : (lastCategoryId && byId.get(lastCategoryId) && !byId.get(lastCategoryId)!.archived) ? lastCategoryId
    : (active('expense')[0]?.id ?? categories[0]?.id ?? '');

  const newBooking = () => {
    const today = todayIso();
    const date = today.startsWith(`${year}-${pad(month)}`) ? today
      : monthList.length ? monthList[monthList.length - 1].date : `${year}-${pad(month)}-01`;
    setError(null);
    setDraft({ booking: { id: genId(), date, categoryId: defaultCategory(), amount: 0, text: '' }, isNew: true });
  };
  const edit = (b: Booking) => { setError(null); setDraft({ booking: { ...b }, isNew: false }); };
  const duplicate = (b: Booking) => { setError(null); setDraft({ booking: { ...b, id: genId() }, isNew: true }); };
  const cancel = () => { setDraft(null); setError(null); };

  const save = (b: Booking, andNew: boolean) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) { setError('Datum fehlt.'); return false; }
    if (!byId.get(b.categoryId)) { setError('Kategorie wählen.'); return false; }
    if (!isFinite(b.amount) || b.amount === 0) { setError('Betrag fehlt.'); return false; }
    if (draft?.isNew) addBooking(b); else updateBooking(b);
    const y = Number(b.date.slice(0, 4)), m = monthOf(b.date);
    if (y !== year) setYear(y);
    if (m !== month) setMonth(m);
    setError(null);
    if (andNew) setDraft({ booking: { id: genId(), date: b.date, categoryId: b.categoryId, amount: 0, text: '' }, isNew: true });
    else setDraft(null);
    return true;
  };

  const remove = (b: Booking) => {
    if (!confirm(`Buchung vom ${fmtDate(b.date)} (${byId.get(b.categoryId)?.name ?? ''}, CHF ${fmtAmount(b.amount)}) löschen?`)) return;
    deleteBooking(b.id);
    setDraft(null);
  };

  const changeYear = (y: number) => setYear(y);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h2 className={t.title}>Buchungen</h2>
            <div className="flex items-center gap-1 ml-2">
              <button className={t.iconBtn} onClick={() => changeYear(year - 1)}><ChevronLeft size={14} /></button>
              <span className="text-xs font-semibold w-10 text-center">{year}</span>
              <button className={t.iconBtn} onClick={() => changeYear(year + 1)}><ChevronRight size={14} /></button>
            </div>
            <button className={`${t.btnPrimary} ml-auto`} onClick={newBooking} disabled={categories.length === 0}>
              <Plus size={12} /> Neue Buchung
            </button>
          </div>

          {/* Months */}
          <div className={`${t.segBox} mb-4 w-full`}>
            {MONTH_SHORT.map((m, i) => (
              <button key={m} onClick={() => setMonth(i + 1)} className={`${t.seg(month === i + 1)} flex-1 flex flex-col items-center gap-0.5 py-1.5`}
                title={`${MONTH_NAMES[i]} ${year}`}>
                <span>{m}</span>
                <span className={`text-[10px] tabular-nums ${month === i + 1 ? '' : 'opacity-70'}`}>
                  <Signed value={monthTotals[i]} fmt={fmtChf} isDark={isDark} zero="·" />
                </span>
              </button>
            ))}
          </div>

          {/* Month summary */}
          <div className={`flex items-center gap-5 text-[11px] mb-4 ${t.soft}`}>
            <span className="font-semibold">{MONTH_NAMES[month - 1]} {year}</span>
            <span><span className={t.muted}>Ausgaben</span> {fmtChf(mExp)}</span>
            <span><span className={t.muted}>Einnahmen</span> {fmtChf(mInc)}</span>
            <span><span className={t.muted}>Überschuss</span> <Signed value={mInc - mExp} fmt={fmtChf} isDark={isDark} zero="0" /></span>
            {!dirHandle && <span className={`ml-auto ${t.muted}`}>Kein Datenverzeichnis — Änderungen gehen beim Neuladen verloren.</span>}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 mb-3">
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={`${t.input} max-w-[260px]`}>
              <option value="">Alle Kategorien</option>
              <optgroup label="Ausgaben">{categories.filter(c => c.kind === 'expense').map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archiviert)' : ''}</option>)}</optgroup>
              <optgroup label="Einnahmen">{categories.filter(c => c.kind === 'income').map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archiviert)' : ''}</option>)}</optgroup>
            </select>
            <div className="relative">
              <Search size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${t.muted}`} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className={`${t.input} pl-7 w-48`} />
            </div>
            {(catFilter || search) && (
              <button className={t.iconBtn} onClick={() => { setCatFilter(''); setSearch(''); }} title="Filter zurücksetzen"><X size={13} /></button>
            )}
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className={`text-[10px] uppercase tracking-wider ${t.muted}`}>
                <th className="text-left font-normal py-1.5 px-2 w-24">Datum</th>
                <th className="text-left font-normal px-2 w-56">Kategorie</th>
                <th className="text-left font-normal px-2">Text</th>
                <th className="text-right font-normal px-2 w-28">Betrag</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={5} className={`px-2 py-6 text-center ${t.muted}`}>Keine Buchungen{catFilter || q ? ' für diesen Filter' : ''} im {MONTH_NAMES[month - 1]} {year}.</td></tr>
              )}
              {shown.map(b => {
                const c = byId.get(b.categoryId);
                const isSel = draft?.booking.id === b.id;
                return (
                  <tr key={b.id} onClick={() => edit(b)}
                    className={`border-t ${t.border} cursor-pointer group ${isSel ? t.selRow : t.rowHover}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{fmtDay(b.date)}</td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorClasses(c?.color ?? 'slate').dot}`} />
                        <span className="truncate">{c?.name ?? <span className="text-red-400">{b.categoryId}</span>}</span>
                      </span>
                    </td>
                    <td className={`px-2 py-1.5 ${b.text ? '' : t.faint}`}>{b.text || '–'}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${c?.kind === 'income' ? t.pos : ''} ${b.amount < 0 ? t.neg : ''}`}>{fmtAmount(b.amount)}</td>
                    <td className="px-1 py-1 text-right whitespace-nowrap">
                      <button className={`${t.iconBtn} opacity-0 group-hover:opacity-100`} title="Duplizieren"
                        onClick={e => { e.stopPropagation(); duplicate(b); }}><Copy size={12} /></button>
                      <button className={`${t.iconBtn} opacity-0 group-hover:opacity-100`} title="Löschen"
                        onClick={e => { e.stopPropagation(); remove(b); }}><Trash2 size={12} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr className={`border-t ${t.border} font-semibold`}>
                  <td className="px-2 py-1.5" colSpan={3}>{shown.length} Buchungen</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {catFilter ? fmtAmount(shown.reduce((a, b) => a + b.amount, 0)) : <Signed value={shownTotal} fmt={fmtAmount} isDark={isDark} zero="0" />}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {draft && (
        <BookingPanel key={draft.booking.id} draft={draft} categories={categories} error={error}
          onSave={save} onCancel={cancel} onDelete={() => remove(draft.booking)} isDark={isDark} />
      )}
    </div>
  );
}

function BookingPanel({ draft, categories, error, onSave, onCancel, onDelete, isDark }: {
  draft: Draft; categories: Category[]; error: string | null;
  onSave: (b: Booking, andNew: boolean) => boolean; onCancel: () => void; onDelete: () => void; isDark: boolean;
}) {
  const t = themeClasses(isDark);
  const [date, setDate] = useState(draft.booking.date);
  const [categoryId, setCategoryId] = useState(draft.booking.categoryId);
  const [amount, setAmount] = useState(draft.booking.amount ? String(draft.booking.amount) : '');
  const [text, setText] = useState(draft.booking.text);
  const amountRef = useRef<HTMLInputElement>(null);
  const cat = categories.find(c => c.id === categoryId);

  useEffect(() => { amountRef.current?.focus(); }, []);

  const build = (): Booking => ({ ...draft.booking, date, categoryId, amount: parseAmount(amount), text: text.trim() });
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); onSave(build(), e.shiftKey); }
    if (e.key === 'Escape') onCancel();
  };
  const sel = (kind: 'expense' | 'income') => categories.filter(c => c.kind === kind && (!c.archived || c.id === categoryId));

  return (
    <div className={`w-80 flex-shrink-0 border-l ${t.border} ${t.panel} p-5 overflow-y-auto`} onKeyDown={onKey}>
      <div className="flex items-center justify-between mb-5">
        <span className={t.title}>{draft.isNew ? 'Neue Buchung' : 'Buchung'}</span>
        <button className={t.iconBtn} onClick={onCancel}><X size={14} /></button>
      </div>
      <div className="space-y-4">
        <Field label="Datum" isDark={isDark}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${t.input} w-full`} />
        </Field>
        <Field label="Kategorie" isDark={isDark}>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={`${t.input} w-full`}>
            <optgroup label="Ausgaben">{sel('expense').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            <optgroup label="Einnahmen">{sel('income').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
          </select>
        </Field>
        <Field label={`Betrag CHF${cat?.kind === 'income' ? ' (Einnahme)' : ''}`} isDark={isDark}>
          <input ref={amountRef} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00"
            className={`${t.input} w-full text-right tabular-nums`} />
        </Field>
        <Field label="Text" isDark={isDark}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Zweck, Beleg, …" className={`${t.input} w-full`} />
        </Field>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        <div className="flex flex-wrap gap-2 pt-2">
          <button className={t.btnPrimary} onClick={() => onSave(build(), false)}>Speichern</button>
          <button className={t.btn} onClick={() => onSave(build(), true)} title="Speichern und gleich die nächste Buchung erfassen (Shift+Enter)">Speichern + neue</button>
          {!draft.isNew && (
            <button className={`${t.btn} ml-auto`} onClick={onDelete} title="Löschen"><Trash2 size={12} /></button>
          )}
        </div>
        <p className={`text-[10px] leading-relaxed ${t.muted}`}>
          Enter speichert, Shift+Enter speichert und öffnet die nächste Buchung, Esc bricht ab.
          Rückerstattungen als negativer Betrag erfassen.
        </p>
      </div>
    </div>
  );
}
