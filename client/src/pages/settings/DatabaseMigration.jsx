import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  RefreshCw, Cloud, Play, DatabaseBackup, Download, Upload, RotateCcw, CheckCircle2, AlertTriangle, Loader2, Circle, FileText,
} from 'lucide-react';
import { PageHeader, Button, Modal, StatusBadge, Input } from '../../components/ui/index.js';
import { databaseService } from '../../services/index.js';
import { formatNumber, formatDateTime } from '../../utils/format.js';

const MODES = [
  { value: 'skip', label: 'Add missing records only', hint: 'Records already in Atlas are left untouched and skipped. Nothing is overwritten or deleted.' },
  { value: 'overwrite', label: 'Overwrite matching records', hint: 'Records with the same ID in Atlas are replaced by the incoming copy. Other Atlas records are kept.', confirm: 'OVERWRITE' },
  { value: 'replace', label: 'Replace whole collections', hint: 'Each selected Atlas collection is emptied first, then filled from the source.', confirm: 'REPLACE' },
];

const RUN_STATUS = {
  running: { variant: 'info', label: 'Running' },
  completed: { variant: 'success', label: 'Completed' },
  completed_with_errors: { variant: 'warning', label: 'Completed with issues' },
  failed: { variant: 'danger', label: 'Failed' },
  interrupted: { variant: 'danger', label: 'Interrupted' },
};

const TYPE_LABEL = { migration: 'Migration', backup: 'Backup', restore: 'Restore' };
const muted = { color: 'var(--text-muted)' };
const secondary = { color: 'var(--text-secondary)' };
const border = { borderColor: 'var(--border-subtle)' };

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const sum = (list) => (list || []).reduce((s, c) => s + (c.count || 0), 0);

function ConnectionCard({ icon: Icon, title, role, info }) {
  return (
    <div className="surface-card rounded-xl2 shadow-premium p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-gold-100 text-gold-700 flex items-center justify-center shrink-0"><Icon size={18} /></span>
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            <p className="text-xs" style={muted}>{role}</p>
          </div>
        </div>
        <StatusBadge variant={info?.ok ? 'success' : 'danger'} label={info?.ok ? 'Connected' : 'Unavailable'} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt style={muted}>Host</dt>
        <dd className="text-right break-all" style={secondary}>{info?.host || '—'}</dd>
        <dt style={muted}>Database</dt>
        <dd className="text-right" style={secondary}>{info?.database || '—'}</dd>
        <dt style={muted}>Collections</dt>
        <dd className="text-right tabular-nums" style={secondary}>{info?.ok ? formatNumber(info.collections.length) : '—'}</dd>
        <dt style={muted}>Documents</dt>
        <dd className="text-right tabular-nums" style={secondary}>{info?.ok ? formatNumber(sum(info.collections)) : '—'}</dd>
      </dl>
      {info?.error && <p className="mt-3 text-xs text-rose-600 break-words">{info.error}</p>}
    </div>
  );
}

function Steps({ job }) {
  const steps = job.type === 'backup'
    ? [['backup', 'Backup'], ['done', 'Report']]
    : [['backup', 'Backup'], ['transfer', job.type === 'restore' ? 'Restore' : 'Migration'], ['verify', 'Verification'], ['done', 'Completion report']];
  const index = Math.max(0, steps.findIndex(([key]) => key === job.phase));
  return (
    <ol className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      {steps.map(([key, label], i) => {
        const done = i < index || job.phase === 'done';
        const current = i === index && job.phase !== 'done';
        return (
          <li key={key} className="flex items-center gap-1.5" style={done || current ? { color: 'var(--text-primary)' } : muted}>
            {done ? <CheckCircle2 size={16} className="text-emerald-600" /> : current ? <Loader2 size={16} className="animate-spin text-gold-600" /> : <Circle size={16} />}
            <span className={current ? 'font-semibold' : ''}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border px-3.5 py-2.5" style={border}>
      <p className="text-[11px] uppercase tracking-wider font-semibold" style={muted}>{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone || ''}`} style={tone ? undefined : { color: 'var(--text-primary)' }}>{formatNumber(value || 0)}</p>
    </div>
  );
}

function JobPanel({ job, onClose }) {
  const t = job.totals || {};
  const running = job.status === 'running';
  const pct = t.total ? Math.min(100, Math.round((t.processed / t.total) * 100)) : running ? 0 : 100;
  const state = RUN_STATUS[job.status] || RUN_STATUS.running;
  const transfer = job.type !== 'backup';
  const logBox = useRef(null);
  useEffect(() => { if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight; }, [job.logs?.length]);

  return (
    <section className="surface-card rounded-xl2 shadow-premium p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {TYPE_LABEL[job.type]} {running ? 'in progress' : 'report'}
          </h3>
          <p className="text-xs mt-0.5" style={muted}>
            Started {formatDateTime(job.startedAt)}{job.startedByName ? ` by ${job.startedByName}` : ''}
            {job.finishedAt ? ` · finished ${formatDateTime(job.finishedAt)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge variant={state.variant} label={state.label} />
          {!running && <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>}
        </div>
      </div>

      <Steps job={job} />

      <div className="mt-4">
        <div className="flex justify-between text-xs mb-1.5" style={secondary}>
          <span>{formatNumber(t.processed || 0)} of {formatNumber(t.total || 0)} records processed</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--hover-tint)' }}>
          <div className="h-full bg-gold-gradient transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {job.error && <p className="mt-4 text-sm text-rose-600 break-words">{job.error}</p>}
      {job.backupFile && (
        <p className="mt-3 text-xs" style={secondary}>
          {transfer ? 'Backup taken before changes: ' : 'Backup file: '}<span className="font-mono">{job.backupFile}</span>
        </p>
      )}

      {transfer && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
          <Stat label="Successful" value={(t.inserted || 0) + (t.updated || 0)} tone="text-emerald-600" />
          <Stat label="Overwritten" value={t.updated} />
          <Stat label="Skipped (already in Atlas)" value={t.skipped} />
          <Stat label="Skipped (duplicate key)" value={t.duplicates} tone={t.duplicates ? 'text-amber-600' : ''} />
          <Stat label="Failed" value={t.failed} tone={t.failed ? 'text-rose-600' : ''} />
        </div>
      )}

      <div className="overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider" style={muted}>
              <th className="py-2 pr-3 font-semibold">Collection</th>
              <th className="py-2 px-3 font-semibold text-right">Source</th>
              {transfer && <th className="py-2 px-3 font-semibold text-right">Inserted</th>}
              {transfer && <th className="py-2 px-3 font-semibold text-right">Overwritten</th>}
              {transfer && <th className="py-2 px-3 font-semibold text-right">Skipped</th>}
              {transfer && <th className="py-2 px-3 font-semibold text-right">Failed</th>}
              {transfer && <th className="py-2 px-3 font-semibold text-right">Atlas before → after</th>}
              {transfer && <th className="py-2 px-3 font-semibold text-right">Verified</th>}
              <th className="py-2 pl-3 font-semibold text-right">{transfer ? 'Status' : 'Saved'}</th>
            </tr>
          </thead>
          <tbody>
            {(job.items || []).map((it) => (
              <tr key={it.name} className="border-t" style={border}>
                <td className="py-2 pr-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{it.name}</td>
                <td className="py-2 px-3 text-right tabular-nums" style={secondary}>{formatNumber(it.sourceCount || 0)}</td>
                {transfer && <td className="py-2 px-3 text-right tabular-nums" style={secondary}>{formatNumber(it.inserted || 0)}</td>}
                {transfer && <td className="py-2 px-3 text-right tabular-nums" style={secondary}>{formatNumber(it.updated || 0)}</td>}
                {transfer && <td className="py-2 px-3 text-right tabular-nums" style={secondary}>{formatNumber((it.skipped || 0) + (it.duplicates || 0))}</td>}
                {transfer && <td className={`py-2 px-3 text-right tabular-nums ${it.failed ? 'text-rose-600 font-semibold' : ''}`} style={it.failed ? undefined : secondary}>{formatNumber(it.failed || 0)}</td>}
                {transfer && (
                  <td className="py-2 px-3 text-right tabular-nums" style={secondary}>
                    {it.destBefore == null ? '—' : formatNumber(it.destBefore)} → {it.destAfter == null ? '…' : formatNumber(it.destAfter)}
                  </td>
                )}
                {transfer && (
                  <td className="py-2 px-3 text-right tabular-nums" style={secondary}>
                    {it.verified ? `${formatNumber(it.verified.present)} / ${formatNumber(it.sourceCount || 0)}` : '—'}
                  </td>
                )}
                <td className="py-2 pl-3 text-right">
                  {transfer
                    ? <StatusBadge variant={it.status === 'done' ? 'success' : it.status === 'warning' ? 'warning' : it.status === 'pending' ? 'neutral' : 'info'} label={it.status === 'done' ? 'Verified' : it.status === 'warning' ? 'Check' : it.status} />
                    : <span className="tabular-nums" style={secondary}>{formatNumber(it.processed || 0)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-5">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={muted}>Log</h4>
          <div ref={logBox} className="h-48 overflow-y-auto rounded-xl border p-3 font-mono text-[11px] leading-relaxed" style={border}>
            {(job.logs || []).map((l, i) => (
              <div key={i} className={l.level === 'error' ? 'text-rose-600' : l.level === 'warn' ? 'text-amber-600' : ''} style={l.level === 'info' ? secondary : undefined}>
                <span style={muted}>{new Date(l.at).toLocaleTimeString()}</span> {l.message}
              </div>
            ))}
            {!job.logs?.length && <span style={muted}>Waiting for the first entry…</span>}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={muted}>Error details ({formatNumber(job.issues?.length || 0)})</h4>
          <div className="h-48 overflow-y-auto rounded-xl border p-3 text-xs space-y-2" style={border}>
            {(job.issues || []).map((e, i) => (
              <div key={i}>
                <span className={`font-semibold ${e.kind === 'failed' ? 'text-rose-600' : 'text-amber-600'}`}>{e.kind === 'failed' ? 'Failed' : 'Duplicate'}</span>{' '}
                <span className="font-mono" style={secondary}>{e.collection}{e._id ? ` / ${e._id}` : ''}</span>
                <p className="break-words" style={muted}>{e.message}</p>
              </div>
            ))}
            {!job.issues?.length && <span style={muted}>No failed or duplicate records.</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function StartDialog({ request, onClose, onStart, busy }) {
  const [mode, setMode] = useState('skip');
  const [typed, setTyped] = useState('');
  useEffect(() => { setMode('skip'); setTyped(''); }, [request]);
  if (!request) return null;
  const chosen = MODES.find((m) => m.value === mode);
  const ready = !chosen.confirm || typed.trim() === chosen.confirm;

  return (
    <Modal
      open onClose={onClose} size="md"
      title="Restore backup into Atlas"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={chosen.confirm ? 'danger' : 'gold'} icon={Play} loading={busy} disabled={!ready} onClick={() => onStart(mode, chosen.confirm)}>
            Start Restore
          </Button>
        </>
      )}
    >
      <div className="space-y-4 text-sm" style={secondary}>
        <p>
          Records from <span className="font-mono text-xs">{request.file}</span> will be copied into the Atlas database.
          {' '}A backup of the affected Atlas collections is taken first, and record IDs, links, timestamps and indexes are preserved.
        </p>
        <div className="space-y-2">
          {MODES.map((m) => (
            <label key={m.value} className="flex gap-3 rounded-xl border p-3 cursor-pointer" style={{ borderColor: mode === m.value ? 'var(--border-strong)' : 'var(--border-subtle)' }}>
              <input type="radio" name="mode" className="mt-1" checked={mode === m.value} onChange={() => { setMode(m.value); setTyped(''); }} />
              <span>
                <span className="block font-semibold" style={{ color: 'var(--text-primary)' }}>{m.label}</span>
                <span className="block text-xs mt-0.5" style={muted}>{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {chosen.confirm && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="flex gap-2 text-rose-700 text-xs mb-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              {mode === 'replace' ? 'This deletes the existing Atlas records in the selected collections.' : 'This changes existing Atlas records.'} Type {chosen.confirm} to confirm.
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={chosen.confirm} autoFocus />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function DatabaseMigration() {
  const [status, setStatus] = useState(null);
  const [runs, setRuns] = useState([]);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null); // Set of collection names; null until the first load
  const [job, setJob] = useState(null);
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState('');
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, b] = await Promise.all([databaseService.status(), databaseService.runs(), databaseService.backups()]);
      setStatus(s.data);
      setRuns(r.data);
      setBackups(b.data);
      setLoadError('');
      setSelected((prev) => prev || new Set(s.data.primary.collections.map((c) => c.name)));
      if (s.data.active) setJob(s.data.active);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live progress: poll the running job once a second until it finishes.
  const jobId = job?._id;
  const jobRunning = job?.status === 'running';
  useEffect(() => {
    if (!jobId || !jobRunning) return undefined;
    const timer = setInterval(async () => {
      try {
        const { data } = await databaseService.run(jobId);
        setJob(data);
        if (data.status !== 'running') {
          const label = TYPE_LABEL[data.type];
          if (data.status === 'completed') toast.success(`${label} completed.`);
          else if (data.status === 'completed_with_errors') toast(`${label} finished with issues - see the report.`, { icon: '⚠️' });
          else toast.error(`${label} failed.`);
          load();
        }
      } catch { /* keep polling; a transient error must not hide the job */ }
    }, 1000);
    return () => clearInterval(timer);
  }, [jobId, jobRunning, load]);

  const rows = useMemo(() => [...(status?.primary.collections || [])].sort((a, b) => a.name.localeCompare(b.name)), [status]);
  const names = useMemo(() => rows.map((r) => r.name), [rows]);
  const picked = useMemo(() => names.filter((n) => selected?.has(n)), [names, selected]);
  const pickedDocs = rows.filter((r) => picked.includes(r.name)).reduce((s, r) => s + (r.count || 0), 0);
  const allPicked = names.length > 0 && picked.length === names.length;
  const canTransfer = !!status?.canTransfer && !jobRunning;

  function toggle(name) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function begin(key, action) {
    setBusy(key);
    try {
      const { data } = await action();
      setJob(data);
      setRequest(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { toast.error(err.message); } finally { setBusy(''); }
  }

  const start = (mode, confirm) => begin('start', () => databaseService.restore({ file: request.file, mode, confirm }));

  // Backups cover the ticked collections; with everything (or nothing) ticked they cover the whole database.
  const backup = () => begin('backup', () => databaseService.backup({ collections: allPicked || !picked.length ? undefined : picked }));

  async function download(name) {
    setBusy(`dl-${name}`);
    try {
      const blob = await databaseService.download(name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(err.message); } finally { setBusy(''); }
  }

  async function importFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('upload');
    try {
      await databaseService.upload(file);
      toast.success('Backup file imported. Use "Restore to Atlas" to load it.');
      load();
    } catch (err) { toast.error(err.message); } finally { setBusy(''); }
  }

  async function openRun(id) {
    try {
      const { data } = await databaseService.run(id);
      setJob(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div>
      <PageHeader
        title="Database Backup"
        subtitle="MongoDB Atlas is the only database this application connects to. Back it up, export a backup, or restore one here."
        crumbs={[{ label: 'Settings', to: '/settings/system' }, { label: 'Database Backup' }]}
        actions={<Button variant="outline" icon={RefreshCw} onClick={load} loading={loading}>Refresh</Button>}
      />

      {loadError && (
        <div className="surface-card rounded-xl2 shadow-premium p-5 mb-6 flex gap-3 border-rose-300">
          <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-700">Database connection error</p>
            <p className="text-sm mt-1 break-words" style={secondary}>{loadError}</p>
          </div>
        </div>
      )}

      {job && <JobPanel job={job} onClose={() => setJob(null)} />}

      {status && (
        <>
          <div className="mb-6">
            <ConnectionCard icon={Cloud} title="MongoDB Atlas" role="Primary database - all application data" info={status.primary} />
          </div>

          {!status.canTransfer && (
            <p className="text-sm mb-6 flex gap-2" style={secondary}>
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              This is the hosted site, which cannot store backup files. Open the app running on your computer to back up or restore.
            </p>
          )}

          <section className="surface-card rounded-xl2 shadow-premium p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Atlas collections</h3>
                <p className="text-xs mt-0.5" style={muted}>
                  {picked.length} of {names.length} collections selected · {formatNumber(pickedDocs)} records. Tick everything for a complete database backup.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="gold" icon={DatabaseBackup} disabled={!canTransfer || !status.primary.ok} loading={busy === 'backup'} onClick={backup}>Backup Atlas</Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider" style={muted}>
                    <th className="py-2 pr-3 w-8">
                      <input
                        type="checkbox" aria-label="Select all collections" checked={allPicked} disabled={!names.length}
                        onChange={() => setSelected(allPicked ? new Set() : new Set(names))}
                      />
                    </th>
                    <th className="py-2 px-3 font-semibold">Collection</th>
                    <th className="py-2 pl-3 font-semibold text-right">Records</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} className="border-t" style={border}>
                      <td className="py-2 pr-3">
                        <input type="checkbox" aria-label={`Select ${r.name}`} checked={!!selected?.has(r.name)} onChange={() => toggle(r.name)} />
                      </td>
                      <td className="py-2 px-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{r.name}</td>
                      <td className="py-2 pl-3 text-right tabular-nums" style={secondary}>{formatNumber(r.count)}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={3} className="py-8 text-center" style={muted}>No collections found in the database.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface-card rounded-xl2 shadow-premium p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Backups, export and import</h3>
                <p className="text-xs mt-0.5" style={muted}>Download a backup to export it. Import a backup file, then restore it into Atlas.</p>
              </div>
              <div>
                <input ref={fileInput} type="file" accept=".gz" className="hidden" onChange={importFile} />
                <Button variant="outline" icon={Upload} disabled={!status.canTransfer} loading={busy === 'upload'} onClick={() => fileInput.current?.click()}>Import Backup File</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider" style={muted}>
                    <th className="py-2 pr-3 font-semibold">File</th>
                    <th className="py-2 px-3 font-semibold">Backup of</th>
                    <th className="py-2 px-3 font-semibold">Created</th>
                    <th className="py-2 px-3 font-semibold text-right">Collections</th>
                    <th className="py-2 px-3 font-semibold text-right">Records</th>
                    <th className="py-2 px-3 font-semibold text-right">Size</th>
                    <th className="py-2 pl-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.name} className="border-t" style={border}>
                      <td className="py-2 pr-3 font-mono text-xs break-all" style={{ color: 'var(--text-primary)' }}>{b.name}</td>
                      <td className="py-2 px-3 capitalize" style={secondary}>{b.valid ? `${b.kind} · ${b.database}` : 'Unreadable file'}</td>
                      <td className="py-2 px-3 whitespace-nowrap" style={secondary}>{formatDateTime(b.createdAt)}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={secondary}>{formatNumber(b.collections.length)}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={secondary}>{formatNumber(b.documents)}</td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap" style={secondary}>{formatBytes(b.size)}</td>
                      <td className="py-2 pl-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" icon={Download} loading={busy === `dl-${b.name}`} onClick={() => download(b.name)}>Download</Button>
                          <Button variant="outline" size="sm" icon={RotateCcw} disabled={!canTransfer || !b.valid || !status.primary.ok} onClick={() => setRequest({ type: 'restore', file: b.name })}>Restore to Atlas</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!backups.length && <tr><td colSpan={7} className="py-8 text-center" style={muted}>No backups yet. One is taken automatically before every restore.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface-card rounded-xl2 shadow-premium p-5">
            <h3 className="font-display text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>History</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider" style={muted}>
                    <th className="py-2 pr-3 font-semibold">Started</th>
                    <th className="py-2 px-3 font-semibold">Job</th>
                    <th className="py-2 px-3 font-semibold">By</th>
                    <th className="py-2 px-3 font-semibold text-right">Successful</th>
                    <th className="py-2 px-3 font-semibold text-right">Skipped</th>
                    <th className="py-2 px-3 font-semibold text-right">Failed</th>
                    <th className="py-2 px-3 font-semibold">Status</th>
                    <th className="py-2 pl-3 font-semibold text-right">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => {
                    const t = r.totals || {};
                    const state = RUN_STATUS[r.status] || RUN_STATUS.running;
                    const isBackup = r.type === 'backup';
                    return (
                      <tr key={r._id} className="border-t" style={border}>
                        <td className="py-2 pr-3 whitespace-nowrap" style={secondary}>{formatDateTime(r.startedAt)}</td>
                        <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>
                          {TYPE_LABEL[r.type]}
                          <span className="block text-xs" style={muted}>
                            {isBackup ? `${r.source?.kind || ''} database` : `${r.source?.kind === 'file' ? 'backup file' : 'local'} → Atlas · ${MODES.find((m) => m.value === r.mode)?.label || r.mode}`}
                          </span>
                        </td>
                        <td className="py-2 px-3" style={secondary}>{r.startedByName || '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums" style={secondary}>{formatNumber(isBackup ? t.processed || 0 : (t.inserted || 0) + (t.updated || 0))}</td>
                        <td className="py-2 px-3 text-right tabular-nums" style={secondary}>{isBackup ? '—' : formatNumber((t.skipped || 0) + (t.duplicates || 0))}</td>
                        <td className="py-2 px-3 text-right tabular-nums" style={secondary}>{isBackup ? '—' : formatNumber(t.failed || 0)}</td>
                        <td className="py-2 px-3"><StatusBadge variant={state.variant} label={state.label} /></td>
                        <td className="py-2 pl-3 text-right"><Button variant="ghost" size="sm" icon={FileText} onClick={() => openRun(r._id)}>View</Button></td>
                      </tr>
                    );
                  })}
                  {!runs.length && <tr><td colSpan={8} className="py-8 text-center" style={muted}>No backups or restores have been run yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <StartDialog request={request} onClose={() => setRequest(null)} onStart={start} busy={busy === 'start'} />
    </div>
  );
}

export default DatabaseMigration;
