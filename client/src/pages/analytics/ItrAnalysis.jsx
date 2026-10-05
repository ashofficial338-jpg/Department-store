import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import {
  Info, RotateCcw, Search, ChevronDown, ArrowUpRight, ArrowDownRight, Minus, Gauge, Hourglass, Boxes, Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { hasPermission } from '../../utils/permissions.js';
import { PageHeader, StatusBadge } from '../../components/ui/index.js';
import { CardSkeleton, TableSkeleton } from '../../components/ui/Skeleton.jsx';
import ExportMenu from '../../components/dashboard/ExportMenu.jsx';
import { trackSpotlight } from '../../components/ui/KPICard.jsx';
import { dashboardService } from '../../services/index.js';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format.js';
import { GRID, AXIS_TEXT, TOOLTIP_PROPS } from '../../charts/palette.js';

const EASE = [0.22, 1, 0.36, 1];
const WINDOWS = [3, 6, 12];
// Validated categorical trio (see index.css): one colour per window, used identically on every chart and in the table.
const WINDOW_COLOR = { 3: 'var(--itr-3)', 6: 'var(--itr-6)', 12: 'var(--itr-12)' };
const CLASS_BADGE = { fast: 'success', healthy: 'info', slow: 'warning', very_slow: 'danger', non_moving: 'danger', no_stock: 'neutral' };
const PAGE_SIZE = 15;

const fmtItr = (v, digits = 2) => (v == null ? '—' : `${Number(v).toFixed(digits)}×`);

function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.55, ease: EASE }}
      onMouseMove={trackSpotlight}
      className={`surface-card spotlight hover-deep rounded-xl2 p-5 md:p-6 ${className}`}
    >
      {(title || right) && (
        <div className="relative flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display text-lg font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            {subtitle && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      <div className="relative">{children}</div>
    </motion.section>
  );
}

function WindowLegend() {
  return (
    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
      {WINDOWS.map((n) => (
        <span key={n} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: WINDOW_COLOR[n] }} /> {n} months
        </span>
      ))}
    </div>
  );
}

function SelectField({ label, value, onChange, children, disabled }) {
  return (
    <label className="flex flex-col gap-1 min-w-[170px]">
      <span className="eyebrow !text-[10px]">{label}</span>
      <select
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors hover:border-gold-400 focus:outline-none disabled:opacity-50"
        style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}
      >
        {children}
      </select>
    </label>
  );
}

function PeriodToggle({ value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow !text-[10px]">Time period</span>
      <div role="radiogroup" aria-label="Time period" className="relative inline-flex p-1 rounded-xl border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-muted)' }}>
        {WINDOWS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className="relative px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors"
            style={{ color: value === n ? '#0B0C10' : 'var(--text-secondary)' }}
          >
            {value === n && <motion.span layoutId="itr-period" className="absolute inset-0 rounded-lg bg-gold-gradient shadow-gold" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="relative">{n} months</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function WindowTile({ n, s, active, onSelect, delay }) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      onMouseMove={trackSpotlight}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.3 } }}
      transition={{ duration: 0.55, ease: EASE, delay }}
      aria-pressed={active}
      className={`group surface-card spotlight gold-ring hover-deep rounded-xl2 p-5 text-left ${active ? 'is-active' : ''}`}
    >
      <div className="relative flex items-center justify-between mb-3">
        <span className="eyebrow flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: WINDOW_COLOR[n] }} /> ITR · {n} months
        </span>
        {active && <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gold-700 bg-gold-50 px-2 py-0.5 rounded-full">Selected</span>}
      </div>
      <div className="relative font-display text-[2.1rem] leading-none font-semibold kpi-value" style={{ color: 'var(--text-primary)' }}>{fmtItr(s?.itr)}</div>
      <div className="relative mt-3 grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <div><div className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{fmtItr(s?.annualised, 1)}</div>annualised</div>
        <div><div className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{s?.daysOfInventory ?? '—'} days</div>of inventory</div>
      </div>
      <div className="relative mt-3 pt-3 border-t text-[11px]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
        {s ? `${formatDate(s.from)} – ${formatDate(s.to)}` : ''}
      </div>
    </motion.button>
  );
}

function TrendCell({ row }) {
  if (row.trendPct == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const Icon = row.trend === 'rising' ? ArrowUpRight : row.trend === 'falling' ? ArrowDownRight : Minus;
  const cls = row.trend === 'rising' ? 'text-emerald-700 bg-emerald-50' : row.trend === 'falling' ? 'text-rose-700 bg-rose-50' : 'text-graphite-600 bg-graphite-100';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold ${cls}`} title="Annualised 3-month ITR compared with 12-month">
      <Icon size={12} /> {row.trendPct > 0 ? '+' : ''}{row.trendPct}%
    </span>
  );
}

// Three thin bars on the annualised scale so the 3/6/12-month ITRs of a product compare at a glance.
function WindowBars({ row, max }) {
  return (
    <div className="flex flex-col gap-[3px] w-24" aria-hidden>
      {WINDOWS.map((n) => {
        const v = row.windows[n].annualised || 0;
        return <span key={n} className="h-[5px] rounded-full" style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: WINDOW_COLOR[n] }} />;
      })}
    </div>
  );
}

function ProductDetail({ row, labels }) {
  const data = row.monthly.map((v, i) => ({ i, label: labels[i] || `M${i + 1}`, itr: v }));
  return (
    <div className="sticky left-0 w-[min(100%,calc(100vw-22rem))] max-w-[1080px] flex flex-col gap-4 px-5 py-5" style={{ background: 'var(--bg-surface-muted)' }}>
      <div>
        <div className="eyebrow mb-2">Monthly ITR · last 12 months</div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_PROPS} formatter={(v) => [fmtItr(v), 'Monthly ITR']} />
              <Line type="monotone" dataKey="itr" stroke="var(--itr-3)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: 'var(--itr-3)' }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-2xl">
        {WINDOWS.map((n) => (
          <div key={n} className="rounded-xl p-3 border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2 h-2 rounded-sm" style={{ background: WINDOW_COLOR[n] }} />{n}M
            </div>
            <div className="font-display text-lg font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{fmtItr(row.windows[n].itr)}</div>
            <div className="text-[11px] mt-1 space-y-0.5" style={{ color: 'var(--text-muted)' }}>
              <div>{formatNumber(row.windows[n].units)} units</div>
              <div>COGS {formatCurrency(row.windows[n].cogs)}</div>
              <div>Avg inv {formatCurrency(row.windows[n].avgInventory)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ItrAnalysis() {
  const { user } = useAuth();
  const canFilter = hasPermission(user, 'dashboard.filters');
  const canExport = hasPermission(user, 'dashboard.export');
  const [params, setParams] = useSearchParams();
  const period = WINDOWS.includes(Number(params.get('period'))) ? Number(params.get('period')) : 12;
  const filters = useMemo(() => {
    if (!canFilter) return {};
    const f = {};
    ['product', 'category', 'brand'].forEach((k) => { if (params.get(k)) f[k] = params.get(k); });
    return f;
  }, [params, canFilter]);
  const filterKey = JSON.stringify(filters);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState(null);
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sort, setSort] = useState({ key: 'annualised', dir: -1 });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (canFilter) dashboardService.filterOptions().then((r) => setOptions(r.data)).catch(() => {});
  }, [canFilter]);

  // Data depends on product/category/brand only; the period re-ranks client-side without a refetch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardService.itrAnalysis({ ...filters, period })
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((err) => toast.error(err.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { setPage(1); }, [query, classFilter, sort, filterKey, period]);

  const classOf = (r) => {
    const w = r.windows[period];
    if (!w.units) return r.currentQty > 0 ? 'non_moving' : 'no_stock';
    const a = w.annualised ?? 0;
    return a >= 12 ? 'fast' : a >= 6 ? 'healthy' : a >= 2 ? 'slow' : 'very_slow';
  };

  const rows = useMemo(() => (data?.rows || []).map((r) => ({
    ...r, cls: classOf(r), annualised: r.windows[period].annualised, days: r.windows[period].daysOfInventory,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [data, period]);

  const counts = useMemo(() => {
    const c = {};
    rows.forEach((r) => { c[r.cls] = (c[r.cls] || 0) + 1; });
    return c;
  }, [rows]);

  const ranked = useMemo(() => rows.filter((r) => r.annualised != null).sort((a, b) => b.annualised - a.annualised), [rows]);
  const fastest = ranked.slice(0, 10);
  const slowest = ranked.slice(-10).reverse();
  const maxAnnual = Math.max(1, ...rows.flatMap((r) => WINDOWS.map((n) => r.windows[n].annualised || 0)));

  const tableRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((r) => (!classFilter || r.cls === classFilter)
      && (!q || `${r.name} ${r.sku} ${r.brand} ${r.category}`.toLowerCase().includes(q)));
    const val = (r) => (sort.key === 'name' || sort.key === 'category' || sort.key === 'brand' ? r[sort.key]
      : sort.key.startsWith('itr') ? r[sort.key] : r[sort.key]);
    list = [...list].sort((a, b) => {
      const x = val(a); const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir;
    });
    return list;
  }, [rows, query, classFilter, sort]);
  const pageCount = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
  const pageRows = tableRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Product list narrows to the chosen category/brand.
  const productOptions = useMemo(() => (options?.products || []).filter((p) => (!filters.brand || String(p.brand) === filters.brand)
    && (!filters.category || [String(p.category), String(p.subcategory)].includes(filters.category))), [options, filters.brand, filters.category]);

  const s = data?.summary;
  const selectProduct = (id) => { if (canFilter) update({ product: id }); };
  const sortBtn = (key, label, align = 'left') => (
    <th className={`px-3 py-3 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button type="button" className="uppercase font-bold text-[11px] tracking-[0.06em] hover:text-gold-600" style={{ color: 'var(--text-muted)' }}
        onClick={() => setSort((p) => ({ key, dir: p.key === key ? -p.dir : (['name', 'category', 'brand'].includes(key) ? 1 : -1) }))}
      >
        {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  const trendData = data?.trend || [];
  const exportFilters = { ...filters, period };

  return (
    <div>
      <PageHeader
        title="Product-wise ITR Analysis"
        subtitle="How quickly each product's stock turns into sales over the last 3, 6 and 12 months."
        crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'ITR Analysis' }]}
        actions={canExport ? <ExportMenu metric="itr-analysis" filters={exportFilters} label="Export analysis" /> : null}
      />

      {/* Controls: one row above the charts. */}
      <div className="surface-card rounded-xl2 p-4 mb-6 flex flex-wrap items-end gap-4">
        <PeriodToggle value={period} onChange={(n) => update({ period: n })} />
        {canFilter && (
          <>
            <SelectField label="Category" value={filters.category} onChange={(v) => update({ category: v, product: '' })}>
              <option value="">All categories</option>
              {(options?.categories || []).filter((c) => !c.parent).map((parent) => (
                <optgroup key={parent._id} label={parent.name}>
                  <option value={parent._id}>All {parent.name}</option>
                  {(options?.categories || []).filter((c) => String(c.parent) === String(parent._id)).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </optgroup>
              ))}
            </SelectField>
            <SelectField label="Brand" value={filters.brand} onChange={(v) => update({ brand: v, product: '' })}>
              <option value="">All brands</option>
              {(options?.brands || []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </SelectField>
            <SelectField label="Product" value={filters.product} onChange={(v) => update({ product: v })}>
              <option value="">All products ({productOptions.length})</option>
              {productOptions.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </SelectField>
            {Object.keys(filters).length > 0 && (
              <button type="button" onClick={() => update({ product: '', category: '', brand: '' })} className="flex items-center gap-1 text-xs font-semibold text-gold-700 hover:text-gold-500 pb-2.5">
                <RotateCcw size={13} /> Reset filters
              </button>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-xs pb-2" style={{ color: 'var(--text-muted)' }} title="ITR = COGS ÷ Average Inventory. Average Inventory = (inventory at window start + inventory now) ÷ 2, at purchase price. Annualised = ITR × 12 ÷ months.">
          <Info size={13} className="text-gold-600" /> ITR = COGS ÷ Average Inventory
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading && !data ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />) : (
          <>
            {WINDOWS.map((n, i) => <WindowTile key={n} n={n} s={s?.[n]} active={n === period} onSelect={() => update({ period: n })} delay={i * 0.06} />)}
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE, delay: 0.18 }} className="surface-card rounded-xl2 p-5">
              <div className="eyebrow mb-3">Selected period · {period} months</div>
              <div className="space-y-3 text-sm">
                {[
                  { icon: Gauge, label: 'COGS', value: formatCurrency(s?.[period]?.cogs) },
                  { icon: Boxes, label: 'Average inventory', value: formatCurrency(s?.[period]?.avgInventory) },
                  { icon: Hourglass, label: 'Days of inventory', value: `${s?.[period]?.daysOfInventory ?? '—'} days` },
                  { icon: Layers, label: 'Products analysed', value: formatNumber(rows.length) },
                ].map((it) => (
                  <div key={it.label} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}><it.icon size={14} className="text-gold-600" /> {it.label}</span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{it.value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* Trend + movement mix */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <Card
          className="xl:col-span-2"
          title="Monthly ITR trend"
          subtitle={filters.product ? 'Selected product · ITR for each of the last 12 rolling months' : 'All products in view · ITR for each of the last 12 rolling months'}
        >
          <div className="h-72">
            {trendData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 16, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}×`} width={48} />
                  <Tooltip
                    {...TOOLTIP_PROPS}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const m = payload[0].payload;
                      return (
                        <div style={TOOLTIP_PROPS.contentStyle}>
                          <div style={TOOLTIP_PROPS.labelStyle}>{formatDate(m.from)} – {formatDate(m.month)}</div>
                          <div style={{ color: 'var(--text-secondary)' }}>ITR <b style={{ color: 'var(--text-primary)' }}>{fmtItr(m.itr, 3)}</b></div>
                          <div style={{ color: 'var(--text-secondary)' }}>COGS {formatCurrency(m.cogs)}</div>
                          <div style={{ color: 'var(--text-secondary)' }}>Avg inventory {formatCurrency(m.avgInventory)}</div>
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="itr" stroke="var(--itr-3)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--itr-3)', stroke: 'var(--bg-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} animationDuration={1200}>
                    <LabelList dataKey="itr" position="top" offset={10} formatter={(v) => (v == null ? '' : v.toFixed(2))} style={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            ) : <Empty loading={loading} />}
          </div>
        </Card>

        <Card title="Movement mix" subtitle={`Products by annualised ITR · ${period} months`}>
          <div className="space-y-2.5">
            {(data?.classes || []).filter((c) => c.key !== 'no_stock' || counts.no_stock).map((c) => {
              const n = counts[c.key] || 0;
              const pct = rows.length ? (n / rows.length) * 100 : 0;
              const hint = { fast: '≥ 12× a year', healthy: '6–12× a year', slow: '2–6× a year', very_slow: '< 2× a year', non_moving: 'No sales, stock on hand', no_stock: 'No stock, no sales' }[c.key];
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setClassFilter((v) => (v === c.key ? '' : c.key))}
                  className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all duration-300 hover:border-gold-400 ${classFilter === c.key ? '!border-gold-400 bg-gold-50' : ''}`}
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-2"><StatusBadge variant={CLASS_BADGE[c.key]} label={c.label} /></span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{n}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--hover-tint)' }}>
                    <motion.div className="h-full rounded-full bg-gold-gradient" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: EASE }} />
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{hint}</div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Fastest vs slowest */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        {[
          { title: 'Fastest movers', subtitle: `Top 10 by annualised ITR · ${period} months`, data: fastest, color: '#A67F42' },
          { title: 'Slowest movers', subtitle: `Bottom 10 by annualised ITR · ${period} months`, data: slowest, color: 'var(--viz-neutral)' },
        ].map((c) => (
          <Card key={c.title} title={c.title} subtitle={c.subtitle}>
            <div style={{ height: Math.max(220, c.data.length * 32) }}>
              {c.data.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={c.data} layout="vertical" margin={{ top: 0, right: 48, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 6" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: AXIS_TEXT }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}×`} />
                    <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} tickFormatter={(v) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)} />
                    <Tooltip {...TOOLTIP_PROPS} formatter={(v) => [fmtItr(v, 1), 'Annualised ITR']} />
                    <Bar dataKey="annualised" fill={c.color} radius={[0, 4, 4, 0]} barSize={14} animationDuration={1100} cursor={canFilter ? 'pointer' : undefined} onClick={(d) => selectProduct(String(d.productId))}>
                      <LabelList dataKey="annualised" position="right" formatter={(v) => `${Number(v).toFixed(1)}×`} style={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty loading={loading} />}
            </div>
          </Card>
        ))}
      </div>

      {/* Category comparison across windows */}
      {!filters.product && (
        <Card
          className="mb-5"
          title="Category comparison"
          subtitle="Annualised ITR per category for each window. Higher means stock turns faster."
          right={<WindowLegend />}
        >
          <div style={{ height: Math.max(260, (data?.categories?.length || 0) * 46) }}>
            {data?.categories?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.categories} layout="vertical" margin={{ top: 0, right: 40, left: 4, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid stroke={GRID} strokeDasharray="3 6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: AXIS_TEXT }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}×`} />
                  <YAxis type="category" dataKey="category" width={170} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_PROPS} formatter={(v, name) => [fmtItr(v, 1), name]} />
                  {WINDOWS.map((n) => (
                    <Bar key={n} dataKey={`a${n}`} name={`${n} months`} fill={WINDOW_COLOR[n]} radius={[0, 4, 4, 0]} barSize={8} animationDuration={1100}>
                      {n === period && <LabelList dataKey={`a${n}`} position="right" formatter={(v) => (v == null ? '' : `${Number(v).toFixed(1)}×`)} style={{ fontSize: 10, fill: 'var(--text-secondary)', fontWeight: 600 }} />}
                      {data.categories.map((c) => <Cell key={c.category} fillOpacity={n === period ? 1 : 0.55} />)}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty loading={loading} />}
          </div>
        </Card>
      )}

      {/* Product comparison table */}
      <Card
        title="Product comparison"
        subtitle="ITR for each window, annualised for fair comparison. Click a row for its monthly trend."
        right={<WindowLegend />}
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product, SKU, brand…"
              className="w-full rounded-xl border pl-8 pr-3 py-2 text-sm focus:outline-none"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
            />
          </div>
          {classFilter && (
            <button type="button" onClick={() => setClassFilter('')} className="text-xs font-semibold text-gold-700 flex items-center gap-1">
              <RotateCcw size={12} /> Showing {data?.classes.find((c) => c.key === classFilter)?.label}: clear
            </button>
          )}
          <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{formatNumber(tableRows.length)} products</span>
        </div>

        {loading && !data ? <TableSkeleton cols={8} /> : (
          <div className="overflow-x-auto -mx-5 md:-mx-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-muted)' }}>
                  {sortBtn('name', 'Product')}
                  {sortBtn('category', 'Category · Brand')}
                  {WINDOWS.map((n) => (
                    <th key={n} className="px-3 py-3 text-right whitespace-nowrap">
                      <button type="button" className="inline-flex items-center gap-1.5 uppercase font-bold text-[11px] tracking-[0.06em] hover:text-gold-600" style={{ color: 'var(--text-muted)' }}
                        onClick={() => setSort((p) => ({ key: `itr${n}`, dir: p.key === `itr${n}` ? -p.dir : -1 }))}
                      >
                        <span className="w-2 h-2 rounded-sm" style={{ background: WINDOW_COLOR[n] }} />ITR {n}M{sort.key === `itr${n}` ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Annualised</th>
                  {sortBtn('days', 'Days of inv.', 'right')}
                  {sortBtn('trendPct', 'Trend', 'right')}
                  <th className="hidden 2xl:table-cell px-3 py-3 text-right"><button type="button" className="uppercase font-bold text-[11px] tracking-[0.06em] hover:text-gold-600" style={{ color: 'var(--text-muted)' }} onClick={() => setSort((p) => ({ key: 'stockValue', dir: p.key === 'stockValue' ? -p.dir : -1 }))}>Stock value{sort.key === 'stockValue' ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>
                  <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Movement</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const open = expanded === String(r.productId);
                  return (
                    <Fragment key={r.productId}>
                      <tr
                        onClick={() => setExpanded(open ? null : String(r.productId))}
                        className="cursor-pointer"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-3 min-w-[210px]">
                            {r.image ? <img src={r.image} alt="" className="w-10 h-10 rounded-lg object-cover border" style={{ borderColor: 'var(--border-subtle)' }} /> : <span className="w-10 h-10 rounded-lg" style={{ background: 'var(--hover-tint)' }} />}
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[230px]" style={{ color: 'var(--text-primary)' }}>{r.name}</div>
                              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.sku}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div style={{ color: 'var(--text-secondary)' }}>{r.category}</div>
                          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.brand}</div>
                        </td>
                        {WINDOWS.map((n) => (
                          <td key={n} className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${n === period ? 'font-semibold' : ''}`} style={{ color: n === period ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {fmtItr(r.windows[n].itr)}
                          </td>
                        ))}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2" title={WINDOWS.map((n) => `${n}M: ${fmtItr(r.windows[n].annualised, 1)} a year`).join(' · ')}>
                            <WindowBars row={r} max={maxAnnual} />
                            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtItr(r.annualised, 1)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{r.days == null ? '—' : `${r.days} d`}</td>
                        <td className="px-3 py-2.5 text-right"><TrendCell row={r} /></td>
                        <td className="hidden 2xl:table-cell px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{formatCurrency(r.stockValue)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge variant={CLASS_BADGE[r.cls]} label={data.classes.find((c) => c.key === r.cls)?.label} /></td>
                        <td className="px-2"><ChevronDown size={15} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} /></td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={12} className="p-0" style={{ background: 'var(--bg-surface-muted)' }}>
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
                              <ProductDetail row={r} labels={trendData.map((m) => m.label)} />
                              {canFilter && !filters.product && (
                                <div className="px-5 pb-4" style={{ background: 'var(--bg-surface-muted)' }}>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); selectProduct(String(r.productId)); }} className="text-xs font-semibold text-gold-700 hover:text-gold-500">
                                    Focus the whole dashboard on this product →
                                  </button>
                                </div>
                              )}
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!pageRows.length && (
                  <tr><td colSpan={12} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No products match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between pt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>Page {page} of {pageCount}</span>
            <div className="flex gap-1.5">
              <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border disabled:opacity-40 hover:border-gold-400" style={{ borderColor: 'var(--border-subtle)' }}>Previous</button>
              <button type="button" disabled={page === pageCount} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border disabled:opacity-40 hover:border-gold-400" style={{ borderColor: 'var(--border-subtle)' }}>Next</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Empty({ loading }) {
  return <div className="h-full min-h-[160px] flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>{loading ? 'Calculating…' : 'No data for these filters.'}</div>;
}

export default ItrAnalysis;
