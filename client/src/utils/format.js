// Number formatting for the whole app - Indian conventions (en-IN grouping: 1,25,000).
// Amounts default to 2 decimals (₹1,25,000.00). Negatives use a true minus sign (−₹1,250.00) so they
// read differently from hyphens; tables also colour them red (see DataTable / .amount-negative).

const MINUS = '−';
const cache = new Map();
function nf(key, opts) {
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat('en-IN', opts));
  return cache.get(key);
}
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const withMinus = (n, text) => (n < 0 ? MINUS + text : text);

// ₹1,25,000.00  (decimals: 0 for whole rupees, e.g. price chips)
export function formatCurrency(value, { decimals = 2 } = {}) {
  const n = num(value);
  const text = nf(`c${decimals}`, { style: 'currency', currency: 'INR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(n));
  return withMinus(n, text);
}

// ₹950 · ₹12,500 · ₹1.25 L · ₹3.4 Cr - for KPI hints, chart labels and tight spaces.
export function formatCompactCurrency(value) {
  const n = num(value);
  const a = Math.abs(n);
  let text;
  if (a >= 1e7) text = `₹${nf('k2', { maximumFractionDigits: 2 }).format(a / 1e7)} Cr`;
  else if (a >= 1e5) text = `₹${nf('k2', { maximumFractionDigits: 2 }).format(a / 1e5)} L`;
  else text = nf('c0', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(a);
  return withMinus(n, text);
}

// 1,25,000 - whole numbers stay whole; fractions (kg, litres) keep up to 3 decimals.
export function formatNumber(value, { decimals } = {}) {
  const n = num(value);
  const opts = decimals === undefined
    ? { maximumFractionDigits: Number.isInteger(n) ? 0 : 3 }
    : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return withMinus(n, nf(`n${decimals ?? (Number.isInteger(n) ? 'i' : 'f')}`, opts).format(Math.abs(n)));
}

// Quantity with an optional unit: "12 PCS", "2.5 KG".
export function formatQuantity(value, unit) {
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

export function formatDate(value, opts = {}) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...opts });
}

export function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Change indicator: "+12.5%" / "−3.0%". Pass { sign: false } for plain rates such as GST "18.0%".
export function formatPercent(value, decimals = 1, { sign = true } = {}) {
  const n = num(value);
  const body = `${Math.abs(n).toFixed(decimals)}%`;
  if (n < 0) return MINUS + body;
  return sign && n > 0 ? `+${body}` : body;
}

// CSS class for a signed amount: red when negative, optional green when positive.
export function amountClass(value, { positive = false } = {}) {
  const n = num(value);
  if (n < 0) return 'amount-negative';
  return positive && n > 0 ? 'amount-positive' : '';
}

export default { formatCurrency, formatCompactCurrency, formatNumber, formatQuantity, formatDate, formatDateTime, formatPercent, amountClass };
