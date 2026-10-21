import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, FileSpreadsheet, FileText, Info } from 'lucide-react';
import { SearchBox, Pagination, TableSkeleton } from '../ui/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { advancedReportService } from '../../services/index.js';
import { formatCurrency, formatNumber, formatDate, formatDateTime } from '../../utils/format.js';

const isNum = (t) => ['currency', 'int', 'number', 'percent'].includes(t);

function cell(value, type, row, col) {
  if (value === null || value === undefined || value === '') return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const t = type === 'mixed' ? row.type : type;
  if (col?.suffixFrom) {
    const v = Number(value);
    return <span className={v < 0 ? 'text-rose-600' : 'text-emerald-600'}>{v >= 0 ? '+' : ''}{v.toFixed(1)}{row[col.suffixFrom] === 'points' ? ' pts' : '%'}</span>;
  }
  switch (t) {
    case 'currency': return formatCurrency(value, { decimals: 2 });
    case 'int': return formatNumber(value);
    case 'number': return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    case 'percent': return `${Number(value).toFixed(1)}%`;
    case 'date': return formatDate(value);
    case 'datetime': return formatDateTime(value);
    default: return String(value);
  }
}

function tone(col, row) {
  const v = row[col.key];
  if (col.cf === 'negative' && Number(v) < 0) return 'text-rose-600 font-medium';
  if (col.cf === 'status') return row.status === 'out_of_stock' ? 'text-rose-600 font-semibold' : row.status === 'low_stock' ? 'text-amber-600 font-semibold' : '';
  return '';
}

// Browse any report section with search, column sorting and pagination before exporting it.
export function SectionExplorer({ sections, filters, onExportSection, exporting }) {
  const [active, setActive] = useState(sections[0]?.key);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'desc' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const q = useDebounce(search);
  const filterKey = JSON.stringify(filters);

  useEffect(() => { if (!sections.some((s) => s.key === active)) setActive(sections[0]?.key); }, [sections, active]);
  useEffect(() => { setPage(1); }, [active, q, sort.key, sort.dir, filterKey]);
  useEffect(() => { setSort({ key: null, dir: 'desc' }); setSearch(''); }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setLoading(true); setError(null);
    advancedReportService.section(active, { ...filters, search: q || undefined, sort: sort.key || undefined, dir: sort.dir, page, limit: 25 })
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((e) => { if (!cancelled) { setError(e.message); setData(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, q, sort.key, sort.dir, page, filterKey]);

  const groups = sections.reduce((m, s) => { (m[s.group] = m[s.group] || []).push(s); return m; }, {});
  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  return (
    <div className="surface-card rounded-xl2 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Report explorer</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Browse, search and sort any report before exporting it.</p>
        </div>
        {data && (
          <div className="flex gap-2">
            <button type="button" disabled={!!exporting} onClick={() => onExportSection(active, 'xlsx')} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold hover:border-gold-400 disabled:opacity-50" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <FileSpreadsheet size={14} className="text-emerald-600" /> This table to Excel
            </button>
            <button type="button" disabled={!!exporting} onClick={() => onExportSection(active, 'pdf')} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold hover:border-gold-400 disabled:opacity-50" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <FileText size={14} className="text-rose-600" /> This table to PDF
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 mb-4" role="tablist" aria-label="Report sections">
        {Object.entries(groups).map(([group, list]) => (
          <div key={group} className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0" style={{ color: 'var(--text-muted)' }}>{group}</span>
            {list.map((s) => (
              <button
                key={s.key} type="button" role="tab" aria-selected={active === s.key} onClick={() => setActive(s.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${active === s.key ? 'bg-graphite-900 text-white' : 'border hover:border-gold-400'}`}
                style={active === s.key ? undefined : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              >{s.title}</button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search this report..." className="w-full sm:w-72" />
        {data?.summary?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.summary.slice(0, 6).map((s) => (
              <span key={s.label} className="text-xs rounded-lg px-2.5 py-1.5 capitalize" style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-secondary)' }}>
                {s.label}: <strong style={{ color: 'var(--text-primary)' }}>{cell(s.value, s.type, {})}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <div className="rounded-xl p-4 text-sm bg-rose-50 text-rose-700">{error}</div>}
      {!error && loading && !data && <TableSkeleton rows={8} />}
      {!error && data && (
        <>
          <div className={`overflow-x-auto rounded-xl border transition-opacity ${loading ? 'opacity-60' : ''}`} style={{ borderColor: 'var(--border-subtle)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-surface-muted)' }}>
                  {data.columns.map((c) => (
                    <th key={c.key} scope="col" className={`px-3 py-2.5 text-xs font-semibold uppercase whitespace-nowrap ${isNum(c.type) ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-muted)' }} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort(c.key)} className={`inline-flex items-center gap-1 hover:text-gold-700 ${isNum(c.type) ? 'flex-row-reverse' : ''}`}>
                        {c.label}
                        {sort.key === c.key ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} className="opacity-40" />}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className={r.emphasis ? 'font-semibold' : ''} style={{ borderTop: '1px solid var(--border-subtle)', background: r.emphasis ? 'var(--bg-surface-muted)' : undefined }}>
                    {data.columns.map((c) => (
                      <td key={c.key} className={`px-3 py-2 whitespace-nowrap ${isNum(c.type === 'mixed' ? r.type : c.type) || c.suffixFrom ? 'text-right tabular-nums' : ''} ${tone(c, r)}`} style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }} title={typeof r[c.key] === 'string' ? r[c.key] : undefined}>
                        {cell(r[c.key], c.type, r, c)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!data.rows.length && (
                  <tr><td colSpan={data.columns.length} className="px-3 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>{q ? `Nothing matches "${q}".` : 'No records for the selected period and filters.'}</td></tr>
                )}
              </tbody>
              {data.totals && data.rows.length > 0 && (
                <tfoot>
                  <tr className="font-semibold" style={{ borderTop: '2px solid #D9B97A', background: 'rgba(194,154,86,0.08)' }}>
                    {data.columns.map((c, i) => (
                      <td key={c.key} className={`px-3 py-2.5 whitespace-nowrap ${isNum(c.type) ? 'text-right tabular-nums' : ''}`}>
                        {i === 0 ? `Total${q ? ' (filtered)' : ''}` : data.totals[c.key] !== undefined ? cell(data.totals[c.key], c.type, {}) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <Pagination {...data.pagination} onPageChange={setPage} />
          {data.note && <p className="mt-3 text-xs flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}><Info size={13} className="mt-0.5 shrink-0" />{data.note}</p>}
        </>
      )}
    </div>
  );
}

export default SectionExplorer;
