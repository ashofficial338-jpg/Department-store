import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { formatNumber } from '../../utils/format.js';
import { CardSkeleton } from './Skeleton.jsx';

function useAnimatedNumber(target, duration = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = null;
    const from = 0;
    const to = Number(target) || 0;
    let raf;
    function step(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 4;
      setValue(from + (to - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function formatAnimated(n, decimals) {
  if (!decimals) return formatNumber(Math.round(n));
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

// Moves the radial spotlight with the cursor (see .spotlight in index.css).
export function trackSpotlight(e) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

// `value` null/undefined renders "—" (e.g. ITR with no inventory). When `onClick` is given the card
// becomes a keyboard-accessible button that opens its detail page.
// `accent`: 'gold' (default) is the brand accent; anything else renders the quiet neutral icon chip.
export function KPICard({
  label, value, prefix = '', suffix = '', decimals = 0, change, changeLabel = 'vs yesterday', hint,
  icon: Icon, loading, accent = 'gold', onClick, title, delay = 0,
}) {
  const hasValue = value !== null && value !== undefined && !Number.isNaN(Number(value));
  const animated = useAnimatedNumber(loading || !hasValue ? 0 : value);

  if (loading) return <CardSkeleton />;

  const positive = (change || 0) >= 0;
  const clickable = typeof onClick === 'function';
  const branded = accent === 'gold' || accent === 'brand';

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
      initial="hidden"
      animate="show"
      whileHover={{ y: -4, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
      whileTap={clickable ? { scale: 0.985 } : undefined}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={title}
      onClick={onClick}
      onMouseMove={trackSpotlight}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={clsx(
        'group surface-card spotlight brand-ring hover-deep rounded-xl2 p-5',
        clickable ? 'cursor-pointer focus-visible:outline-none' : ''
      )}
    >
      {/* Corner glow that blooms on hover. */}
      <div className={clsx(
        'pointer-events-none absolute -top-14 -right-14 w-36 h-36 rounded-full blur-3xl transition-opacity duration-500 opacity-0 group-hover:opacity-100',
        branded ? 'bg-brand-400/25' : 'bg-accent-400/20'
      )}
      />
      <div className="relative flex items-center justify-between gap-3 mb-4">
        <span className="text-[13px] font-medium leading-snug" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {Icon && (
          <span className={clsx(
            'relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-500 ease-luxe group-hover:scale-110 group-hover:-rotate-6',
            branded ? 'bg-brand-gradient text-white shadow-brand' : 'bg-graphite-100 text-graphite-600'
          )}
          >
            <Icon size={16} strokeWidth={2.2} />
          </span>
        )}
      </div>
      <div className="relative kpi-value text-[1.75rem] leading-none font-display font-bold mb-3 tracking-tight" style={{ color: 'var(--text-primary)' }}>
        {hasValue
          ? <>{prefix && <span className="text-[0.7em] font-semibold mr-0.5 opacity-55 align-[0.08em]">{prefix}</span>}{formatAnimated(animated, decimals)}{suffix && <span className="text-[0.55em] ml-0.5 font-semibold opacity-55">{suffix}</span>}</>
          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </div>
      <div className="relative flex items-center justify-between gap-2 min-h-[22px]">
        {change !== undefined ? (
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <span className={clsx(
              'inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-full shrink-0',
              positive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
            )}
            >
              {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(change).toFixed(1)}%
            </span>
            <span className="truncate" style={{ color: 'var(--text-muted)' }}>{changeLabel}</span>
          </div>
        ) : (
          <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{hint}</span>
        )}
        {clickable && (
          <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-brand-600 bg-brand-50 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 transition-all duration-300 ease-luxe">
            <ArrowRight size={13} />
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default KPICard;
