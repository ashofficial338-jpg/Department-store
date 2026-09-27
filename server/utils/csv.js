export function toCSV(rows, columns) {
  const header = columns.map((c) => `"${c.label}"`).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => {
      const value = typeof c.value === 'function' ? c.value(row) : row[c.value];
      const str = value === null || value === undefined ? '' : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

export function sendCSV(res, filename, rows, columns) {
  const csv = toCSV(rows, columns);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

export default { toCSV, sendCSV };
