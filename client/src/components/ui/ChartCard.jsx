import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

// With `onOpen`, the title row gets a "View details" control and the chart body opens the detail page on click.
export function ChartCard({ title, subtitle, actions, children, height = 300, onOpen }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative surface-card rounded-xl2 p-5 md:p-6 transition-shadow duration-300 ${onOpen ? 'hover-deep' : ''}`}
    >
      <div className="relative flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          {subtitle && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="flex items-center gap-1 text-xs font-semibold text-gold-700 dark:text-gold-300 px-2.5 py-1.5 rounded-lg bg-gold-50 hover:bg-gold-100 transition-colors whitespace-nowrap"
            >
              View details <ArrowUpRight size={13} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          )}
        </div>
      </div>
      <div style={{ height }} className={`relative ${onOpen ? 'cursor-pointer' : ''}`} onClick={onOpen}>{children}</div>
    </motion.div>
  );
}

export default ChartCard;
