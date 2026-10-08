import React, { useState } from 'react';
import { Sun, Moon, FolderOpen, CalendarRange, List, BarChart2, PieChart, Scale, Repeat, Tags, Settings } from 'lucide-react';
import { useStore } from './store';
import YearView from './components/YearView';
import BookingsView from './components/BookingsView';
import OverviewView from './components/OverviewView';
import CategoriesView from './components/CategoriesView';
import AdminView from './components/AdminView';
import AnalysisView from './components/AnalysisView';
import ReconcileView from './components/ReconcileView';
import RecurringView from './components/RecurringView';

type View = 'year' | 'bookings' | 'overview' | 'analysis' | 'reconcile' | 'recurring' | 'categories' | 'admin';

export default function App() {
  const { isDark, toggleTheme, dirHandle, savedHandleAvailable, pickDirectory, reconnectDirectory, ioError } = useStore();
  const now = new Date();
  const [view, setView] = useState<View>('year');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [catFilter, setCatFilter] = useState('');

  const openBookings = (y: number, m: number, categoryId: string) => {
    setYear(y); setMonth(m); setCatFilter(categoryId); setView('bookings');
  };
  const openYear = (y: number) => { setYear(y); setView('year'); };

  const bg = isDark ? 'bg-[#0e0f11]' : 'bg-[#f5f4f0]';
  const border = isDark ? 'border-white/8' : 'border-black/8';
  const topBg = isDark ? 'bg-[#0c0d0f]' : 'bg-[#eae9e5]';
  const textBase = isDark ? 'text-white' : 'text-black';

  const navBtn = (v: View, Icon: React.ElementType, label: string) => (
    <button
      onClick={() => setView(v)}
      title={label}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors ${
        view === v
          ? isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-black'
          : isDark ? 'text-white/35 hover:text-white/70' : 'text-black/35 hover:text-black/70'
      }`}
    >
      <Icon size={13} />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );

  return (
    <div className={`flex flex-col h-screen ${bg} ${textBase}`}>
      <div className={`flex items-center gap-3 px-4 py-2 border-b ${border} ${topBg} flex-shrink-0`}>
        <a href="https://z9nai.ch" target="_blank" rel="noopener noreferrer" className="flex-shrink-0 mr-1 opacity-80 hover:opacity-100 transition-opacity">
          <img src="favicon.png" alt="Z9nAI" className="w-6 h-6" />
        </a>
        <span className={`text-xs font-bold tracking-widest mr-4 whitespace-nowrap ${isDark ? 'text-white/70' : 'text-black/70'}`}>
          Z9nAI Budget
        </span>
        {navBtn('year', CalendarRange, 'Jahr')}
        {navBtn('bookings', List, 'Buchungen')}
        {navBtn('overview', BarChart2, 'Übersicht')}
        {navBtn('analysis', PieChart, 'Analyse')}
        {navBtn('reconcile', Scale, 'Abgleich')}
        {navBtn('recurring', Repeat, 'Fixbuchungen')}
        {navBtn('categories', Tags, 'Kategorien')}

        <div className="ml-auto flex items-center gap-3">
          {navBtn('admin', Settings, 'Admin')}
          <button
            onClick={pickDirectory}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border whitespace-nowrap transition-colors ${
              dirHandle
                ? isDark ? 'border-white/15 text-white/50 hover:border-white/30' : 'border-black/15 text-black/50 hover:border-black/30'
                : isDark ? 'border-blue-500/40 text-blue-400 hover:border-blue-400' : 'border-blue-500/40 text-blue-600 hover:border-blue-500'
            }`}
            title={dirHandle ? 'Verzeichnis: geöffnet' : 'Datenverzeichnis wählen'}
          >
            <FolderOpen size={12} />
            {dirHandle ? dirHandle.name : 'Verzeichnis wählen'}
          </button>
          <button onClick={toggleTheme}
            className={`flex items-center gap-1 p-1.5 rounded transition-colors ${isDark ? 'text-white/35 hover:text-white/70' : 'text-black/35 hover:text-black/70'}`}>
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>

      {!dirHandle && (
        <div className={`px-4 py-2 text-[11px] flex items-center gap-2 border-b ${border} ${isDark ? 'bg-blue-950/30 text-blue-300/70 border-blue-500/20' : 'bg-blue-50 text-blue-700/70 border-blue-200'}`}>
          <FolderOpen size={12} />
          {savedHandleAvailable ? (
            <>
              Letztes Verzeichnis gefunden —
              <button onClick={reconnectDirectory} className="underline underline-offset-2 hover:opacity-80">Wieder verbinden</button>
              oder
              <button onClick={pickDirectory} className="underline underline-offset-2 hover:opacity-80">anderes wählen</button>
            </>
          ) : (
            <>
              Kein Datenverzeichnis gewählt — Daten werden nicht gespeichert.
              <button onClick={pickDirectory} className="underline underline-offset-2 hover:opacity-80">Verzeichnis wählen</button>
            </>
          )}
        </div>
      )}

      {ioError && (
        <div className={`px-4 py-2 text-[11px] border-b ${isDark ? 'bg-red-950/40 text-red-300 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {ioError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {view === 'year' ? (
          <div className="flex-1 overflow-auto">
            <YearView year={year} setYear={setYear} onOpenBookings={openBookings} />
          </div>
        ) : view === 'bookings' ? (
          <div className="flex-1 overflow-hidden">
            <BookingsView year={year} setYear={setYear} month={month} setMonth={setMonth} catFilter={catFilter} setCatFilter={setCatFilter} />
          </div>
        ) : view === 'overview' ? (
          <div className="flex-1 overflow-y-auto">
            <OverviewView onOpenYear={openYear} />
          </div>
        ) : view === 'analysis' ? (
          <div className="flex-1 overflow-y-auto">
            <AnalysisView />
          </div>
        ) : view === 'reconcile' ? (
          <div className="flex-1 overflow-y-auto">
            <ReconcileView year={year} setYear={setYear} />
          </div>
        ) : view === 'recurring' ? (
          <div className="flex-1 overflow-y-auto">
            <RecurringView />
          </div>
        ) : view === 'categories' ? (
          <div className="flex-1 overflow-y-auto">
            <CategoriesView />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <AdminView />
          </div>
        )}
      </div>
    </div>
  );
}
