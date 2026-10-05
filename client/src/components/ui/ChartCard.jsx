import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

// With `onOpen`, the title row gets a "View details" control and the chart body opens the detail page on click.
export function ChartCard({ title, subtitle, actions, children, height = 300, onOpen }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`surface-card rounded-xl2 p-5 shadow-premium border border-transparent transition-colors ${onOpen ? 'hover:border-gold-400' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {onOpen && (
            <button type="button" onClick={onOpen} className="flex items-center gap-0.5 text-xs font-medium text-gold-600 hover:text-gold-500 whitespace-nowrap">
              View details <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
      <div style={{ height }} className={onOpen ? 'cursor-pointer' : undefined} onClick={onOpen}>{children}</div>
    </motion.div>
  );
}

export default ChartCard;
