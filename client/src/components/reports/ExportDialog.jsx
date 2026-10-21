import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText, Save, Trash2, Download, CheckCircle2, Users, Eye } from 'lucide-react';
import { Modal, Button } from '../ui/index.js';
import { advancedReportService, saveBlob } from '../../services/index.js';
import { RANGE_LABELS } from './ReportFilterBar.jsx';

const FILTER_KEYS = ['range', 'from', 'to', 'granularity', 'compare', 'product', 'category', 'brand', 'supplier', 'vendor', 'paymentMethod', 'expenseCategory', 'stockStatus', 'transactionType'];

// Pick a template or sections, then generate a PDF (with preview) or an Excel workbook.
export function ExportDialog({ open, onClose, meta, filters, initialFormat = 'pdf', onApplyFilters, getCharts, onTemplatesChanged }) {
  const [format, setFormat] = useState(initialFormat);
  const [title, setTitle] = useState('Business Report');
  const [selected, setSelected] = useState(['summary', 'trend']);
  const [templateKey, setTemplateKey] = useState('');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [stage, setStage] = useState(null); // null | 'building' | 'downloading' | 'done'
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [shared, setShared] = useState(false);
  const previewUrl = useRef(null);

  useEffect(() => { if (open) { setFormat(initialFormat); setStage(null); setResult(null); setProgress(null); } }, [open, initialFormat]);
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  const sections = useMemo(() => meta?.sections || [], [meta]);
  const bySheet = useMemo(() => sections.reduce((m, s) => { (m[s.sheet] = m[s.sheet] || []).push(s); return m; }, {}), [sections]);
  const sheetOrder = (meta?.sheets || []).filter((s) => bySheet[s]);
  const builtIn = meta?.templates?.builtIn || [];
  const saved = meta?.templates?.saved || [];

  const pickTemplate = (key) => {
    setTemplateKey(key);
    if (!key) return;
    const t = key.startsWith('b:') ? builtIn.find((x) => x.key === key.slice(2)) : saved.find((x) => x._id === key.slice(2));
    if (!t) return;
    setSelected(t.sections);
    setTitle(t.name);
    const nextFilters = key.startsWith('b:') ? { ...filters, range: t.range, from: '', to: '', granularity: t.granularity } : { ...t.filters };
    onApplyFilters?.(nextFilters);
  };

  const toggle = (k) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const toggleSheet = (sheet) => {
    const keys = bySheet[sheet].map((s) => s.key);
    const all = keys.every((k) => selected.includes(k));
    setSelected((s) => (all ? s.filter((k) => !keys.includes(k)) : [...new Set([...s, ...keys])]));
  };

  const generate = async () => {
    if (!selected.length) { toast.error('Select at least one section.'); return; }
    setStage('building'); setProgress(null); setResult(null);
    try {
      const charts = format === 'xlsx' && includeCharts && getCharts ? await getCharts() : [];
      const ordered = sections.map((s) => s.key).filter((k) => selected.includes(k));
      const out = await advancedReportService.exportFile(
        { format, title, sections: ordered, filters, charts },
        { onProgress: (p) => { setStage('downloading'); setProgress(p); } },
      );
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(out.blob);
      setResult({ ...out, url: previewUrl.current, size: out.blob.size });
      setStage('done');
      if (format === 'xlsx') { saveBlob(out.blob, out.name); toast.success('Excel workbook downloaded.'); }
      else toast.success('PDF ready - preview below.');
    } catch (e) {
      setStage(null);
      toast.error(e.message || 'Export failed.');
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) { toast.error('Give the template a name.'); return; }
    setSaving(true);
    try {
      const f = Object.fromEntries(FILTER_KEYS.filter((k) => filters[k]).map((k) => [k, filters[k]]));
      await advancedReportService.createTemplate({ name: templateName.trim(), sections: selected, filters: f, shared });
      toast.success('Template saved.');
      setTemplateName('');
      onTemplatesChanged?.();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const removeTemplate = async (t) => {
    try {
      await advancedReportService.deleteTemplate(t._id);
      toast.success('Template deleted.');
      if (templateKey === `s:${t._id}`) setTemplateKey('');
      onTemplatesChanged?.();
    } catch (e) { toast.error(e.message); }
  };

  const busy = stage === 'building' || stage === 'downloading';
  const mine = saved.filter((t) => t.mine);

  return (
    <Modal
      open={open} onClose={busy ? undefined : onClose} size="xl" title="Export report"
      footer={(
        <>
          <span className="mr-auto text-xs self-center" style={{ color: 'var(--text-muted)' }}>
            {RANGE_LABELS[filters.range] || 'Custom range'} · {selected.length} section{selected.length === 1 ? '' : 's'}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
          <Button variant="gold" icon={format === 'pdf' ? FileText : FileSpreadsheet} loading={busy} onClick={generate}>
            {format === 'pdf' ? 'Generate PDF' : 'Generate Excel'}
          </Button>
        </>
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div>
            <div className="eyebrow mb-2">Format</div>
            <div className="grid grid-cols-2 gap-2">
              {[['pdf', 'PDF report', FileText, 'Branded, with charts, summary cards and tables'], ['xlsx', 'Excel workbook', FileSpreadsheet, 'Separate sheets, formulas, filters, conditional formatting']].map(([k, label, Icon, hint]) => (
                <button key={k} type="button" onClick={() => setFormat(k)} aria-pressed={format === k}
                  className={`text-left rounded-xl border p-3 transition-all ${format === k ? 'border-gold-400 bg-gold-50/60 dark:bg-gold-500/10' : 'hover:border-gold-300'}`} style={format === k ? undefined : { borderColor: 'var(--border-subtle)' }}>
                  <Icon size={18} className={k === 'pdf' ? 'text-rose-600' : 'text-emerald-600'} />
                  <div className="text-sm font-semibold mt-1.5" style={{ color: 'var(--text-primary)' }}>{label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{hint}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="eyebrow">Report title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="mt-2 w-full rounded-xl border px-3 py-2 text-sm bg-[var(--bg-surface)]" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }} />
          </label>

          <label className="block">
            <span className="eyebrow">Template</span>
            <select value={templateKey} onChange={(e) => pickTemplate(e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2 text-sm bg-[var(--bg-surface)] cursor-pointer" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}>
              <option value="">Custom selection</option>
              <optgroup label="Standard reports">{builtIn.map((t) => <option key={t.key} value={`b:${t.key}`}>{t.name}</option>)}</optgroup>
              {saved.length > 0 && <optgroup label="Saved templates">{saved.map((t) => <option key={t._id} value={`s:${t._id}`}>{t.name}{t.shared ? ' (shared)' : ''}{!t.mine ? ` · ${t.ownerName}` : ''}</option>)}</optgroup>}
            </select>
            <span className="text-[11px] mt-1 block" style={{ color: 'var(--text-muted)' }}>A template sets the sections and the report period.</span>
          </label>

          {format === 'xlsx' && (
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" className="accent-[#C29A56] w-4 h-4" checked={includeCharts} onChange={(e) => setIncludeCharts(e.target.checked)} />
              Include the page&rsquo;s charts as images
            </label>
          )}

          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="eyebrow">Save this selection as a template</div>
            <div className="flex gap-2">
              <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Monday sales review" maxLength={80} className="flex-1 min-w-0 rounded-xl border px-3 py-2 text-sm bg-[var(--bg-surface)]" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }} />
              <Button size="sm" variant="outline" icon={Save} loading={saving} onClick={saveTemplate}>Save</Button>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" className="accent-[#C29A56]" checked={shared} onChange={(e) => setShared(e.target.checked)} /> <Users size={13} /> Share with everyone who can open Reports
            </label>
            {mine.length > 0 && (
              <ul className="pt-1 space-y-1">
                {mine.map((t) => (
                  <li key={t._id} className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="truncate">{t.name}{t.shared ? ' · shared' : ''}</span>
                    <button type="button" onClick={() => removeTemplate(t)} className="p-1 rounded hover:text-rose-600" aria-label={`Delete template ${t.name}`}><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-2">
            <div className="eyebrow">Sections {format === 'xlsx' ? '(grouped by Excel sheet)' : ''}</div>
            <div className="flex gap-2 text-xs">
              <button type="button" className="font-semibold text-gold-700 hover:underline" onClick={() => setSelected(sections.map((s) => s.key))}>Select all</button>
              <button type="button" className="font-semibold hover:underline" style={{ color: 'var(--text-muted)' }} onClick={() => setSelected([])}>Clear</button>
            </div>
          </div>
          <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
            {sheetOrder.map((sheet) => (
              <fieldset key={sheet} className="rounded-xl border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <legend className="px-1">
                  <button type="button" onClick={() => toggleSheet(sheet)} className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{sheet}</button>
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {bySheet[sheet].map((s) => (
                    <label key={s.key} className="flex items-start gap-2 cursor-pointer text-sm" title={s.description}>
                      <input type="checkbox" className="accent-[#C29A56] w-4 h-4 mt-0.5" checked={selected.includes(s.key)} onChange={() => toggle(s.key)} />
                      <span>
                        <span style={{ color: 'var(--text-primary)' }}>{s.title}</span>
                        <span className="block text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>{s.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      </div>

      {(busy || stage === 'done') && (
        <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }} aria-live="polite">
          {busy && (
            <>
              <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                <span>{stage === 'building' ? 'Building the report from live data…' : 'Downloading…'}</span>
                {progress !== null && stage === 'downloading' && <span>{Math.round(progress * 100)}%</span>}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-muted)' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress !== null ? Math.round(progress * 100) : undefined}>
                <div className={`h-full bg-gold-gradient transition-all duration-300 ${progress === null ? 'w-1/3 animate-pulse' : ''}`} style={progress !== null ? { width: `${Math.max(4, progress * 100)}%` } : undefined} />
              </div>
            </>
          )}
          {stage === 'done' && result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 size={16} /> {result.name} · {(result.size / 1024).toFixed(0)} KB
                </div>
                <div className="flex gap-2">
                  {format === 'pdf' && <a href={result.url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" icon={Eye}>Open in new tab</Button></a>}
                  <Button size="sm" variant="primary" icon={Download} onClick={() => saveBlob(result.blob, result.name)}>Download</Button>
                </div>
              </div>
              {format === 'pdf' && <iframe title="PDF preview" src={result.url} className="w-full h-[60vh] rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }} />}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default ExportDialog;
