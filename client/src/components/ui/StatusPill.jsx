import clsx from 'clsx';

const STATES = {
  checking: { dot: 'bg-amber-400', text: 'Checking server…', short: 'Checking' },
  online: { dot: 'bg-emerald-400', text: 'All systems online', short: 'Online' },
  offline: { dot: 'bg-rose-500', text: 'Server unreachable', short: 'Offline' },
};

// Live API status indicator. `tone="dark"` for dark panels (sidebar, hero banners).
// `compact` shows only the dot (with the label as a tooltip).
export function StatusPill({ status, onRetry, tone = 'light', compact = false, className }) {
  const s = STATES[status] || STATES.checking;
  const dark = tone === 'dark';
  const title = status === 'offline' ? 'The API server is not responding. Click to check again.' : `${s.text} · click to re-check`;
  return (
    <button
      type="button"
      onClick={onRetry}
      title={title}
      aria-label={title}
      className={clsx(
        'inline-flex items-center gap-2 rounded-full text-[11px] font-semibold border transition-colors whitespace-nowrap',
        compact ? 'p-2' : 'px-3 py-1.5',
        dark ? 'border-white/10 bg-white/[0.06] text-graphite-200 hover:bg-white/10' : 'hover:!border-gold-400',
        className,
      )}
      style={dark ? undefined : { borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
    >
      <span className="relative flex h-2 w-2">
        {status !== 'offline' && <span className={`absolute inline-flex h-full w-full rounded-full ${s.dot} opacity-60 animate-ping motion-reduce:animate-none`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
      </span>
      {!compact && s.text}
    </button>
  );
}

export default StatusPill;
