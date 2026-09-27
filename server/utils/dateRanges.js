import { getFinancialYearRange } from './financialYear.js';

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function startOfWeek(d) { const x = startOfDay(d); const day = x.getDay(); x.setDate(x.getDate() - day); return x; }

// Resolves the named filters used across dashboard/P&L/reports/sales-analytics into a concrete {from, to} range.
export function parseDateRange(query) {
  const { range, from, to } = query;
  const now = new Date();

  if (from && to) return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };

  switch (range) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'this_week':
      return { from: startOfWeek(now), to: endOfDay(now) };
    case 'this_month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case 'previous_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: start, to: end };
    }
    case 'this_year': {
      const { start, end } = getFinancialYearRange(now);
      return { from: start, to: end };
    }
    case 'previous_year': {
      const prevRefDate = new Date(now); prevRefDate.setFullYear(prevRefDate.getFullYear() - 1);
      const { start, end } = getFinancialYearRange(prevRefDate);
      return { from: start, to: end };
    }
    default:
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
  }
}

export default parseDateRange;
