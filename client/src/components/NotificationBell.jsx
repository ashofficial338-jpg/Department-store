import { useEffect, useRef, useState } from 'react';
import { Bell, AlertTriangle, Info, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { notificationService } from '../services/index.js';

const ICONS = { critical: XCircle, warning: AlertTriangle, info: Info };
const COLORS = { critical: 'text-rose-600 bg-rose-50', warning: 'text-amber-600 bg-amber-50', info: 'text-sky-600 bg-sky-50' };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    notificationService.list().then((res) => setItems(res.data)).catch(() => {});
    const interval = setInterval(() => notificationService.list().then((res) => setItems(res.data)).catch(() => {}), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-lg hover:bg-graphite-100">
        <Bell size={18} style={{ color: 'var(--text-secondary)' }} />
        {items.length > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 surface-card rounded-xl2 shadow-premium-lg z-40 max-h-96 overflow-y-auto">
          <div className="px-4 py-3 border-b font-medium text-sm" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
            Notifications
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>You're all caught up.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {items.map((n, i) => {
                const Icon = ICONS[n.severity] || Info;
                return (
                  <div key={i} className="flex gap-3 px-4 py-3">
                    <span className={clsx('w-7 h-7 rounded-full flex items-center justify-center shrink-0', COLORS[n.severity])}>
                      <Icon size={14} />
                    </span>
                    <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{n.message}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
