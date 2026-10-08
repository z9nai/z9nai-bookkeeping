import React, { useMemo, useRef, useState } from 'react';
import { FileUp, Check, AlertTriangle } from 'lucide-react';
import { useStore } from '../store';
import { readXlsx } from '../xlsxRead.ts';
import { Analysis, Mapping, analyzeWorkbook, buildImport, defaultMapping } from '../sheetImport.ts';
import { fmtChf } from '../budget';
import { themeClasses } from '../ui';

export default function ImportView({ onDone }: { onDone: (year: number) => void }) {
  const { isDark, categories, years, importData, dirHandle } = useStore();
  const t = themeClasses(isDark);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ years: number; bookings: number; newCategories: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);

  const load = async (file: File) => {
    setError(null); setResult(null); setAnalysis(null); setBusy(true);
    try {
      const sheets = await readXlsx(await file.arrayBuffer());
      const a = analyzeWorkbook(sheets);
      if (a.years.length === 0) throw new Error('Keine Jahres-Tabs (2006 … 2026) mit dem bekannten Aufbau gefunden.');
      setFileName(file.name);
      setAnalysis(a);
      setMapping(defaultMapping(a.headers));
      setSelected(new Set(a.years.filter(y => !(years[y.year]?.bookings.length)).map(y => y.year)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const targets = useMemo(() => {
    const names = new Set<string>(categories.map(c => c.name));
    for (const h of analysis?.headers ?? []) names.add(h.name);
    return [...names];
  }, [analysis, categories]);

  const toggleYear = (y: number) => setSelected(s => { const n = new Set(s); if (n.has(y)) n.delete(y); else n.add(y); return n; });

  const run = async () => {
    if (!analysis) return;
    const sel = [...selected];
    const replacing = sel.filter(y => years[y]?.bookings.length);
    if (replacing.length && !confirm(`Die Jahre ${replacing.join(', ')} haben bereits Buchungen. Diese werden durch den Import ersetzt. Fortfahren?`)) return;
    setBusy(true);
    try {
      const r = buildImport(analysis, mapping, categories, sel);
      await importData(r.categories, r.years);
      setResult({ years: r.years.length, bookings: r.bookings, newCategories: r.newCategories });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => analysis ? buildImport(analysis, mapping, categories, [...selected]) : null, [analysis, mapping, categories, selected]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className={`${t.title} mb-5`}>Import</h2>
      <p className={`text-[11px] leading-relaxed mb-4 ${t.muted}`}>
        Importiert das bisherige Google Sheet «Family Budget»: pro Jahres-Tab werden die Kategorien (Spalten), das Budget «Pro Monat»
        und jede Monatszelle übernommen. Formeln wie <code>=400+40+98</code> ergeben drei einzelne Buchungen (datiert auf den 1. des Monats).
        <br />Im Google Sheet: <b>Datei → Herunterladen → Microsoft Excel (.xlsx)</b>, dann die Datei hier ablegen.
        Alternativ im Terminal: <code>npm run import-xlsx -- "Family Budget.xlsx" &lt;Datenverzeichnis&gt;</code>.
      </p>
      {!dirHandle && (
        <p className={`text-[11px] mb-4 ${isDark ? 'text-amber-300/80' : 'text-amber-700'}`}>
          Kein Datenverzeichnis gewählt — der Import bleibt nur im Speicher und geht beim Neuladen verloren.
        </p>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}
        onClick={() => fileRef.current?.click()}
        className={`rounded-xl border border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragging ? (isDark ? 'border-blue-400 bg-blue-500/10' : 'border-blue-500 bg-blue-50')
                   : (isDark ? 'border-white/15 hover:border-white/30' : 'border-black/15 hover:border-black/30')}`}>
        <FileUp size={20} className={`mx-auto mb-2 ${t.muted}`} />
        <div className="text-xs">{fileName || 'Excel-Datei (.xlsx) hierhin ziehen oder klicken'}</div>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
      </div>

      {busy && <p className={`text-xs mt-4 ${t.muted}`}>Verarbeite…</p>}
      {error && <p className="text-xs mt-4 text-red-400">{error}</p>}

      {result && (
        <div className={`mt-6 rounded-xl border p-4 text-xs space-y-1 ${isDark ? 'border-emerald-500/30 text-emerald-300' : 'border-emerald-500/40 text-emerald-700'}`}>
          <div className="flex items-center gap-2 font-semibold"><Check size={14} /> Import abgeschlossen</div>
          <div>{result.years} Jahre, {result.bookings} Buchungen{result.newCategories.length ? `, ${result.newCategories.length} neue Kategorien` : ''}.</div>
          <button className={`${t.btn} mt-2`} onClick={() => onDone(Math.max(...[...selected]))}>Zur Jahresübersicht</button>
        </div>
      )}

      {analysis && !result && (
        <div className="mt-6 space-y-6">
          {analysis.warnings.length > 0 && (
            <div className={`text-[11px] space-y-0.5 ${isDark ? 'text-amber-300/80' : 'text-amber-700'}`}>
              {analysis.warnings.map((w, i) => <div key={i} className="flex gap-2"><AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />{w}</div>)}
            </div>
          )}

          <div>
            <div className={`${t.section} mb-2`}>Jahre</div>
            <table className="text-xs">
              <thead>
                <tr className={`text-[10px] uppercase tracking-wider ${t.muted}`}>
                  <th className="w-8" />
                  <th className="text-left font-normal px-2 py-1">Jahr</th>
                  <th className="text-right font-normal px-3">Buchungen</th>
                  <th className="text-right font-normal px-3">Ausgaben</th>
                  <th className="text-right font-normal px-3">Einnahmen</th>
                  <th className="text-left font-normal px-3">Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {[...analysis.years].sort((a, b) => a.year - b.year).map(y => {
                  const existing = years[y.year]?.bookings.length ?? 0;
                  const on = selected.has(y.year);
                  return (
                    <tr key={y.year} className={`border-t ${t.border} ${t.rowHover} cursor-pointer ${on ? '' : t.muted}`} onClick={() => toggleYear(y.year)}>
                      <td className="px-2 py-1"><input type="checkbox" checked={on} onChange={() => toggleYear(y.year)} onClick={e => e.stopPropagation()} className="accent-blue-500" /></td>
                      <td className="px-2 py-1 font-semibold">{y.year}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{y.bookingCount}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{y.cachedTotals.expense != null ? fmtChf(y.cachedTotals.expense) : '–'}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{y.cachedTotals.income != null ? fmtChf(y.cachedTotals.income) : '–'}</td>
                      <td className={`px-3 py-1 ${isDark ? 'text-amber-300/80' : 'text-amber-700'}`}>
                        {existing ? `${existing} vorhandene Buchungen werden ersetzt` : ''}
                        {y.warnings.length ? `${existing ? ' · ' : ''}${y.warnings.length} Hinweis${y.warnings.length > 1 ? 'e' : ''}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {analysis.years.some(y => y.warnings.length > 0) && (
              <details className={`text-[11px] mt-2 ${t.muted}`}>
                <summary className="cursor-pointer">Hinweise zu einzelnen Zellen</summary>
                <ul className="mt-1 space-y-0.5">
                  {analysis.years.flatMap(y => y.warnings.map((w, i) => <li key={`${y.year}-${i}`}>{y.year}: {w}</li>))}
                </ul>
              </details>
            )}
          </div>

          <div>
            <div className={`${t.section} mb-2`}>Kategorien (Spaltennamen → Kategorie)</div>
            <p className={`text-[11px] mb-2 ${t.muted}`}>
              Umbenannte Spalten werden der neuesten Bezeichnung zugeordnet. Die Zuordnung kann hier angepasst werden.
            </p>
            <table className="text-xs">
              <tbody>
                {analysis.headers.map(h => (
                  <tr key={`${h.kind}-${h.name}`} className={`border-t ${t.border}`}>
                    <td className={`px-2 py-1 w-16 ${t.muted}`}>{h.kind === 'income' ? 'Einnahme' : 'Ausgabe'}</td>
                    <td className="px-2 py-1">{h.name}</td>
                    <td className={`px-2 py-1 tabular-nums ${t.muted}`}>{h.years.length} J.</td>
                    <td className={`px-2 py-1 ${t.muted}`}>→</td>
                    <td className="px-2 py-1">
                      <select value={mapping[h.name] ?? h.name} onChange={e => setMapping({ ...mapping, [h.name]: e.target.value })} className={`${t.input} min-w-[260px]`}>
                        {targets.map(n => <option key={n} value={n}>{n}{categories.some(c => c.name === n) ? ' (vorhanden)' : ''}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4">
            <button className={t.btnPrimary} onClick={run} disabled={busy || selected.size === 0}>
              <FileUp size={12} /> {selected.size} Jahre importieren
            </button>
            {preview && (
              <span className={`text-[11px] ${t.muted}`}>
                {preview.bookings} Buchungen · {preview.categories.length} Kategorien ({preview.newCategories.length} neu)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
