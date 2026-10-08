import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { Category, CategoryKind } from '../types';
import { COLOR_KEYS, colorClasses, nextColor } from '../colors';
import { themeClasses } from '../ui';

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kategorie';

export default function CategoriesView() {
  const { isDark, categories, setCategories, years } = useStore();
  const t = themeClasses(isDark);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<CategoryKind>('expense');
  const [colorFor, setColorFor] = useState<string | null>(null);

  // Usage counts over all years (a used category can only be archived, not deleted)
  const usage = useMemo(() => {
    const n: Record<string, number> = {};
    for (const y of Object.values(years)) {
      for (const b of y.bookings) n[b.categoryId] = (n[b.categoryId] ?? 0) + 1;
      for (const [id, v] of Object.entries(y.budget)) if (v) n[id] = (n[id] ?? 0) + 0; // keep key
    }
    return n;
  }, [years]);

  const update = (id: string, patch: Partial<Category>) => setCategories(categories.map(c => c.id === id ? { ...c, ...patch } : c));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= categories.length) return;
    const next = [...categories];
    [next[i], next[j]] = [next[j], next[i]];
    setCategories(next);
  };
  const remove = (c: Category) => {
    if (usage[c.id]) return;
    if (!confirm(`Kategorie «${c.name}» löschen?`)) return;
    setCategories(categories.filter(x => x.id !== c.id));
  };
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    let id = slug(name);
    while (categories.some(c => c.id === id)) id += '-2';
    setCategories([...categories, { id, name, kind: newKind, color: nextColor(categories.map(c => c.color)) }]);
    setNewName('');
  };

  const Row = ({ c, i }: { c: Category; i: number }) => (
    <div className={`border-t ${t.border} ${t.rowHover}`}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button onClick={() => setColorFor(colorFor === c.id ? null : c.id)} title="Farbe wählen"
          className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${colorClasses(c.color).dot}`} />
        </button>
        <input value={c.name} onChange={e => update(c.id, { name: e.target.value })} className={`${t.input} flex-1 min-w-0 ${c.archived ? t.muted : ''}`} />
        <div className={t.segBox}>
          <button className={t.seg(c.kind === 'expense')} onClick={() => update(c.id, { kind: 'expense' })}>Ausgabe</button>
          <button className={t.seg(c.kind === 'income')} onClick={() => update(c.id, { kind: 'income' })}>Einnahme</button>
        </div>
        <label className={`flex items-center gap-1.5 text-[11px] cursor-pointer whitespace-nowrap ${t.soft}`} title="Archivierte Kategorien werden bei neuen Buchungen nicht mehr angeboten">
          <input type="checkbox" checked={!!c.archived} onChange={e => update(c.id, { archived: e.target.checked || undefined })} className="accent-blue-500" />
          archiviert
        </label>
        <span className={`text-[11px] w-20 text-right tabular-nums ${t.muted}`}>{usage[c.id] ? `${usage[c.id]} Buch.` : ''}</span>
        <button className={t.iconBtn} onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={12} /></button>
        <button className={t.iconBtn} onClick={() => move(i, 1)} disabled={i === categories.length - 1}><ArrowDown size={12} /></button>
        <button className={t.iconBtn} onClick={() => remove(c)} disabled={!!usage[c.id]}
          title={usage[c.id] ? 'Wird in Buchungen verwendet — stattdessen archivieren' : 'Löschen'}><Trash2 size={12} /></button>
      </div>
      {colorFor === c.id && (
        <div className="flex flex-wrap gap-1.5 px-9 pb-2">
          {COLOR_KEYS.map(k => (
            <button key={k} title={colorClasses(k).label} onClick={() => { update(c.id, { color: k }); setColorFor(null); }}
              className={`w-5 h-5 rounded-full flex items-center justify-center border ${c.color === k ? (isDark ? 'border-white' : 'border-black') : 'border-transparent'}`}>
              <span className={`w-3 h-3 rounded-full ${colorClasses(k).dot}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className={`${t.title} mb-5`}>Kategorien</h2>
      <p className={`text-[11px] mb-4 leading-relaxed ${t.muted}`}>
        Reihenfolge wie in der Jahresübersicht. Der Name darf jederzeit geändert werden; die Buchungen bleiben zugeordnet.
      </p>
      {(['expense', 'income'] as const).map(kind => (
        <div key={kind} className="mb-6">
          <div className={`${t.section} mb-1`}>{kind === 'expense' ? 'Ausgaben' : 'Einnahmen'}</div>
          {categories.map((c, i) => c.kind === kind ? <Row key={c.id} c={c} i={i} /> : null)}
          {!categories.some(c => c.kind === kind) && <p className={`text-xs py-2 ${t.faint}`}>Keine</p>}
        </div>
      ))}
      <div className={`flex items-center gap-2 pt-4 border-t ${t.border}`}>
        <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="Neue Kategorie" className={`${t.input} flex-1`} />
        <div className={t.segBox}>
          <button className={t.seg(newKind === 'expense')} onClick={() => setNewKind('expense')}>Ausgabe</button>
          <button className={t.seg(newKind === 'income')} onClick={() => setNewKind('income')}>Einnahme</button>
        </div>
        <button className={t.btnPrimary} onClick={add} disabled={!newName.trim()}><Plus size={12} /> Hinzufügen</button>
      </div>
    </div>
  );
}
