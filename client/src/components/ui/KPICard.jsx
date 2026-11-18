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
export function KPICard({
  label, value, prefix = '', suffix = '', decimals = 0, change, changeLabel = 'vs yesterday', hint,
  icon: Icon, loading, accent = 'gold', onClick, title, delay = 0,
}) {
  const hasValue = value !== null && value !== undefined && !Number.isNaN(Number(value));
  const animated = useAnimatedNumber(loading || !hasValue ? 0 : value);

  if (loading) return <CardSkeleton />;

  const positive = (change || 0) >= 0;
  const clickable = typeof onClick === 'function';
  const gold = accent === 'gold';

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
      initial="hidden"
      animate="show"
      whileHover={clickable ? { y: -2, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } } : undefined}
      whileTap={clickable ? { scale: 0.985 } : undefined}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay }}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={title}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={clsx(
        'group relative surface-card rounded-xl2 p-5',
        clickable ? 'hover-deep hover:border-gold-200 dark:hover:border-gold-800' : '',
        clickable ? 'cursor-pointer focus-visible:outline-none' : ''
      )}
    >
      <div className="relative flex items-start justify-between mb-3">
        <span className="text-[13px] font-medium pr-2 leading-snug" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {Icon && (
          <span className={clsx(
            'relative w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset transition-colors duration-300',
            gold ? 'bg-gold-50 text-gold-600 ring-gold-600/15' : 'bg-graphite-100 text-graphite-600 ring-graphite-500/15'
          )}
          >
            <Icon size={18} strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="relative kpi-value text-[1.65rem] leading-none font-display font-bold mb-3 tracking-tight" style={{ color: 'var(--text-primary)' }}>
        {hasValue
          ? <>{prefix && <span className="font-sans text-[0.72em] font-semibold mr-1 opacity-60 align-[0.12em]">{prefix}</span>}{formatAnimated(animated, decimals)}{suffix && <span className="text-[0.6em] ml-0.5 font-sans font-semibold opacity-60">{suffix}</span>}</>
          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </div>
      <div className="relative flex items-center justify-between gap-2 min-h-[20px]">
        {change !== undefined ? (
          <div className="flex items-center gap-1.5 text-xs">
            <span className={clsx(
              'inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-md',
              positive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
            )}
            >
              {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(change).toFixed(1)}%
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{changeLabel}</span>
          </div>
        ) : (
          <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{hint}</span>
        )}
        {clickable && (
          <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gold-600 bg-gold-50 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 transition-all duration-300 ease-luxe">
            <ArrowRight size={13} />
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default KPICard;
