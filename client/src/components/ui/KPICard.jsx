import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
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

export function KPICard({ label, value, prefix = '', suffix = '', change, changeLabel = 'vs yesterday', icon: Icon, loading, accent = 'gold' }) {
  const animated = useAnimatedNumber(loading ? 0 : value);

  if (loading) return <CardSkeleton />;

  const positive = (change || 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="surface-card rounded-xl2 p-5 shadow-premium hover:shadow-premium-lg transition-shadow duration-300"
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
        {prefix}{formatNumber(Math.round(animated))}{suffix}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 text-xs">
          <span className={clsx('flex items-center gap-0.5 font-medium', positive ? 'text-emerald-600' : 'text-rose-600')}>
            {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(change).toFixed(1)}%
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{changeLabel}</span>
        </div>
      )}
    </motion.div>
  );
}

export default KPICard;
