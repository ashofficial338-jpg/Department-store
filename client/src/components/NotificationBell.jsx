import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, AlertTriangle, Info, XCircle, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { notificationService } from '../services/index.js';

const ICONS = { critical: XCircle, warning: AlertTriangle, info: Info };
const COLORS = { critical: 'text-rose-600 bg-rose-50', warning: 'text-amber-600 bg-amber-50', info: 'text-sky-600 bg-sky-50' };
const SEVERITIES = ['critical', 'warning', 'info'];
const LABELS = { critical: 'Critical', warning: 'Warnings', info: 'Info' };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [severity, setSeverity] = useState('all');
  const ref = useRef(null);

  useEffect(() => {
    notificationService.list().then((res) => setItems(res.data)).catch(() => {});
    const interval = setInterval(() => notificationService.list().then((res) => setItems(res.data)).catch(() => {}), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  const counts = SEVERITIES.reduce((acc, s) => ({ ...acc, [s]: items.filter((n) => n.severity === s).length }), {});
  const tabs = ['all', ...SEVERITIES.filter((s) => counts[s] > 0)];
  const active = tabs.includes(severity) ? severity : 'all';
  const shown = active === 'all' ? items : items.filter((n) => n.severity === active);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={items.length ? `Notifications (${items.length})` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-[var(--hover-tint)] active:scale-95"
      >
        <Bell size={17} style={{ color: 'var(--text-secondary)' }} />
        {items.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2" style={{ '--tw-ring-color': 'var(--bg-app)' }}>
            {items.length > 99 ? '99+' : items.length}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] surface-card rounded-2xl shadow-premium-lg z-40 overflow-hidden origin-top-right"
          >
            <div className="px-4 pt-3.5 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
                {items.length > 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700">{items.length}</span>}
              </div>
              {tabs.length > 2 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {tabs.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSeverity(t)}
                      className={clsx(
                        'text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors',
                        active === t ? 'bg-brand-gradient text-white' : 'hover:bg-[var(--hover-tint)]'
                      )}
                      style={active === t ? undefined : { color: 'var(--text-secondary)' }}
                    >
                      {t === 'all' ? 'All' : `${LABELS[t]} · ${counts[t]}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-9 text-sm" style={{ color: 'var(--text-muted)' }}>
                <CheckCircle2 size={22} className="text-emerald-500" />
                You&rsquo;re all caught up.
              </div>
            ) : (
              <div className="thin-scroll max-h-80 overflow-y-auto divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {shown.map((n, i) => {
                  const Icon = ICONS[n.severity] || Info;
                  return (
                    <div key={i} className="flex gap-3 px-4 py-3 transition-colors hover:bg-[var(--hover-tint)]" style={{ borderColor: 'var(--border-subtle)' }}>
                      <span className={clsx('w-7 h-7 rounded-full flex items-center justify-center shrink-0', COLORS[n.severity] || COLORS.info)}>
                        <Icon size={14} />
                      </span>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{n.message}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NotificationBell;
