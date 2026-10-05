import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { formatNumber } from '../../utils/format.js';
import { CardSkeleton } from './Skeleton.jsx';

function useAnimatedNumber(target, duration = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = null;
    const from = 0;
    const to = Number(target) || 0;
    let raf;
    function step(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
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

// `value` null/undefined renders "—" (e.g. ITR with no inventory). When `onClick` is given the card
// becomes a keyboard-accessible button that opens its detail page.
export function KPICard({
  label, value, prefix = '', suffix = '', decimals = 0, change, changeLabel = 'vs yesterday', hint,
  icon: Icon, loading, accent = 'gold', onClick, title,
}) {
  const hasValue = value !== null && value !== undefined && !Number.isNaN(Number(value));
  const animated = useAnimatedNumber(loading || !hasValue ? 0 : value);

  if (loading) return <CardSkeleton />;

  const positive = (change || 0) >= 0;
  const clickable = typeof onClick === 'function';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={title}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={clsx(
        'group surface-card rounded-xl2 p-5 shadow-premium transition-all duration-300 border border-transparent',
        clickable ? 'cursor-pointer hover:shadow-premium-lg hover:border-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400' : 'hover:shadow-premium-lg'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>{label}</span>
        {Icon && (
          <span className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', accent === 'gold' ? 'bg-gold-100 text-gold-700' : 'bg-graphite-100 text-graphite-700')}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <div className="text-2xl font-display font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
        {hasValue ? <>{prefix}{formatAnimated(animated, decimals)}{suffix}</> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </div>
      <div className="flex items-center justify-between gap-2 min-h-[18px]">
        {change !== undefined ? (
          <div className="flex items-center gap-1 text-xs">
            <span className={clsx('flex items-center gap-0.5 font-medium', positive ? 'text-emerald-600' : 'text-rose-600')}>
              {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(change).toFixed(1)}%
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{changeLabel}</span>
          </div>
        ) : (
          <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{hint}</span>
        )}
        {clickable && <ChevronRight size={14} className="shrink-0 text-gold-600 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />}
      </div>
    </motion.div>
  );
}

export default KPICard;
