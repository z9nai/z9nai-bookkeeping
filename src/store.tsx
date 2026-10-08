import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Booking, Category, EMPTY_SETTINGS, EMPTY_YEAR, Settings, YearData } from './types';
import { missingBookings, ymToday } from './recurring';
import { GitConfig, GitFile, commitFiles, loadGitConfig, saveGitConfig } from './git';
import { sortBookings, yearOf } from './budget';

export interface GitStatus {
  busy: boolean;
  pending: string[];
  lastCommitAt?: string;
  lastSha?: string;
  lastMessage?: string;
  error?: string;
}

interface StoreCtx {
  categories: Category[];
  years: Record<number, YearData>;
  settings: Settings;
  dirHandle: FileSystemDirectoryHandle | null;
  savedHandleAvailable: boolean;
  isDark: boolean;
  ioError: string | null;
  lastCategoryId: string | null;
  setCategories: (c: Category[]) => void;
  setBudget: (year: number, categoryId: string, amount: number) => void;
  copyBudget: (fromYear: number, toYear: number) => void;
  setMonths: (year: number, months: number | null) => void;
  setSettings: (fn: (s: Settings) => Settings) => void;
  setBalance: (ym: string, accountId: string, value: number | null) => void;
  skipRecurring: (recurringId: string, ym: string) => void;
  addBooking: (b: Booking) => void;
  updateBooking: (b: Booking) => void;
  deleteBooking: (id: string) => void;
  importData: (categories: Category[], years: YearData[]) => Promise<void>;
  pickDirectory: () => Promise<void>;
  reconnectDirectory: () => Promise<void>;
  toggleTheme: () => void;
  gitConfig: GitConfig;
  setGitConfig: (c: GitConfig) => void;
  gitStatus: GitStatus;
  commitNow: () => Promise<void>;
  commitAllData: () => Promise<void>;
}

const GIT_COMMIT_DELAY_MS = 10_000;
const DATA_FILE = /^(budget-\d{4}|categories|settings)\.json$/;
const YEAR_FILE = /^budget-(\d{4})\.json$/;
const CATEGORIES_FILE = 'categories.json';
const SETTINGS_FILE = 'settings.json';
const MAX_BACKUPS_PER_FILE = 30;
const BACKUP_INTERVAL_MS = 60 * 60 * 1000;
const THEME_KEY = 'z9nai-bookkeeping-theme';
const MRU_KEY = 'z9nai-bookkeeping-last-category';

const Ctx = createContext<StoreCtx>(null!);
export const useStore = () => useContext(Ctx);

const yearFile = (y: number) => `budget-${y}.json`;
const isNotFound = (e: unknown) => (e as { name?: string } | null)?.name === 'NotFoundError';

// ── Files ───────────────────────────────────────────────────────────────────
async function readText(dir: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

async function writeJson(dir: FileSystemDirectoryHandle, name: string, data: unknown) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

// Copy the current on-disk file to backup/<name>.<timestamp>.json, keep the newest copies
async function backupFile(dir: FileSystemDirectoryHandle, name: string) {
  const text = await readText(dir, name);
  if (!text?.trim()) return;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const prefix = name.replace(/\.json$/, '.');
  const backupDir = await dir.getDirectoryHandle('backup', { create: true });
  const w = await (await backupDir.getFileHandle(`${prefix}${stamp}.json`, { create: true })).createWritable();
  await w.write(text);
  await w.close();
  const existing: string[] = [];
  for await (const n of backupDir.keys()) if (n.startsWith(prefix)) existing.push(n);
  existing.sort();
  for (const old of existing.slice(0, Math.max(0, existing.length - MAX_BACKUPS_PER_FILE))) await backupDir.removeEntry(old);
}

function normalizeYear(raw: unknown, year: number): YearData {
  const o = (raw ?? {}) as Partial<YearData>;
  if (o.bookings != null && !Array.isArray(o.bookings)) throw new Error('Datei hat kein gültiges "bookings"-Feld');
  return {
    year, budget: o.budget ?? {}, bookings: sortBookings(o.bookings ?? []),
    ...(o.months != null ? { months: o.months } : {}),
    ...(o.balances ? { balances: o.balances } : {}),
  };
}

// ── IndexedDB: persist the directory handle ─────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('z9nai-bookkeeping', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistHandle(handle: FileSystemDirectoryHandle) {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'dir');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[budget] persistHandle failed:', e);
  }
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get('dir');
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

// ── Store ───────────────────────────────────────────────────────────────────
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(() => { try { return localStorage.getItem(THEME_KEY) !== 'light'; } catch { return true; } });
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [savedHandleAvailable, setSavedHandleAvailable] = useState(false);
  const savedHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [categories, setCategoriesState] = useState<Category[]>([]);
  const [years, setYearsState] = useState<Record<number, YearData>>({});
  const [settings, setSettingsState] = useState<Settings>(EMPTY_SETTINGS);
  const settingsRef = useRef<Settings>(EMPTY_SETTINGS);
  const [ioError, setIoError] = useState<string | null>(null);
  const [lastCategoryId, setLastCategoryId] = useState<string | null>(() => { try { return localStorage.getItem(MRU_KEY); } catch { return null; } });
  const dirRef = useRef<FileSystemDirectoryHandle | null>(null);
  const yearsRef = useRef<Record<number, YearData>>({});
  const categoriesRef = useRef<Category[]>([]);
  const unreadableRef = useRef<Set<string>>(new Set()); // files that exist but could not be read → never overwritten
  const dirtyRef = useRef<Set<string>>(new Set());
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBackupRef = useRef<Map<string, number>>(new Map());
  const ioQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = <T,>(fn: () => Promise<T>): Promise<T> => {
    const p = ioQueueRef.current.then(fn, fn);
    ioQueueRef.current = p.catch(() => {});
    return p;
  };

  const fail = (msg: string, e: unknown) => {
    console.error(`[budget] ${msg}`, e);
    setIoError(`${msg} — ${e instanceof Error ? e.message : String(e)}`);
  };

  // ── Git ──
  const [gitConfig, setGitConfigState] = useState<GitConfig>(loadGitConfig);
  const gitConfigRef = useRef(gitConfig);
  const [gitStatus, setGitStatus] = useState<GitStatus>({ busy: false, pending: [] });
  const gitPendingRef = useRef<Map<string, GitFile>>(new Map());
  const gitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gitBusyRef = useRef<Promise<void>>(Promise.resolve());

  const setGitConfig = useCallback((c: GitConfig) => {
    gitConfigRef.current = c;
    saveGitConfig(c);
    setGitConfigState(c);
  }, []);

  const runCommit = useCallback((files: Map<string, GitFile>, message: string, manual = false) => {
    gitBusyRef.current = gitBusyRef.current.then(async () => {
      const cfg = gitConfigRef.current;
      if ((!cfg.enabled && !manual) || files.size === 0) return;
      if (!cfg.token) { setGitStatus(s => ({ ...s, error: 'Kein Token hinterlegt' })); return; }
      setGitStatus(s => ({ ...s, busy: true }));
      try {
        const sha = await commitFiles(cfg, Object.fromEntries(files), message);
        setGitStatus(s => ({
          ...s, busy: false, error: undefined, pending: [...gitPendingRef.current.keys()],
          ...(sha ? { lastSha: sha, lastCommitAt: new Date().toLocaleString('de-CH'), lastMessage: message } : {}),
        }));
      } catch (e) {
        for (const [name, content] of files) if (!gitPendingRef.current.has(name)) gitPendingRef.current.set(name, content);
        setGitStatus(s => ({
          ...s, busy: false, pending: [...gitPendingRef.current.keys()],
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    });
    return gitBusyRef.current;
  }, []);

  const commitNow = useCallback(async () => {
    if (gitTimerRef.current) { clearTimeout(gitTimerRef.current); gitTimerRef.current = null; }
    const files = new Map(gitPendingRef.current);
    gitPendingRef.current.clear();
    if (files.size === 0) return;
    await runCommit(files, `Daten aktualisiert: ${[...files.keys()].sort().join(', ')}`);
  }, [runCommit]);

  const queueGit = (name: string, content: GitFile) => {
    if (!gitConfigRef.current.enabled) return;
    gitPendingRef.current.set(name, content);
    setGitStatus(s => ({ ...s, pending: [...gitPendingRef.current.keys()] }));
    if (gitTimerRef.current) clearTimeout(gitTimerRef.current);
    gitTimerRef.current = setTimeout(commitNow, GIT_COMMIT_DELAY_MS);
  };

  const writeData = async (dir: FileSystemDirectoryHandle, name: string, data: unknown) => {
    await writeJson(dir, name, data);
    queueGit(name, JSON.stringify(data, null, 2));
  };

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') commitNow(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [commitNow]);

  // ── Writing ──
  const backupIfDue = async (dir: FileSystemDirectoryHandle, name: string) => {
    const last = lastBackupRef.current.get(name) ?? 0;
    if (Date.now() - last < BACKUP_INTERVAL_MS) return;
    await backupFile(dir, name);
    lastBackupRef.current.set(name, Date.now());
  };

  const flushWrites = useCallback((): Promise<void> => {
    if (writeTimerRef.current) { clearTimeout(writeTimerRef.current); writeTimerRef.current = null; }
    const dir = dirRef.current;
    const names = [...dirtyRef.current];
    dirtyRef.current.clear();
    if (!dir || names.length === 0) return Promise.resolve();
    return enqueue(async () => {
      for (const name of names) {
        if (unreadableRef.current.has(name)) {
          setIoError(`${name} konnte nicht gelesen werden — wird nicht überschrieben.`);
          continue;
        }
        const m = name.match(YEAR_FILE);
        const data = m ? yearsRef.current[Number(m[1])] : name === SETTINGS_FILE ? settingsRef.current : categoriesRef.current;
        if (!data) continue;
        try {
          await backupIfDue(dir, name);
          await writeData(dir, name, data);
        } catch (e) {
          dirtyRef.current.add(name);
          fail(`Speichern von ${name} fehlgeschlagen`, e);
        }
      }
    });
  }, []);

  const markDirty = (name: string) => {
    dirtyRef.current.add(name);
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(flushWrites, 400);
  };

  useEffect(() => {
    const onUnload = () => { flushWrites(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [flushWrites]);

  // ── State mutations (work in memory; persisted when a directory is open) ──
  const publishYears = () => setYearsState({ ...yearsRef.current });

  const mutateYear = (year: number, fn: (y: YearData) => YearData) => {
    const cur = yearsRef.current[year] ?? EMPTY_YEAR(year);
    const next = fn(cur);
    yearsRef.current = { ...yearsRef.current, [year]: { ...next, bookings: sortBookings(next.bookings) } };
    publishYears();
    markDirty(yearFile(year));
  };

  // Insert the fixed bookings (Fixbuchungen) that are due up to the current month
  const syncRecurring = () => {
    const missing = missingBookings(settingsRef.current.recurring, yearsRef.current, ymToday());
    if (missing.length === 0) return;
    const byYear = new Map<number, Booking[]>();
    for (const b of missing) byYear.set(yearOf(b.date), [...(byYear.get(yearOf(b.date)) ?? []), b]);
    for (const [year, list] of byYear) mutateYear(year, y => ({ ...y, bookings: [...y.bookings, ...list] }));
  };

  const setSettings = useCallback((fn: (s: Settings) => Settings) => {
    const next = fn(settingsRef.current);
    settingsRef.current = next;
    setSettingsState(next);
    markDirty(SETTINGS_FILE);
    syncRecurring();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setBalance = useCallback((ym: string, accountId: string, value: number | null) => {
    mutateYear(Number(ym.slice(0, 4)), y => {
      const month = { ...(y.balances?.[ym] ?? {}) };
      if (value == null || isNaN(value)) delete month[accountId]; else month[accountId] = value;
      const balances = { ...(y.balances ?? {}) };
      if (Object.keys(month).length) balances[ym] = month; else delete balances[ym];
      const { balances: _, ...rest } = y;
      return Object.keys(balances).length ? { ...rest, balances } : rest;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Leave one month of a fixed booking out: remember it and remove the generated booking
  const skipRecurring = useCallback((recurringId: string, ym: string) => {
    const id = `rec-${recurringId}-${ym}`;
    mutateYear(Number(ym.slice(0, 4)), y => ({ ...y, bookings: y.bookings.filter(b => b.id !== id) }));
    const next: Settings = {
      ...settingsRef.current,
      recurring: settingsRef.current.recurring.map(r => r.id === recurringId
        ? { ...r, skip: [...new Set([...(r.skip ?? []), ym])].sort() } : r),
    };
    settingsRef.current = next;
    setSettingsState(next);
    markDirty(SETTINGS_FILE);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setCategories = useCallback((c: Category[]) => {
    categoriesRef.current = c;
    setCategoriesState(c);
    markDirty(CATEGORIES_FILE);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setBudget = useCallback((year: number, categoryId: string, amount: number) => {
    mutateYear(year, y => {
      const budget = { ...y.budget };
      if (amount) budget[categoryId] = amount; else delete budget[categoryId];
      return { ...y, budget };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copyBudget = useCallback((fromYear: number, toYear: number) => {
    const src = yearsRef.current[fromYear];
    if (!src) return;
    mutateYear(toYear, y => ({ ...y, budget: { ...src.budget } }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setMonths = useCallback((year: number, months: number | null) => {
    mutateYear(year, y => {
      const { months: _, ...rest } = y;
      return months == null ? rest : { ...rest, months };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const findYearOf = (id: string): number | null => {
    for (const y of Object.values(yearsRef.current)) if (y.bookings.some(b => b.id === id)) return y.year;
    return null;
  };

  const touchCategory = (id: string) => {
    setLastCategoryId(id);
    try { localStorage.setItem(MRU_KEY, id); } catch { /* ignore */ }
  };

  const addBooking = useCallback((b: Booking) => {
    mutateYear(yearOf(b.date), y => ({ ...y, bookings: [...y.bookings.filter(x => x.id !== b.id), b] }));
    touchCategory(b.categoryId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateBooking = useCallback((b: Booking) => {
    const newYear = yearOf(b.date);
    const oldYear = findYearOf(b.id);
    if (oldYear != null && oldYear !== newYear) mutateYear(oldYear, y => ({ ...y, bookings: y.bookings.filter(x => x.id !== b.id) }));
    mutateYear(newYear, y => ({ ...y, bookings: [...y.bookings.filter(x => x.id !== b.id), b] }));
    touchCategory(b.categoryId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteBooking = useCallback((id: string) => {
    const year = findYearOf(id);
    if (year != null) mutateYear(year, y => ({ ...y, bookings: y.bookings.filter(x => x.id !== id) }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Replaces the given years completely and the category list; writes right away
  const importData = useCallback(async (cats: Category[], list: YearData[]) => {
    categoriesRef.current = cats;
    setCategoriesState(cats);
    const next = { ...yearsRef.current };
    for (const y of list) next[y.year] = { ...y, bookings: sortBookings(y.bookings) };
    yearsRef.current = next;
    publishYears();
    markDirty(CATEGORIES_FILE);
    for (const y of list) markDirty(yearFile(y.year));
    await flushWrites();
  }, [flushWrites]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading ──
  const loadAll = useCallback(async (dir: FileSystemDirectoryHandle) => {
    unreadableRef.current = new Set();
    let cats: Category[] = [];
    try {
      const text = await readText(dir, CATEGORIES_FILE);
      if (text?.trim()) {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('Datei ist keine Liste');
        cats = parsed;
      }
    } catch (e) {
      unreadableRef.current.add(CATEGORIES_FILE);
      fail(`Lesen von ${CATEGORIES_FILE} fehlgeschlagen`, e);
    }
    const names: string[] = [];
    for await (const name of dir.keys()) if (YEAR_FILE.test(name)) names.push(name);
    names.sort();
    const loaded: Record<number, YearData> = {};
    for (const name of names) {
      const year = Number(name.match(YEAR_FILE)![1]);
      try {
        const text = await readText(dir, name);
        loaded[year] = normalizeYear(text?.trim() ? JSON.parse(text) : {}, year);
      } catch (e) {
        unreadableRef.current.add(name);
        fail(`Lesen von ${name} fehlgeschlagen`, e);
      }
    }
    let st: Settings = EMPTY_SETTINGS;
    try {
      const text = await readText(dir, SETTINGS_FILE);
      if (text?.trim()) {
        const parsed = JSON.parse(text) as Partial<Settings>;
        st = { accounts: parsed.accounts ?? [], recurring: parsed.recurring ?? [] };
      }
    } catch (e) {
      unreadableRef.current.add(SETTINGS_FILE);
      fail(`Lesen von ${SETTINGS_FILE} fehlgeschlagen`, e);
    }
    categoriesRef.current = cats;
    setCategoriesState(cats);
    settingsRef.current = st;
    setSettingsState(st);
    yearsRef.current = loaded;
    publishYears();
    syncRecurring();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activateDir = useCallback(async (dir: FileSystemDirectoryHandle) => {
    await flushWrites();
    dirRef.current = dir;
    dirtyRef.current.clear();
    setIoError(null);
    setDirHandle(dir);
    await enqueue(() => loadAll(dir));
    if (!unreadableRef.current.has(CATEGORIES_FILE) && (await readText(dir, CATEGORIES_FILE)) == null) {
      await writeJson(dir, CATEGORIES_FILE, []);
    }
  }, [flushWrites, loadAll]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        const handle = await loadHandle();
        if (!handle) return;
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          await activateDir(handle);
        } else {
          savedHandleRef.current = handle;
          setSavedHandleAvailable(true);
        }
      } catch { /* IndexedDB unavailable or handle invalid */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reconnectDirectory = useCallback(async () => {
    const handle = savedHandleRef.current;
    if (!handle) return;
    try {
      if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
        setSavedHandleAvailable(false);
        savedHandleRef.current = null;
        await activateDir(handle);
      }
    } catch (e) {
      console.error('[budget] reconnectDirectory:', e);
    }
  }, [activateDir]);

  const pickDirectory = useCallback(async () => {
    try {
      const dir = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: 'readwrite' });
      await persistHandle(dir);
      await activateDir(dir);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[budget] pickDirectory:', e);
    }
  }, [activateDir]);

  const commitAllData = useCallback(async () => {
    const dir = dirRef.current;
    if (!dir) { setGitStatus(s => ({ ...s, error: 'Kein Datenverzeichnis gewählt' })); return; }
    await flushWrites();
    const files = await enqueue(async () => {
      const out = new Map<string, GitFile>();
      for await (const name of dir.keys()) {
        if (!DATA_FILE.test(name)) continue;
        out.set(name, (await readText(dir, name)) ?? '');
      }
      return out;
    });
    for (const name of files.keys()) gitPendingRef.current.delete(name);
    await runCommit(files, `Vollständiger Abgleich (${files.size} Dateien)`, true);
  }, [flushWrites, runCommit]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = () => setIsDark(d => {
    try { localStorage.setItem(THEME_KEY, d ? 'light' : 'dark'); } catch { /* ignore */ }
    return !d;
  });

  // Dev only: lets a test page load data without a directory picker
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __budget?: unknown }).__budget = { importData, setSettings };
  }, [importData, setSettings]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
  }, [isDark]);

  return (
    <Ctx.Provider value={{
      categories, years, settings, dirHandle, savedHandleAvailable, isDark, ioError, lastCategoryId,
      setCategories, setBudget, copyBudget, setMonths, setSettings, setBalance, skipRecurring, addBooking, updateBooking, deleteBooking, importData,
      pickDirectory, reconnectDirectory, toggleTheme,
      gitConfig, setGitConfig, gitStatus, commitNow, commitAllData,
    }}>
      {children}
    </Ctx.Provider>
  );
}
