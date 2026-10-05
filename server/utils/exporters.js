import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { toCSV } from './csv.js';

// Renders a dashboard dataset ({ title, columns, rows, summary, filtersText }) as CSV, Excel or PDF.
export const EXPORT_FORMATS = {
  csv: { ext: 'csv', mime: 'text/csv; charset=utf-8' },
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pdf: { ext: 'pdf', mime: 'application/pdf' },
};

const typeOf = (col, row) => (col.type === 'mixed' ? row.type : col.type);

// Plain-text value for CSV/PDF. PDF's built-in fonts lack the rupee sign, so currency uses "Rs.".
function formatValue(value, type, { forPdf = false } = {}) {
  if (value === null || value === undefined || value === '') return type && type !== 'text' ? 'N/A' : '';
  switch (type) {
    case 'currency': {
      const n = Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return forPdf ? `Rs. ${n}` : n;
    }
    case 'percent': return `${Number(value).toFixed(1)}%`;
    case 'number': return Number(value).toFixed(2);
    case 'int': return String(Math.round(Number(value)));
    case 'days': return `${Number(value).toFixed(1)} days`;
    case 'date': return new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    case 'datetime': return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    default: return String(value);
  }
}

function toCsvString(ds) {
  const meta = [`"${ds.title}"`, `"${ds.filtersText}"`, ''];
  const table = toCSV(ds.rows, ds.columns.map((c) => ({ label: c.label, value: (r) => formatValue(r[c.key], typeOf(c, r)) })));
  const summary = ds.summary.length
    ? ['', '"Summary"', ...ds.summary.map((s) => `"${s.label}","${formatValue(s.value, s.type)}"`)]
    : [];
  // UTF-8 BOM so Excel opens the file with the right encoding.
  return `﻿${[...meta, table, ...summary].join('\n')}`;
}

async function toXlsxBuffer(ds) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AURELIA';
  const ws = wb.addWorksheet(ds.title.slice(0, 31).replace(/[\\/*?:[\]]/g, ''));
  ws.addRow([ds.title]).font = { bold: true, size: 14 };
  ws.addRow([ds.filtersText]).font = { italic: true, color: { argb: 'FF666666' } };
  ws.addRow([]);
  const header = ws.addRow(ds.columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E9D2' } }; });

  const numFmt = { currency: '#,##0.00', number: '0.00', int: '0', days: '0.0', percent: '0.0"%"', date: 'dd-mmm-yyyy', datetime: 'dd-mmm-yyyy hh:mm' };
  ds.rows.forEach((r) => {
    const row = ws.addRow(ds.columns.map((c) => {
      const v = r[c.key];
      const t = typeOf(c, r);
      if (v === null || v === undefined) return null;
      if (t === 'date' || t === 'datetime') return new Date(v);
      if (['currency', 'number', 'int', 'days', 'percent'].includes(t)) return Number(v);
      return v;
    }));
    ds.columns.forEach((c, i) => {
      const fmt = numFmt[typeOf(c, r)];
      if (fmt) row.getCell(i + 1).numFmt = fmt;
    });
    if (r.emphasis) row.font = { bold: true };
  });

  if (ds.summary.length) {
    ws.addRow([]);
    ws.addRow(['Summary']).font = { bold: true };
    ds.summary.forEach((s) => {
      const row = ws.addRow([s.label, s.value ?? 'N/A']);
      if (numFmt[s.type] && s.value !== null && s.value !== undefined) row.getCell(2).numFmt = numFmt[s.type];
    });
  }
  if (ds.formula) ws.addRow([ds.formula]).font = { italic: true };

  ws.columns.forEach((col, i) => {
    const c = ds.columns[i];
    col.width = Math.min(45, Math.max(12, (c?.label.length || 10) + 4, ...ds.rows.slice(0, 200).map((r) => String(r[c?.key] ?? '').length + 2)));
  });
  return wb.xlsx.writeBuffer();
}

function toPdfBuffer(ds) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: ds.columns.length > 5 ? 'landscape' : 'portrait', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const colW = width / ds.columns.length;
    const bottom = () => doc.page.height - doc.page.margins.bottom;

    doc.font('Helvetica-Bold').fontSize(16).text(ds.title);
    doc.font('Helvetica').fontSize(9).fillColor('#555555').text(ds.filtersText).fillColor('#000000');
    if (ds.formula) doc.moveDown(0.3).font('Helvetica-Oblique').fontSize(8).text(ds.formula.replace(/[−]/g, '-').replace(/[÷]/g, '/').replace(/[×]/g, 'x'));
    if (ds.summary.length) {
      doc.moveDown(0.6).font('Helvetica-Bold').fontSize(10).text('Summary');
      doc.font('Helvetica').fontSize(9);
      ds.summary.forEach((s) => doc.text(`${s.label}: ${formatValue(s.value, s.type, { forPdf: true })}`));
    }
    doc.moveDown(0.8);

    const drawRow = (cells, { bold = false, shade = false } = {}) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      const h = Math.max(...cells.map((t) => doc.heightOfString(t, { width: colW - 6 }))) + 6;
      if (doc.y + h > bottom()) { doc.addPage(); if (!bold) drawHeader(); }
      const y = doc.y;
      if (shade) doc.rect(left, y, width, h).fill('#F3E9D2').fillColor('#000000');
      cells.forEach((t, i) => doc.fillColor('#000000').text(t, left + i * colW + 3, y + 3, { width: colW - 6 }));
      doc.moveTo(left, y + h).lineTo(left + width, y + h).strokeColor('#DDDDDD').lineWidth(0.5).stroke();
      doc.x = left;
      doc.y = y + h;
    };
    const drawHeader = () => drawRow(ds.columns.map((c) => c.label), { bold: true, shade: true });

    drawHeader();
    if (!ds.rows.length) doc.font('Helvetica').fontSize(9).text('No records for the selected filters.', left, doc.y + 6);
    ds.rows.forEach((r) => drawRow(ds.columns.map((c) => formatValue(r[c.key], typeOf(c, r), { forPdf: true })), { bold: !!r.emphasis }));
    if (ds.note) doc.moveDown(0.8).font('Helvetica-Oblique').fontSize(8).text(ds.note, left, doc.y, { width });
    doc.end();
  });
}

export async function sendExport(res, format, ds, baseName) {
  const fmt = EXPORT_FORMATS[format];
  const filename = `${baseName}.${fmt.ext}`;
  let body;
  if (format === 'csv') body = toCsvString(ds);
  else if (format === 'xlsx') body = Buffer.from(await toXlsxBuffer(ds));
  else body = await toPdfBuffer(ds);
  res.setHeader('Content-Type', fmt.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

export default { EXPORT_FORMATS, sendExport };
