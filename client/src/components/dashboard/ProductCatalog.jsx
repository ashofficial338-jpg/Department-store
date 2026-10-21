import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { ChartCard, SearchBox, FilterSelect, Pagination, StatusBadge, TableSkeleton } from '../ui/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { dashboardService } from '../../services/index.js';
import { formatCurrency, formatNumber } from '../../utils/format.js';

const SORT_OPTIONS = [
  { value: 'revenue', label: 'Top revenue' },
  { value: 'units', label: 'Most units sold' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'price_high', label: 'Price: high to low' },
  { value: 'price_low', label: 'Price: low to high' },
  { value: 'margin', label: 'Highest margin' },
  { value: 'stock_low', label: 'Lowest stock' },
];

const STOCK_BADGE = { in_stock: 'success', low_stock: 'warning', out_of_stock: 'danger' };
const HEADERS = ['Product', 'Brand / Manufacturer', 'Category', 'MRP', 'Selling Price', 'Cost', 'GST / HSN', 'Margin', 'Stock', 'Units Sold', 'Revenue', 'Profit'];

// Full Indian product catalogue on the dashboard: brand, category, prices, GST, stock and period sales.
// Dashboard filters (date range, category, brand, product, stock status) apply through `filters`.
export function ProductCatalog({ filters, onOpenProduct }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('revenue');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const debounced = useDebounce(search);
  const filterKey = JSON.stringify(filters);

  useEffect(() => { setPage(1); }, [debounced, sort, filterKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardService.productCatalog({ ...filters, search: debounced || undefined, sort, page, limit: 10 })
      .then((r) => { if (!cancelled) setResult(r); })
      .catch(() => { if (!cancelled) setResult(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, sort, page, filterKey]);

  const s = result?.summary;
  const subtitle = s
    ? `${formatNumber(s.products)} products · ${formatNumber(s.brands)} brands · ${formatNumber(s.categories)} categories · stock ${formatCurrency(s.stockValue)} · revenue ${formatCurrency(s.revenue)} this period`
    : 'Indian brands with prices, GST, stock and sales';

  return (
    <div className="mb-5">
      <ChartCard
        title="Product Catalogue"
        subtitle={subtitle}
        height="auto"
        actions={(
          <div className="hidden md:flex items-center gap-2">
            <SearchBox value={search} onChange={setSearch} placeholder="Search name, brand, SKU, HSN..." className="w-64" />
            <FilterSelect value={sort} onChange={setSort} options={SORT_OPTIONS} />
          </div>
        )}
      >
        <div className="md:hidden flex flex-col gap-2 mb-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, brand, SKU, HSN..." />
          <FilterSelect value={sort} onChange={setSort} options={SORT_OPTIONS} />
        </div>

        {loading && !result ? <TableSkeleton rows={6} /> : result?.data?.length ? (
          <>
            <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    {HEADERS.map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold uppercase whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((p) => (
                    <tr
                      key={p._id}
                      onClick={onOpenProduct ? () => onOpenProduct(p._id) : undefined}
                      className={onOpenProduct ? 'cursor-pointer hover:bg-gold-500/5' : undefined}
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3 min-w-[220px]">
                          {p.image
                            ? <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" />
                            : <span className="w-10 h-10 rounded-lg bg-gold-50 text-gold-700 flex items-center justify-center shrink-0"><Package size={16} /></span>}
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[240px]" style={{ color: 'var(--text-primary)' }} title={p.name}>{p.name}</div>
                            <Muted>{p.sku} · {p.unit}{p.barcode ? ` · ${p.barcode}` : ''}</Muted>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div>{p.brand}</div>
                        {p.supplier && <Muted>{p.supplier}</Muted>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div>{p.category}</div>
                        {p.subcategory && <Muted>{p.subcategory}</Muted>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatCurrency(p.mrp, { decimals: 2 })}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div>{formatCurrency(p.priceInclGst, { decimals: 2 })}</div>
                        <Muted>{formatCurrency(p.sellingPrice, { decimals: 2 })} ex-GST{p.discountPercent > 0 ? ` · ${p.discountPercent}% off` : ''}</Muted>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatCurrency(p.purchasePrice, { decimals: 2 })}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div>{p.gstRate}%</div>
                        <Muted>HSN {p.hsn || '—'}</Muted>
                      </td>
                      <td className={`px-3 py-2.5 whitespace-nowrap ${p.marginPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{p.marginPercent}%</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{formatNumber(p.stock)}</span>
                          {p.stockStatus !== 'in_stock' && <StatusBadge variant={STOCK_BADGE[p.stockStatus]} label={p.stockStatus === 'low_stock' ? 'Low' : 'Out'} />}
                        </div>
                        <Muted>{formatCurrency(p.stockValue)}</Muted>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatNumber(p.unitsSold)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium">{formatCurrency(p.revenue)}</td>
                      <td className={`px-3 py-2.5 whitespace-nowrap ${p.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(p.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...result.pagination} onPageChange={setPage} />
          </>
        ) : (
          <div className="min-h-[120px] flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {debounced ? `No products match "${debounced}".` : 'No products found.'}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

function Muted({ children }) {
  return <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{children}</div>;
}

export default ProductCatalog;
