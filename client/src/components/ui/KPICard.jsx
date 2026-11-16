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
        'group surface-card spotlight gold-ring hover-deep rounded-xl2 p-5',
        clickable ? 'cursor-pointer focus-visible:outline-none' : ''
      )}
    >
      {/* Corner glow that blooms on hover. */}
      <div className={clsx(
        'pointer-events-none absolute -top-12 -right-12 w-32 h-32 rounded-full blur-2xl transition-opacity duration-500 opacity-40 group-hover:opacity-100',
        gold ? 'bg-gold-400/20' : 'bg-graphite-400/15'
      )}
      />
      <div className="relative flex items-start justify-between mb-4">
        <span className="eyebrow pr-2 leading-snug">{label}</span>
        {Icon && (
          <span className={clsx(
            'relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-500 ease-luxe group-hover:scale-110 group-hover:-rotate-6',
            gold ? 'bg-gold-gradient text-graphite-950 shadow-gold' : 'text-white shadow-[0_8px_18px_-8px_rgba(20,21,27,0.7)]'
          )}
            style={gold ? undefined : { background: 'linear-gradient(135deg, #5F6373, #1E2028)' }}
          >
            <Icon size={17} strokeWidth={2.2} />
            <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/30" />
          </span>
        )}
      </div>
      <div className="relative kpi-value text-[1.7rem] leading-none font-display font-semibold mb-3 tracking-tight" style={{ color: 'var(--text-primary)' }}>
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
