import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, totalPages, total, limit, onPageChange }) {
  if (!totalPages || totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Showing <strong>{from}</strong>-<strong>{to}</strong> of <strong>{total}</strong>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border transition-colors duration-200 disabled:opacity-40 enabled:hover:border-gold-300 enabled:hover:text-gold-700 enabled:hover:bg-[var(--gold-tint)]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
        <button
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border transition-colors duration-200 disabled:opacity-40 enabled:hover:border-gold-300 enabled:hover:text-gold-700 enabled:hover:bg-[var(--gold-tint)]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
