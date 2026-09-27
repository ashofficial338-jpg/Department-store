export function formatCurrency(value, { decimals = 0 } = {}) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(n);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
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

export default { formatCurrency, formatNumber, formatDate, formatDateTime, formatPercent };
