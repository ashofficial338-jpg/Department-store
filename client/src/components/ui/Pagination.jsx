import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, totalPages, total, limit, onPageChange }) {
  if (!totalPages || totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between pt-4 mt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Showing <strong>{from}</strong>-<strong>{to}</strong> of <strong>{total}</strong>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-graphite-50"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-graphite-50"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
