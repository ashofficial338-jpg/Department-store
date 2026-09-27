import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PageHeader({ title, crumbs = [], actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        {crumbs.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {c.to ? <Link to={c.to} className="hover:text-gold-600">{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <ChevronRight size={12} />}
              </span>
            ))}
          </div>
        )}
        <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export default PageHeader;
