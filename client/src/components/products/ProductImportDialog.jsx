import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, FileDown, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { Modal, Button } from '../ui/index.js';
import { productService } from '../../services/index.js';

// Two-step import: the file is validated first (nothing is saved), then imported after the user confirms.
export function ProductImportDialog({ open, onClose, onImported, canUpdate }) {
  const [file, setFile] = useState(null);
  const [check, setCheck] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null); // 'check' | 'import'
  const [progress, setProgress] = useState(0);
  const input = useRef(null);

  useEffect(() => { if (open) { setFile(null); setCheck(null); setResult(null); setBusy(null); } }, [open]);

  const run = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'import'); setProgress(0);
    try {
      const r = await productService.importFile(file, { dryRun, onProgress: setProgress });
      if (dryRun) setCheck(r.data);
      else {
        setResult(r.data);
        toast.success(`${r.data.created} added, ${r.data.updated} updated${r.data.skipped ? `, ${r.data.skipped} skipped` : ''}.`);
        onImported?.();
      }
    } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };

  const pick = (f) => {
    if (!f) return;
    if (!/\.(xlsx|csv)$/i.test(f.name)) { toast.error('Choose an .xlsx or .csv file.'); return; }
    setFile(f); setCheck(null); setResult(null);
  };

  const report = result || check;
  return (
    <Modal
      open={open} onClose={busy ? undefined : onClose} size="lg" title="Import products"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>{result ? 'Done' : 'Cancel'}</Button>
          {!result && <Button variant="outline" disabled={!file} loading={busy === 'check'} onClick={() => run(true)}>Check file</Button>}
          {!result && <Button variant="gold" icon={Upload} disabled={!check || (check.created + check.updated === 0)} loading={busy === 'import'} onClick={() => run(false)}>
            Import {check ? check.created + check.updated : ''} product{check && check.created + check.updated === 1 ? '' : 's'}
          </Button>}
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>Upload an Excel (.xlsx) or CSV file - one product per row.</span>
          <button type="button" onClick={() => productService.importTemplate().catch((e) => toast.error(e.message))} className="inline-flex items-center gap-1.5 font-semibold text-gold-700 hover:underline">
            <FileDown size={15} /> Download template
          </button>
        </div>

        <div
          role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
          className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer hover:border-gold-400 transition-colors" style={{ borderColor: 'var(--border-strong)' }}
        >
          <FileSpreadsheet size={28} className="mx-auto text-gold-600 mb-2" />
          {file ? <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{file.name} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>· {(file.size / 1024).toFixed(0)} KB</span></div>
            : <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Drop a file here or click to choose</div>}
          <input ref={input} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </div>

        <ul className="text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
          <li>• Required: SKU, Product Name, GST Rate %, MRP, Selling Price (ex-GST), Purchase Price.</li>
          <li>• Brands, categories and manufacturers are matched by name and created if they don&apos;t exist yet.</li>
          <li>• {canUpdate ? 'Rows with an existing SKU update that product.' : 'Rows with an existing SKU are skipped - only administrators can update existing products.'}</li>
        </ul>

        {busy && (
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-muted)' }} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full bg-gold-gradient transition-all ${progress >= 1 ? 'animate-pulse w-full' : ''}`} style={progress < 1 ? { width: `${Math.max(5, progress * 100)}%` } : undefined} />
          </div>
        )}

        {report && (
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border-subtle)' }} aria-live="polite">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {report.errors.length ? <AlertTriangle size={16} className="text-amber-500" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
              {result ? 'Import finished' : 'File checked - nothing has been saved yet'}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[['Rows', report.total], [result ? 'Added' : 'Will add', report.created], [result ? 'Updated' : 'Will update', report.updated], ['Skipped', report.skipped]].map(([l, v]) => (
                <div key={l} className="rounded-lg p-2" style={{ background: 'var(--bg-surface-muted)' }}>
                  <div className="text-lg font-display font-semibold" style={{ color: 'var(--text-primary)' }}>{v}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{l}</div>
                </div>
              ))}
            </div>
            {report.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
                <table className="w-full text-xs">
                  <thead><tr style={{ background: 'var(--bg-surface-muted)' }}><th className="text-left px-2 py-1.5">Row</th><th className="text-left px-2 py-1.5">SKU</th><th className="text-left px-2 py-1.5">Problem</th></tr></thead>
                  <tbody>
                    {report.errors.map((e) => (
                      <tr key={`${e.row}-${e.sku}`} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td className="px-2 py-1.5">{e.row}</td><td className="px-2 py-1.5 font-mono">{e.sku || '—'}</td><td className="px-2 py-1.5 text-rose-600">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ProductImportDialog;
