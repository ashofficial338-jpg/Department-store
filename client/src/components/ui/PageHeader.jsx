import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1];

export function PageHeader({ title, subtitle, crumbs = [], actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {crumbs.length > 0 && (
          <motion.nav
            aria-label="Breadcrumb"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="flex flex-wrap items-center gap-1.5 text-xs font-medium mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {c.to
                  ? <Link to={c.to} className="transition-colors hover:text-brand-600">{c.label}</Link>
                  : <span style={i === crumbs.length - 1 ? { color: 'var(--text-secondary)' } : undefined}>{c.label}</span>}
                {i < crumbs.length - 1 && <ChevronRight size={12} className="opacity-60" />}
              </span>
            ))}
          </motion.nav>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
          className="font-display text-2xl md:text-[1.75rem] leading-tight font-extrabold"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="text-sm mt-1.5 max-w-2xl"
            style={{ color: 'var(--text-secondary)' }}
          >
            {subtitle}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
          className="flex flex-wrap items-center gap-2"
        >
          {actions}
        </motion.div>
      )}
    </div>
  );
}

export default PageHeader;
