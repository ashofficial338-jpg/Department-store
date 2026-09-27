// Indian financial year: April 1 -> March 31. Kept as a single utility so the
// fiscal boundary is never hard-coded elsewhere in the app.
export function getFinancialYearCode(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-indexed, 3 = April
  const startYear = m >= 3 ? y : y - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(2)}${String(endYear).slice(2)}`; // e.g. "2526"
}

export function getFinancialYearRange(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const startYear = m >= 3 ? y : y - 1;
  const start = new Date(startYear, 3, 1, 0, 0, 0, 0);
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
  return { start, end };
}

export default getFinancialYearCode;
