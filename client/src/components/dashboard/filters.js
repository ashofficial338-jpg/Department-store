// Dashboard filters live in the URL query string so the dashboard and detail pages share them
// (and a filtered view can be bookmarked). Users without the dashboard.filters permission never send them.
export const FILTER_KEYS = ['range', 'from', 'to', 'product', 'category', 'stockStatus', 'expenseCategory', 'paymentMethod'];

export const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' }, { value: 'previous_month', label: 'Previous Month' },
  { value: 'this_year', label: 'This Financial Year' }, { value: 'previous_year', label: 'Previous Financial Year' },
  { value: 'custom', label: 'Custom range…' },
];

export function readFilters(searchParams, enabled) {
  if (!enabled) return {};
  const f = {};
  FILTER_KEYS.forEach((k) => { const v = searchParams.get(k); if (v) f[k] = v; });
  if (f.range !== 'custom') { delete f.from; delete f.to; }
  if (f.range === 'custom' && !(f.from && f.to)) delete f.range;
  return f;
}

export function toQueryString(filters) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  return qs ? `?${qs}` : '';
}

export const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
