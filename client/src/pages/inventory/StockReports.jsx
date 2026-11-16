import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileType2, RotateCcw } from 'lucide-react';
import { PageHeader, DataTable, SearchBox, Button } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { inventoryService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format.js';

const EMPTY = { stockType: 'all', category: '', subcategory: '', brand: '', location: '', status: '', days: '60' };
const DAY_OPTIONS = [{ value: '7', label: 'Next 7 days' }, { value: '30', label: 'Next 30 days' }, { value: '60', label: 'Next 60 days' }, { value: '90', label: 'Next 90 days' }, { value: '365', label: 'Next 1 year' }];
// Location values: "stores" / "dcs" (every store / every DC) or "store:<id>" / "dc:<id>".
const LOCATION_PARAMS = { stores: { locationType: 'store' }, dcs: { locationType: 'dc' } };
const STATUS_TONE = { 'Out of Stock': 'text-rose-600', 'Low Stock': 'text-amber-600', Overstock: 'text-sky-600', 'In Stock': 'text-emerald-600' };
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function formatCell(value, type) {
  if (value === null || value === undefined || value === '') return '-';
  if (type === 'currency') return formatCurrency(value, { decimals: 2 });
  if (type === 'int') return formatNumber(value);
  if (type === 'date') return formatDate(value);
  return value;
}

export function StockReports() {
  const [options, setOptions] = useState(null);
  const [filters, setFilters] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);
  const debounced = useDebounce(search);

  useEffect(() => { inventoryService.stockReportOptions().then((r) => setOptions(r.data)).catch((e) => toast.error(e.message)); }, []);

  // The query the preview and both downloads share, so a file always matches what is on screen.
  const params = useMemo(() => {
    const [kind, id] = filters.location.split(':');
    return {
      stockType: filters.stockType,
      category: filters.category || undefined,
      subcategory: filters.subcategory || undefined,
      brand: filters.brand || undefined,
      status: filters.status || undefined,
      search: debounced.trim() || undefined,
      days: filters.stockType === 'expiring' ? filters.days : undefined,
      ...(id ? { [kind === 'store' ? 'store' : 'distributionCenter']: id } : LOCATION_PARAMS[kind]),
    };
  }, [filters, debounced]);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    inventoryService.stockReport({ ...params, page, limit: 25 })
      .then((r) => { if (!stale) setReport(r.data); })
      .catch((e) => { if (!stale) { setReport(null); toast.error(e.message); } })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [params, page]);

  const set = (key) => (value) => {
    setFilters((f) => ({ ...f, [key]: value, ...(key === 'category' ? { subcategory: '' } : {}) }));
    setPage(1);
  };
  const reset = () => { setFilters(EMPTY); setSearch(''); setPage(1); };

  async function download(format) {
    setExporting(format);
    try {
      await inventoryService.exportStockReport(params, format);
      toast.success(`Stock report downloaded (${format === 'pdf' ? 'PDF' : 'Excel'}).`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(null);
    }
  }

  const categories = options?.categories || [];
  const topCategories = categories.filter((c) => !c.parent);
  const subcategories = categories.filter((c) => filters.category && String(c.parent) === filters.category);
  const locationOptions = [
    { value: 'stores', label: 'All Stores' },
    { value: 'dcs', label: 'All Distribution Centers' },
    ...(options?.stores || []).map((s) => ({ value: `store:${s._id}`, label: `Store - ${s.name}` })),
    ...(options?.distributionCenters || []).map((d) => ({ value: `dc:${d._id}`, label: `DC - ${d.name}` })),
  ];
  const stockType = options?.stockTypes.find((t) => t.key === filters.stockType);
  const total = report?.pagination?.total || 0;
  const dirty = search || Object.keys(EMPTY).some((k) => filters[k] !== EMPTY[k]);

  const columns = (report?.columns || []).map((c) => ({
    key: c.key,
    header: c.label,
    render: (r) => {
      if (c.key === 'product') return <span className="font-medium">{r.product}</span>;
      if (c.key === 'sku' || c.key === 'batchNumber') return <span className="font-mono text-xs">{r[c.key]}</span>;
      if (c.key === 'stockStatus') return <span className={`font-semibold ${STATUS_TONE[r.stockStatus] || ''}`}>{r.stockStatus}</span>;
      if (c.key === 'daysLeft') return <span className={r.daysLeft < 0 ? 'text-rose-600 font-semibold' : r.daysLeft <= 15 ? 'text-amber-600 font-semibold' : ''}>{formatNumber(r.daysLeft)}</span>;
      return formatCell(r[c.key], c.type);
    },
  }));

  return (
    <div>
      <PageHeader
        title="Stock Reports"
        subtitle="Filter stock by type, category, brand and location, then download the report as PDF or Excel."
        crumbs={[{ label: 'Inventory' }, { label: 'Stock Reports' }]}
        actions={(
          <>
            <Button variant="outline" icon={FileType2} loading={exporting === 'pdf'} disabled={!!exporting || loading || !total} onClick={() => download('pdf')}>Download PDF</Button>
            <Button variant="gold" icon={FileSpreadsheet} loading={exporting === 'xlsx'} disabled={!!exporting || loading || !total} onClick={() => download('xlsx')}>Download Excel</Button>
          </>
        )}
      />

      <FilterBar>
        <FilterSelect label="Stock type" value={filters.stockType} onChange={set('stockType')} options={(options?.stockTypes || [{ key: 'all', label: 'All Stock' }]).map((t) => ({ value: t.key, label: t.label }))} />
        {filters.stockType === 'expiring' && <FilterSelect label="Expiry window" value={filters.days} onChange={set('days')} options={DAY_OPTIONS} />}
        <FilterSelect value={filters.category} onChange={set('category')} placeholder="All Categories" options={topCategories.map((c) => ({ value: c._id, label: c.name }))} />
        {subcategories.length > 0 && <FilterSelect value={filters.subcategory} onChange={set('subcategory')} placeholder="All Subcategories" options={subcategories.map((c) => ({ value: c._id, label: c.name }))} />}
        <FilterSelect value={filters.brand} onChange={set('brand')} placeholder="All Brands" options={(options?.brands || []).map((b) => ({ value: b._id, label: b.name }))} />
        <FilterSelect value={filters.location} onChange={set('location')} placeholder="All Locations" options={locationOptions} />
        <FilterSelect value={filters.status} onChange={set('status')} placeholder="Any Product Status" options={(options?.productStatuses || []).map((s) => ({ value: s, label: titleCase(s) }))} />
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search product, SKU or barcode..." className="w-64" />
        {dirty && <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset}>Reset</Button>}
      </FilterBar>

      {stockType && <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{stockType.label}: {stockType.description}.</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {(report?.summary || [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }]).map((s) => (
          <div key={s.key} className="surface-card rounded-xl2 px-5 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>{s.label || ' '}</div>
            <div className="mt-1.5 text-xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{s.label ? formatCell(s.value, s.type) : ' '}</div>
          </div>
        ))}
      </div>

      <DataTable
        loading={loading}
        rows={report?.data || []}
        keyField="id"
        columns={columns.length ? columns : [{ key: 'product', header: 'Product' }]}
        emptyTitle="No stock matches these filters."
        emptyDescription="Change the stock type or clear a filter to see records."
        pagination={report?.pagination ? { ...report.pagination, onPageChange: setPage } : null}
      />
      {report?.note && <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{report.note}</p>}
    </div>
  );
}

export default StockReports;
