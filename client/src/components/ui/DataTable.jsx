import { TableSkeleton } from './Skeleton.jsx';
import EmptyState from './EmptyState.jsx';
import Pagination from './Pagination.jsx';

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
    <div className="surface-card rounded-xl2 shadow-premium overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              {columns.map((col) => (
                <th key={col.key} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row[keyField]}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'cursor-pointer hover:bg-gold-50/50 transition-colors' : 'hover:bg-graphite-50/50 transition-colors'}
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-3.5 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                    {col.render ? col.render(row) : row[col.key]}
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
    </div>
  );
}

export default DataTable;
