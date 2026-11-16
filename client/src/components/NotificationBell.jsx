import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, AlertTriangle, Info, XCircle, X, ChevronRight, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { notificationService } from '../services/index.js';

const EASE = [0.22, 1, 0.36, 1];
const ICONS = { critical: XCircle, warning: AlertTriangle, info: Info };
const COLORS = { critical: 'text-rose-600 bg-rose-50', warning: 'text-amber-600 bg-amber-50', info: 'text-sky-600 bg-sky-50' };
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = () => notificationService.list()
      .then((res) => setItems([...(res.data || [])].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3))))
      .catch(() => {});
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const count = items.length;
  const hasCritical = items.some((n) => n.severity === 'critical');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={count ? `Notifications (${count})` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'group relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ease-luxe hover:bg-[var(--hover-tint)] active:scale-95',
          open && 'bg-[var(--gold-tint)]',
        )}
      >
        <Bell size={18} className="origin-top group-hover:animate-bell-ring" style={{ color: open ? '#C29A56' : 'var(--text-secondary)' }} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex">
            {hasCritical && <span className="absolute inset-0 rounded-full bg-rose-500 animate-pulse-ring" />}
            <span className="num relative min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2" style={{ '--tw-ring-color': 'var(--bg-surface)' }}>
              {count > 9 ? '9+' : count}
            </span>
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="popover-panel fixed sm:absolute inset-x-3 sm:inset-x-auto sm:right-0 top-[4.5rem] sm:top-auto sm:mt-2 sm:w-[22rem] rounded-2xl z-40 overflow-hidden origin-top-right"
          >
            <div className="flex items-center justify-between gap-3 pl-4 pr-2.5 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
                {count > 0 && <span className="num text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-gold-100 text-gold-800">{count}</span>}
              </div>
              <button
                type="button" onClick={() => setOpen(false)} aria-label="Close notifications"
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 ease-luxe hover:bg-[var(--hover-tint)] hover:rotate-90 active:scale-90"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={16} />
              </button>
            </div>
            {count === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 size={26} className="mx-auto mb-2 text-emerald-500" />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>You&rsquo;re all caught up</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Nothing needs your attention right now.</p>
              </div>
            ) : (
              <div className="max-h-[min(60vh,24rem)] overflow-y-auto p-1.5">
                {items.map((n, i) => {
                  const Icon = ICONS[n.severity] || Info;
                  const Row = n.link ? 'button' : 'div';
                  return (
                    <motion.div key={n.type || i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: EASE, delay: 0.03 * i }}>
                      <Row
                        {...(n.link ? { type: 'button', onClick: () => { setOpen(false); navigate(n.link); } } : {})}
                        className={clsx('group/row w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition-colors duration-200', n.link && 'hover:bg-[var(--hover-tint)]')}
                      >
                        <span className={clsx('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', COLORS[n.severity] || COLORS.info)}>
                          <Icon size={15} />
                        </span>
                        <p className="flex-1 text-[13px] leading-snug font-medium" style={{ color: 'var(--text-primary)' }}>{n.message}</p>
                        {n.link && <ChevronRight size={14} className="shrink-0 transition-transform duration-300 group-hover/row:translate-x-0.5" style={{ color: 'var(--text-muted)' }} />}
                      </Row>
                    </motion.div>
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
