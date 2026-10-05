import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, FileSpreadsheet, FileText, FileType2, Loader2 } from 'lucide-react';
import { dashboardService } from '../../services/index.js';

const FORMATS = [
  { key: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { key: 'csv', label: 'CSV (.csv)', icon: FileText },
  { key: 'pdf', label: 'PDF (.pdf)', icon: FileType2 },
];

// Exports a dashboard dataset with the filters currently applied (generated and permission-checked server-side).
export function ExportMenu({ metric, filters, label = 'Export' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function run(format) {
    setBusy(format);
    setOpen(false);
    try {
      await dashboardService.exportFile(metric, filters, format);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!!busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-gold-500 text-graphite-950 hover:bg-gold-600 shadow-gold disabled:opacity-60"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        {busy ? 'Exporting…' : label}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-48 surface-card rounded-xl shadow-premium-lg py-1 border" style={{ borderColor: 'var(--border-subtle)' }}>
          {FORMATS.map((f) => (
            <button
              key={f.key}
              role="menuitem"
              type="button"
              onClick={() => run(f.key)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gold-500/10"
              style={{ color: 'var(--text-primary)' }}
            >
              <f.icon size={15} className="text-gold-600" /> {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ExportMenu;
