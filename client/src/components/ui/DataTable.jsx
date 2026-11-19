import { motion } from 'framer-motion';
import { TableSkeleton } from './Skeleton.jsx';
import EmptyState from './EmptyState.jsx';
import Pagination from './Pagination.jsx';

// Negative money (formatCurrency output such as "−₹1,250.00") is shown in red in every table.
const NEGATIVE_AMOUNT = /^[−-]\s?₹/;
function cellContent(value) {
  return typeof value === 'string' && NEGATIVE_AMOUNT.test(value) ? <span className="amount-negative">{value}</span> : value;
}

export function DataTable({ columns, rows, loading, emptyTitle = 'No records found.', emptyDescription, emptyAction, pagination, onRowClick, keyField = '_id' }) {
  if (loading) {
    return (
      <div className="surface-card rounded-xl2 p-5 shadow-premium">
        <TableSkeleton cols={columns.length} />
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="surface-card rounded-xl2 shadow-premium">
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="surface-card rounded-xl2 overflow-hidden"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-muted)' }}>
              {columns.map((col) => (
                <th key={col.key} scope="col" className="text-left px-4 h-11 text-[11px] font-semibold uppercase whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row[keyField] ?? i}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'cursor-pointer hover:!bg-[var(--gold-tint)] focus-visible:!bg-[var(--gold-tint)]' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                    {cellContent(col.render ? col.render(row) : row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && (
        <div className="px-5 pb-4">
          <Pagination {...pagination} />
        </div>
      )}
    </motion.div>
  );
}

export default DataTable;
