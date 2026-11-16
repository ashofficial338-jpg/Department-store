export function formatCurrency(value, { decimals = 0 } = {}) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(n);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

// Compact Indian-system figure for chart axes and tight spaces: 1,250 -> 1.3K, 2,40,000 -> 2.4L, 3,10,00,000 -> 3.1Cr.
export function formatCompact(value, { currency = false } = {}) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const trim = (x) => String(Number(x.toFixed(1)));
  let out;
  if (abs >= 1e7) out = `${trim(n / 1e7)}Cr`;
  else if (abs >= 1e5) out = `${trim(n / 1e5)}L`;
  else if (abs >= 1e3) out = `${trim(n / 1e3)}K`;
  else out = String(Math.round(n));
  return currency ? `₹${out}` : out;
}

export function formatDate(value, opts = {}) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...opts });
}

export function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatPercent(value, decimals = 1) {
  const n = Number(value) || 0;
  return `${n > 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

export default { formatCurrency, formatNumber, formatCompact, formatDate, formatDateTime, formatPercent };
