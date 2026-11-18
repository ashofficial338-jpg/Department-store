import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// Page title block used by every screen: breadcrumbs, title, optional subtitle and right-aligned actions.
// Plain CSS entrance (no framer-motion) so headers never hold a page in a hidden state.
export function PageHeader({ title, subtitle, crumbs = [], actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-6">
      <div className="min-w-0">
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {c.to ? <Link to={c.to} className="transition-colors hover:text-gold-600">{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <ChevronRight size={12} className="opacity-60" />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-[1.5rem] md:text-[1.75rem] leading-tight font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export default PageHeader;
