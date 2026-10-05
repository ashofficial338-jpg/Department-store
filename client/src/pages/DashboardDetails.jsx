import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../utils/permissions.js';
import { PageHeader } from '../components/ui/index.js';
import { TableSkeleton } from '../components/ui/Skeleton.jsx';
import DashboardFilters from '../components/dashboard/DashboardFilters.jsx';
import ExportMenu from '../components/dashboard/ExportMenu.jsx';
import { readFilters, toQueryString } from '../components/dashboard/filters.js';
import { dashboardService } from '../services/index.js';
import { formatCurrency, formatNumber, formatDate, formatDateTime } from '../utils/format.js';

// Which filters are meaningful for each dataset (the API accepts all; irrelevant ones are hidden here).
const FILTERS_FOR = {
  sales: ['range', 'product', 'category', 'paymentMethod'],
  'revenue-trend': ['range', 'product', 'category', 'paymentMethod'],
  'payment-methods': ['range', 'paymentMethod'],
  'category-sales': ['range', 'product', 'category', 'paymentMethod'],
  'top-products': ['range', 'product', 'category', 'stockStatus', 'paymentMethod'],
  expenses: ['range', 'expenseCategory'],
  'daily-expenses': ['range', 'expenseCategory'],
  'stock-value': ['range', 'product', 'category', 'stockStatus'],
  'low-stock': ['product', 'category', 'stockStatus'],
  itr: ['range', 'product', 'category', 'stockStatus'],
  'holding-period': ['range', 'product', 'category', 'stockStatus'],
  'product-roi': ['range', 'product', 'category', 'stockStatus'],
  'daily-profit': ['range', 'product', 'category', 'stockStatus'],
  'gross-margin': ['range', 'product', 'category', 'stockStatus'],
  ebitda: ['range'],
  'daily-purchases': ['range'],
  'daily-sales': ['range', 'product', 'category', 'paymentMethod'],
  receivables: [],
  payables: [],
  summary: ['range', 'product', 'category', 'stockStatus', 'paymentMethod', 'expenseCategory'],
};
const DEFAULT_RANGE = { 'daily-sales': 'today', 'daily-expenses': 'today', 'daily-purchases': 'today', 'daily-profit': 'today' };
const NUMERIC = ['int', 'number', 'currency', 'percent', 'days'];

function formatCell(value, type) {
  if (value === null || value === undefined || value === '') return NUMERIC.includes(type) ? '—' : '-';
  switch (type) {
    case 'currency': return formatCurrency(value, { decimals: 2 });
    case 'int': return formatNumber(Math.round(value));
    case 'number': return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value);
    case 'percent': return `${Number(value).toFixed(1)}%`;
    case 'days': return `${Number(value).toFixed(1)} days`;
    case 'date': return formatDate(value);
    case 'datetime': return formatDateTime(value);
    default: return String(value);
  }
}

export function DashboardDetails() {
  const { metric } = useParams();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canFilter = hasPermission(user, 'dashboard.filters');
  const canExport = hasPermission(user, 'dashboard.export');
  const filters = useMemo(() => readFilters(searchParams, canFilter), [searchParams, canFilter]);
  const filterKey = JSON.stringify(filters);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    dashboardService.details(metric, filters)
      .then((r) => { if (!cancelled) { setData(r.data); setSort(null); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setData(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, filterKey]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let list = q
      ? data.rows.filter((r) => data.columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q)))
      : data.rows;
    if (sort) {
      const { key, dir } = sort;
      list = [...list].sort((a, b) => {
        const x = a[key]; const y = b[key];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
      });
    }
    return list;
  }, [data, query, sort]);

  // Back to the dashboard keeps the same filters (date filters of "today" cards are not carried back).
  const backTo = `/dashboard${toQueryString(DEFAULT_RANGE[metric] ? Object.fromEntries(Object.entries(filters).filter(([k]) => !['range', 'from', 'to'].includes(k))) : filters)}`;
  const shownFilters = FILTERS_FOR[metric] || ['range'];

  return (
    <div>
      <PageHeader
        title={data?.title || 'Details'}
        crumbs={[{ label: 'Dashboard', to: backTo }, { label: data?.title || 'Details' }]}
        actions={(
          <>
            <Link to={backTo} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:border-gold-400" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <ArrowLeft size={15} /> Dashboard
            </Link>
            {canExport && data && <ExportMenu metric={metric} filters={filters} />}
          </>
        )}
      />

      {canFilter && shownFilters.length > 0 && (
        <DashboardFilters
          key={metric}
          value={filters}
          onChange={(next) => setSearchParams(next, { replace: true })}
          defaultRange={DEFAULT_RANGE[metric] || 'this_month'}
          show={shownFilters}
        />
      )}

      {error && (
        <div className="surface-card rounded-xl2 shadow-premium p-6 text-sm text-rose-600">{error}</div>
      )}

      {data && (
        <>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{data.filtersText}</p>

          {data.summary?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
              {data.summary.map((s) => (
                <div key={s.label} className="surface-card rounded-xl2 p-4 shadow-premium">
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                  <div className="text-xl font-display font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCell(s.value, s.type)}</div>
                </div>
              ))}
            </div>
          )}

          {(data.formula || data.note) && (
            <div className="flex gap-2 items-start rounded-xl px-4 py-3 mb-5 text-xs" style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-secondary)' }}>
              <Info size={14} className="text-gold-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                {data.formula && <div><span className="font-semibold">Formula: </span>{data.formula}</div>}
                {data.note && <div>{data.note}</div>}
              </div>
            </div>
          )}
        </>
      )}

      <div className="surface-card rounded-xl2 shadow-premium overflow-hidden">
        {data && data.rows.length > 10 && (
          <div className="p-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="relative max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search these rows…"
                className="w-full rounded-lg border pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
              />
            </div>
          </div>
        )}
        {loading && !data ? <TableSkeleton /> : data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                  {data.columns.map((c) => {
                    const numeric = NUMERIC.includes(c.type);
                    const active = sort?.key === c.key;
                    return (
                      <th key={c.key} className={`px-4 py-2.5 text-xs font-semibold uppercase whitespace-nowrap ${numeric ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-muted)' }}>
                        <button
                          type="button"
                          className="uppercase hover:text-gold-600"
                          onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? -s.dir : (numeric ? -1 : 1) }))}
                        >
                          {c.label}{active ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={r.emphasis ? 'font-semibold' : undefined} style={{ borderBottom: '1px solid var(--border-subtle)', background: r.emphasis ? 'var(--bg-surface-muted)' : undefined }}>
                    {data.columns.map((c) => {
                      const type = c.type === 'mixed' ? r.type : c.type;
                      const negative = type === 'currency' && Number(r[c.key]) < 0;
                      return (
                        <td key={c.key} className={`px-4 py-2.5 whitespace-nowrap ${NUMERIC.includes(type) || c.type === 'mixed' ? 'text-right tabular-nums' : ''} ${negative ? 'text-rose-600' : ''}`}>
                          {formatCell(r[c.key], type)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={data.columns.length} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No records for the selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{formatNumber(rows.length)} of {formatNumber(data.rows.length)} rows</p>}
    </div>
  );
}

export default DashboardDetails;
