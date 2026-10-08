import React, { useState } from 'react';
import { FolderOpen, GitCommitHorizontal, Plug, Upload } from 'lucide-react';
import { useStore } from '../store';
import { parseRepo, testConnection } from '../git';
import { Field, themeClasses } from '../ui';

export default function AdminView() {
  const { isDark, gitConfig, setGitConfig, gitStatus, commitNow, commitAllData, dirHandle, pickDirectory, years, categories } = useStore();
  const t = themeClasses(isDark);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const repo = parseRepo(gitConfig.repo);
  const ready = !!repo && !!gitConfig.token;

  const test = async () => {
    setTesting(true);
    try { setTestResult({ ok: true, text: await testConnection(gitConfig) }); }
    catch (e) { setTestResult({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setTesting(false); }
  };

  const yearList = Object.values(years).sort((a, b) => a.year - b.year);
  const bookings = yearList.reduce((n, y) => n + y.bookings.length, 0);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className={`${t.title} mb-6`}>Admin</h2>

      <div className={`${t.section} mb-3`}>Datenverzeichnis</div>
      <div className={`rounded-xl border p-4 space-y-1.5 text-[11px] mb-10 ${isDark ? 'border-white/8 text-white/60' : 'border-black/8 text-black/60'}`}>
        <div className="flex justify-between gap-4">
          <span className={t.muted}>Verzeichnis</span>
          <span className="text-right">{dirHandle ? dirHandle.name : '— (Daten nur im Speicher)'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={t.muted}>Dateien</span>
          <span className="text-right">categories.json ({categories.length} Kategorien){yearList.length ? `, budget-${yearList[0].year}.json … budget-${yearList[yearList.length - 1].year}.json (${bookings} Buchungen)` : ''}</span>
        </div>
        <div className="pt-2">
          <button className={t.btn} onClick={pickDirectory}><FolderOpen size={12} /> {dirHandle ? 'Anderes Verzeichnis wählen' : 'Verzeichnis wählen'}</button>
        </div>
        <p className={`pt-1 leading-relaxed ${t.muted}`}>
          Pro Jahr eine JSON-Datei mit Budget und Buchungen; vor jedem Schreiben wird höchstens stündlich eine Sicherung unter backup/ abgelegt.
        </p>
      </div>

      <div className={`${t.section} mb-3`}>Git-Versionierung der Daten</div>
      <div className="space-y-4">
        <label className={`flex items-center gap-2 text-xs cursor-pointer ${t.soft}`}>
          <input type="checkbox" checked={gitConfig.enabled}
            onChange={e => setGitConfig({ ...gitConfig, enabled: e.target.checked })} className="accent-blue-500" />
          Nach jeder Anpassung automatisch committen
        </label>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Repository" isDark={isDark} className="col-span-2">
            <input value={gitConfig.repo} onChange={e => setGitConfig({ ...gitConfig, repo: e.target.value })}
              placeholder="git@github.com:z9nai/z9nai-bookkeeping-data.git" autoComplete="off" spellCheck={false} className={`${t.input} w-full`} />
          </Field>
          <Field label="Branch" isDark={isDark}>
            <input value={gitConfig.branch} onChange={e => setGitConfig({ ...gitConfig, branch: e.target.value })} placeholder="main" className={`${t.input} w-full`} />
          </Field>
        </div>
        {gitConfig.repo && !repo && <p className="text-[11px] text-red-400">Repository-Angabe nicht erkannt</p>}
        <Field label="GitHub Token" isDark={isDark}>
          <input type="password" value={gitConfig.token} onChange={e => setGitConfig({ ...gitConfig, token: e.target.value.trim() })}
            placeholder="github_pat_…" autoComplete="off" className={`${t.input} w-full`} />
        </Field>
        <p className={`text-[11px] leading-relaxed ${t.muted}`}>
          Fine-grained Token unter{' '}
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" className="underline">
            github.com/settings/personal-access-tokens
          </a>{' '}
          erstellen: nur dieses Repository, Berechtigung «Contents: Read and write».
          Der Token wird nur in diesem Browser gespeichert, nicht im Datenverzeichnis.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button className={t.btn} disabled={!ready || testing} onClick={test}>
            <Plug size={12} /> {testing ? 'Teste…' : 'Verbindung testen'}
          </button>
          <button className={t.btn} disabled={!ready || !dirHandle || gitStatus.busy} onClick={commitAllData}
            title={!dirHandle ? 'Zuerst Datenverzeichnis wählen' : undefined}>
            <Upload size={12} /> Alle Daten jetzt committen
          </button>
          <button className={t.btn} disabled={!ready || gitStatus.pending.length === 0 || gitStatus.busy} onClick={commitNow}>
            <GitCommitHorizontal size={12} /> Offene Änderungen committen
          </button>
        </div>
        {testResult && (
          <p className={`text-[11px] ${testResult.ok ? t.pos : 'text-red-400'}`}>{testResult.text}</p>
        )}
        <div className={`rounded-xl border p-4 space-y-1.5 text-[11px] ${isDark ? 'border-white/8 text-white/60' : 'border-black/8 text-black/60'}`}>
          <div className="flex justify-between">
            <span className={t.muted}>Status</span>
            <span>{gitStatus.busy ? 'Committe…' : !gitConfig.enabled ? 'Auto-Commit aus' : 'Bereit'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className={t.muted}>Offen</span>
            <span className="text-right">{gitStatus.pending.length ? gitStatus.pending.join(', ') : '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className={t.muted}>Letzter Commit</span>
            <span className="text-right">
              {gitStatus.lastSha && repo ? (
                <a className="underline" target="_blank" rel="noopener noreferrer"
                  href={`https://github.com/${repo.owner}/${repo.repo}/commit/${gitStatus.lastSha}`}>
                  {gitStatus.lastSha.slice(0, 7)}
                </a>
              ) : '—'}
              {gitStatus.lastCommitAt && <> · {gitStatus.lastCommitAt}</>}
            </span>
          </div>
          {gitStatus.lastMessage && <div className="text-right">{gitStatus.lastMessage}</div>}
          {gitStatus.error && <div className="text-red-400">Fehler: {gitStatus.error}</div>}
        </div>
      </div>
    </div>
  );
}
