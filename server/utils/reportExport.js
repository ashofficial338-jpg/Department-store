import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// Renders report sections (see services/reportSections.js) as a multi-sheet Excel workbook or a
// branded PDF. Both read the same section objects, so the two files always show the same figures.

const GOLD = '#A67F42'; const GOLD_LIGHT = '#F3E9D2'; const INK = '#1E2029'; const MUTED = '#6B6F7B'; const LINE = '#E3DED3';
const RED = '#C0392B'; const GREEN = '#2E7D57';
export const PDF_ROW_LIMIT = 300;

const typeOf = (col, row) => (col.type === 'mixed' ? row.type : col.type);
const isNum = (t) => ['currency', 'int', 'number', 'percent'].includes(t);

// ------------------------------------------------------------------ Excel

const NUM_FMT = {
  currency: '"₹"#,##0.00;[Red]-"₹"#,##0.00', int: '#,##0', number: '#,##0.00', percent: '0.0"%";[Red]-0.0"%"',
  date: 'dd-mmm-yyyy', datetime: 'dd-mmm-yyyy hh:mm',
};
const argb = (hex) => `FF${hex.replace('#', '')}`;
const colLetter = (n) => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
const sheetSafe = (name) => name.replace(/[\\/*?:[\]]/g, '').slice(0, 31);

function cellValue(v, t) {
  if (v === null || v === undefined || v === '') return null;
  if (t === 'date' || t === 'datetime') return new Date(v);
  if (isNum(t)) return Number(v);
  return v;
}

function writeTable(ws, section, startRow, { autoFilter }) {
  const cols = section.columns;
  const letter = Object.fromEntries(cols.map((c, i) => [c.key, colLetter(i + 1)]));
  let r = startRow;

  const title = ws.getRow(r++); title.getCell(1).value = section.title; title.font = { bold: true, size: 13, color: { argb: argb(INK) } };
  if (section.description) { const d = ws.getRow(r++); d.getCell(1).value = section.description; d.font = { italic: true, size: 9, color: { argb: argb(MUTED) } }; }
  for (const s of section.summary || []) {
    const row = ws.getRow(r++);
    row.getCell(1).value = s.label; row.getCell(1).font = { color: { argb: argb(MUTED) } };
    row.getCell(2).value = cellValue(s.value, s.type); row.getCell(2).font = { bold: true };
    if (NUM_FMT[s.type]) row.getCell(2).numFmt = NUM_FMT[s.type];
  }
  if (section.summary?.length) r++;

  const headerRow = r++;
  const header = ws.getRow(headerRow);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(INK) } };
    cell.alignment = { vertical: 'middle', horizontal: isNum(c.type) ? 'right' : 'left', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: argb(GOLD) } } };
  });
  header.height = 30;

  const first = r;
  section.rows.forEach((row, idx) => {
    const xr = ws.getRow(r);
    cols.forEach((c, i) => {
      const t = typeOf(c, row);
      const cell = xr.getCell(i + 1);
      const value = cellValue(row[c.key], t);
      const refs = c.formula ? [...c.formula.matchAll(/\{(\w+)\}/g)].map((m) => m[1]) : [];
      if (c.formula && refs.every((k) => letter[k])) {
        cell.value = { formula: c.formula.replace(/\{(\w+)\}/g, (_, k) => `${letter[k]}${r}`), result: value ?? undefined };
      } else {
        cell.value = value;
      }
      if (NUM_FMT[t]) cell.numFmt = NUM_FMT[t];
      if (c.suffixFrom && row[c.suffixFrom] === 'points') cell.numFmt = '+0.0" pts";[Red]-0.0" pts"';
      else if (c.suffixFrom) cell.numFmt = '+0.0"%";[Red]-0.0"%"';
    });
    if (row.emphasis) xr.font = { bold: true };
    if (idx % 2 === 1) cols.forEach((_, i) => { xr.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF7F0' } }; });
    r++;
  });
  const last = r - 1;
  if (!section.rows.length) { ws.getRow(r++).getCell(1).value = 'No records for the selected filters.'; }

  // Totals use SUBTOTAL(109, ...) so they follow the active autofilter.
  if (section.totals && section.rows.length) {
    const tr = ws.getRow(r);
    tr.getCell(1).value = 'Total';
    cols.forEach((c, i) => {
      const cell = tr.getCell(i + 1);
      const L = letter[c.key];
      if (c.total === 'sum') cell.value = { formula: `SUBTOTAL(109,${L}${first}:${L}${last})`, result: section.totals[c.key] };
      else if (c.total?.ratio && letter[c.total.ratio[0]] && letter[c.total.ratio[1]]) {
        const a = `${letter[c.total.ratio[0]]}${r}`; const b = `${letter[c.total.ratio[1]]}${r}`;
        cell.value = { formula: `IF(${b}=0,"",${a}/${b}*100)`, result: section.totals[c.key] ?? undefined };
      }
      if (NUM_FMT[c.type]) cell.numFmt = NUM_FMT[c.type];
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(GOLD_LIGHT) } };
      cell.border = { top: { style: 'thin', color: { argb: argb(GOLD) } }, bottom: { style: 'double', color: { argb: argb(GOLD) } } };
    });
    r++;
  }

  if (section.rows.length) {
    cols.forEach((c) => {
      const ref = `${letter[c.key]}${first}:${letter[c.key]}${last}`;
      if (c.cf === 'negative') ws.addConditionalFormatting({ ref, rules: [{ type: 'cellIs', operator: 'lessThan', formulae: [0], style: { font: { color: { argb: argb(RED) }, bold: true } } }] });
      if (c.cf === 'bar') ws.addConditionalFormatting({ ref, rules: [{ type: 'dataBar', minLength: 0, maxLength: 100, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FFD9B97A' }, gradient: true }] });
      if (c.cf === 'status') {
        ws.addConditionalFormatting({ ref, rules: [
          { type: 'containsText', operator: 'containsText', text: 'Out of stock', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFADBD8' } }, font: { color: { argb: argb(RED) }, bold: true } } },
          { type: 'containsText', operator: 'containsText', text: 'Low stock', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFCEFD2' } }, font: { color: { argb: 'FF9A6B00' } } } },
        ] });
      }
    });
    if (autoFilter) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: last, column: cols.length } };
  }
  return { nextRow: r + 2, headerRow, widths: cols.map((c) => Math.min(48, Math.max(c.label.length * 0.9 + 4, 11, ...section.rows.slice(0, 300).map((row) => {
    const v = row[c.key]; const t = typeOf(c, row);
    if (t === 'currency') return 15; if (t === 'datetime') return 18; if (t === 'date') return 13;
    return String(v ?? '').length + 2;
  })))) };
}

function writeSheetHeader(ws, meta, colCount) {
  ws.mergeCells(1, 1, 1, Math.max(4, colCount));
  ws.getCell('A1').value = meta.companyName; ws.getCell('A1').font = { bold: true, size: 16, color: { argb: argb(GOLD) } };
  ws.getCell('A2').value = `${meta.reportTitle} · ${meta.filtersText}`; ws.getCell('A2').font = { size: 10, color: { argb: argb(INK) } };
  ws.getCell('A3').value = `Generated ${meta.generatedText} by ${meta.generatedBy}${meta.gstin ? ` · GSTIN ${meta.gstin}` : ''}`; ws.getCell('A3').font = { size: 9, italic: true, color: { argb: argb(MUTED) } };
  return 5;
}

export async function buildWorkbook(sections, meta, charts = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.companyName; wb.company = meta.companyName; wb.title = meta.reportTitle; wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true; // Excel recalculates every formula when the file opens
  const bySheet = new Map();
  for (const s of sections) { if (!bySheet.has(s.sheet)) bySheet.set(s.sheet, []); bySheet.get(s.sheet).push(s); }
  const order = [...meta.sheetOrder.filter((n) => bySheet.has(n)), ...[...bySheet.keys()].filter((n) => !meta.sheetOrder.includes(n))];

  for (const name of order) {
    const list = bySheet.get(name);
    const ws = wb.addWorksheet(sheetSafe(name), { properties: { tabColor: { argb: argb(GOLD) } } });
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
    ws.headerFooter = { oddFooter: `&L${meta.companyName}&C${name}&RPage &P of &N` };
    let row = writeSheetHeader(ws, meta, Math.max(...list.map((s) => s.columns.length)));
    const widths = [];
    let freezeAt = null;
    // The largest table on the sheet gets the autofilter (Excel allows one per sheet).
    const filterTarget = list.reduce((a, b) => (b.rows.length > a.rows.length ? b : a), list[0]);
    for (const section of list) {
      const out = writeTable(ws, section, row, { autoFilter: section === filterTarget });
      if (list.length === 1) freezeAt = out.headerRow;
      out.widths.forEach((w, i) => { widths[i] = Math.max(widths[i] || 0, w); });
      row = out.nextRow;
    }
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    if (freezeAt) ws.views = [{ state: 'frozen', ySplit: freezeAt }];

    if (name === 'Dashboard Summary' && charts.length) placeCharts(wb, ws, charts, row);
  }
  if (charts.length && !bySheet.has('Dashboard Summary')) {
    const ws = wb.addWorksheet('Charts');
    writeSheetHeader(ws, meta, 8);
    placeCharts(wb, ws, charts, 5);
  }
  if (!order.length) wb.addWorksheet('Report').getCell('A1').value = 'No sections selected.';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Chart images are rendered by the browser from the same data and embedded as PNGs.
function placeCharts(wb, ws, charts, startRow) {
  let row = startRow;
  ws.getRow(row).getCell(1).value = 'Charts'; ws.getRow(row).font = { bold: true, size: 13 };
  row += 1;
  charts.slice(0, 8).forEach((c, i) => {
    const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(c.dataUrl || '');
    if (!m) return;
    const id = wb.addImage({ base64: m[2], extension: m[1] === 'jpeg' ? 'jpeg' : 'png' });
    const col = (i % 2) * 7;
    const r = row + Math.floor(i / 2) * 22;
    ws.getRow(r).getCell(col + 1).value = c.title;
    ws.getRow(r).getCell(col + 1).font = { bold: true, color: { argb: argb(INK) } };
    ws.addImage(id, { tl: { col, row: r }, ext: { width: 520, height: 300 } });
  });
}

// ------------------------------------------------------------------ PDF

const ascii = (s) => String(s ?? '').replace(/₹/g, 'Rs.').replace(/[−–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x20-\x7E -ÿ]/g, '');

function fmt(v, t, { compact = false } = {}) {
  if (v === null || v === undefined || v === '') return t && t !== 'text' ? '-' : '';
  const n = Number(v);
  switch (t) {
    case 'currency': return `${n < 0 ? '-' : ''}Rs. ${compact ? compactNum(Math.abs(n)) : Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'int': return Math.round(n).toLocaleString('en-IN');
    case 'number': return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    case 'percent': return `${n.toFixed(1)}%`;
    case 'date': return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    case 'datetime': return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    default: return ascii(v);
  }
}
function compactNum(n) {
  const a = Math.abs(n); const s = n < 0 ? '-' : '';
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}k`;
  return `${s}${a.toFixed(0)}`;
}

function logoBuffer(logo) {
  if (!logo) return null;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(logo);
  if (m) return Buffer.from(m[2], 'base64');
  if (logo.startsWith('/uploads/')) {
    const file = path.resolve(process.env.UPLOAD_DIR || 'uploads', logo.replace('/uploads/', ''));
    if (/\.(png|jpe?g)$/i.test(file) && fs.existsSync(file)) return fs.readFileSync(file);
  }
  return null;
}

export function buildPdf(sections, meta, overview) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 46, left: 36, right: 36 }, bufferPages: true, info: { Title: ascii(meta.reportTitle), Author: ascii(meta.companyName) } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const L = doc.page.margins.left; const W = doc.page.width - L - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    const ensure = (h) => { if (doc.y + h > bottom()) doc.addPage(); };

    // ---- Header band
    doc.rect(0, 0, doc.page.width, 92).fill(INK);
    const logo = logoBuffer(meta.logo);
    if (logo) { try { doc.image(logo, L, 18, { fit: [56, 56] }); } catch { /* unsupported image - fall back below */ } }
    if (!logo) {
      doc.circle(L + 28, 46, 26).fill(GOLD);
      const initials = ascii(meta.companyName).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text(initials, L, 36, { width: 56, align: 'center' });
    }
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text(ascii(meta.companyName), L + 70, 22, { width: W - 300 });
    doc.font('Helvetica').fontSize(8.5).fillColor('#C9CBD3').text(ascii([meta.address, meta.gstin && `GSTIN ${meta.gstin}`].filter(Boolean).join('  |  ')), L + 70, 46, { width: W - 300 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#E9CF9A').text(ascii(meta.reportTitle), L + W - 260, 22, { width: 260, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor('#C9CBD3')
      .text(ascii(`Period: ${meta.periodText}`), L + W - 260, 42, { width: 260, align: 'right' })
      .text(ascii(`Generated: ${meta.generatedText}`), { width: 260, align: 'right' })
      .text(ascii(`By: ${meta.generatedBy}`), { width: 260, align: 'right' });
    doc.y = 104; doc.x = L;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(ascii(`Filters: ${meta.filtersText}`), L, doc.y, { width: W });
    doc.moveDown(0.6);

    // ---- Summary cards
    if (overview?.summary) {
      const s = overview.summary.current; const p = overview.summary.previous;
      const cards = [
        ['Revenue (incl. GST)', s.revenue, p?.revenue, 'currency'], ['Net sales', s.netSales, p?.netSales, 'currency'],
        ['Expenses', s.expenses, p?.expenses, 'currency', true], ['Purchases', s.purchases, p?.purchases, 'currency', true, true],
        ['Gross profit', s.grossProfit, p?.grossProfit, 'currency', false, true], ['Net profit', s.netProfit, p?.netProfit, 'currency', false, true],
        ['Net profit margin', s.netMargin, p?.netMargin, 'percent', false, true], ['Invoices', s.invoices, p?.invoices, 'int'],
      ].filter((c) => meta.financial || !c[5]);
      const perRow = 4; const gap = 10; const cw = (W - gap * (perRow - 1)) / perRow; const ch = 52;
      const rows = Math.ceil(cards.length / perRow);
      ensure(rows * (ch + gap));
      const top = doc.y;
      cards.forEach(([label, v, prev, t, inverse], i) => {
        // Fixed grid positions: text calls move doc.y, so every card is placed from the grid top.
        const x = L + (i % perRow) * (cw + gap); const y = top + Math.floor(i / perRow) * (ch + gap);
        doc.roundedRect(x, y, cw, ch, 6).fillAndStroke('#FBF8F1', LINE);
        doc.rect(x, y + 8, 3, ch - 16).fill(GOLD);
        doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(label.toUpperCase(), x + 12, y + 8, { width: cw - 20 });
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(fmt(v, t), x + 12, y + 20, { width: cw - 20 });
        if (prev !== null && prev !== undefined && v !== null && v !== undefined && meta.compare) {
          const diff = t === 'percent' ? v - prev : prev ? ((v - prev) / Math.abs(prev)) * 100 : null;
          if (diff !== null) {
            const good = inverse ? diff <= 0 : diff >= 0;
            doc.fillColor(good ? GREEN : RED).font('Helvetica').fontSize(7.5)
              .text(`${diff >= 0 ? '+' : ''}${diff.toFixed(1)}${t === 'percent' ? ' pts' : '%'} vs previous period (${fmt(prev, t, { compact: true })})`, x + 12, y + 38, { width: cw - 20 });
          }
        }
      });
      doc.y = top + rows * (ch + gap) + 6; doc.x = L;
    }

    // ---- Charts
    if (overview?.trend?.length) {
      ensure(220);
      const half = (W - 16) / 2;
      const y = doc.y;
      barLineChart(doc, { x: L, y, w: half, h: 200, title: 'Revenue vs expenses', rows: overview.trend, financial: meta.financial });
      if (overview.topProducts?.length) hBarChart(doc, { x: L + half + 16, y, w: half, h: 200, title: 'Top products by revenue', rows: overview.topProducts.slice(0, 8).map((r) => ({ label: r.name, value: r.revenue })) });
      doc.y = y + 214; doc.x = L;
      if (overview.categories?.length || overview.brands?.length) {
        ensure(200);
        const y2 = doc.y;
        if (overview.categories?.length) hBarChart(doc, { x: L, y: y2, w: half, h: 180, title: 'Category-wise sales', rows: overview.categories.slice(0, 7).map((r) => ({ label: r.name, value: r.revenue })), color: '#7E90B0' });
        if (overview.brands?.length) hBarChart(doc, { x: L + half + 16, y: y2, w: half, h: 180, title: 'Best-performing brands', rows: overview.brands.slice(0, 7).map((r) => ({ label: r.name, value: r.revenue })), color: '#8AA6A3' });
        doc.y = y2 + 194; doc.x = L;
      }
    }

    // ---- Section tables
    for (const s of sections) drawSection(doc, s, { L, W, bottom });

    // ---- Footers with page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Footer sits inside the bottom margin; lift the margin while writing so pdfkit doesn't add a page.
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 30;
      doc.moveTo(L, y - 6).lineTo(L + W, y - 6).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
      doc.text(ascii(`${meta.companyName} · Confidential`), L, y, { width: W / 3, lineBreak: false });
      doc.text(ascii(`${meta.reportTitle} · ${meta.periodText}`), L + W / 3, y, { width: W / 3, align: 'center', lineBreak: false });
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, L + (2 * W) / 3, y, { width: W / 3, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

function drawSection(doc, s, { L, W, bottom }) {
  if (doc.y + 90 > bottom()) doc.addPage();
  doc.x = L;
  doc.moveDown(0.4);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12.5).text(ascii(s.title), L, doc.y, { width: W });
  doc.moveTo(L, doc.y + 2).lineTo(L + 60, doc.y + 2).strokeColor(GOLD).lineWidth(1.5).stroke();
  doc.moveDown(0.35);
  if (s.description) doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(ascii(s.description), L, doc.y, { width: W });
  if (s.summary?.length) {
    doc.moveDown(0.3);
    doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(s.summary.map((x) => `${ascii(x.label)}: ${fmt(x.value, x.type)}`).join('    |    '), L, doc.y, { width: W });
  }
  doc.moveDown(0.5);

  const cols = s.columns;
  const fontSize = cols.length <= 8 ? 8 : cols.length <= 12 ? 7 : 6.2;
  // Column widths follow the content: measure the header's longest word and a sample of formatted cells,
  // then scale everything to the page width. Long text columns are capped so numbers keep their room.
  doc.font('Helvetica').fontSize(fontSize);
  const sample = s.rows.slice(0, 120);
  const natural = cols.map((c) => {
    const head = Math.max(...ascii(c.label).split(/s+/).map((w) => doc.font('Helvetica-Bold').widthOfString(w)));
    doc.font('Helvetica');
    const cells = sample.map((r) => doc.widthOfString(fmt(r[c.key], typeOf(c, r)))).sort((a, b) => a - b);
    const p90 = cells.length ? cells[Math.floor(cells.length * 0.9)] : 0;
    const totalCell = s.totals?.[c.key] !== undefined ? doc.font('Helvetica-Bold').widthOfString(fmt(s.totals[c.key], c.type)) : 0;
    return Math.min(c.type === 'text' ? 170 : 120, Math.max(head, p90, totalCell, 18)) + 8;
  });
  // Over the page width: shrink the long text columns (names, descriptions) first, down to 55pt, then scale the rest.
  const widths = [...natural];
  let excess = widths.reduce((t, w) => t + w, 0) - W;
  if (excess > 0) {
    const flex = cols.map((c, i) => (c.type === 'text' && widths[i] > 55 ? i : -1)).filter((i) => i >= 0);
    const room = flex.reduce((t, i) => t + (widths[i] - 55), 0);
    const take = Math.min(excess, room);
    flex.forEach((i) => { widths[i] -= room ? ((widths[i] - 55) / room) * take : 0; });
    excess -= take;
  }
  const scale = W / widths.reduce((t, w) => t + w, 0);
  widths.forEach((w, i) => { widths[i] = w * scale; });
  // One money format per column: full rupees, then without the prefix, then lakh / crore if it still doesn't fit.
  const modes = cols.map((c, i) => {
    if (c.type !== 'currency') return 'full';
    const vals = [...sample.map((r) => r[c.key]), s.totals?.[c.key]].filter((v) => v !== null && v !== undefined);
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const widest = Math.max(0, ...vals.map((v) => doc.widthOfString(fmt(v, 'currency'))));
    const room = widths[i] - 6;
    if (widest <= room) return 'full';
    if (widest - doc.widthOfString('Rs. ') <= room) return 'plain';
    return 'compact';
  });
  const fit = (text, c, raw, i) => {
    if (c.type !== 'currency' || raw === null || raw === undefined || raw === '' || Number.isNaN(Number(raw))) return text;
    if (modes[i] === 'plain') return text.replace('Rs. ', '');
    if (modes[i] === 'compact') return compactNum(Number(raw));
    return text;
  };
  const xs = widths.reduce((acc, w, i) => { acc.push(i ? acc[i - 1] + widths[i - 1] : L); return acc; }, []);
  const rowH = fontSize + 7;

  const header = () => {
    const h = Math.max(...cols.map((c, i) => doc.font('Helvetica-Bold').fontSize(fontSize).heightOfString(ascii(c.label), { width: widths[i] - 6 }))) + 8;
    if (doc.y + h + rowH > bottom()) doc.addPage();
    const y = doc.y;
    doc.rect(L, y, W, h).fill(INK);
    cols.forEach((c, i) => doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(fontSize).text(ascii(c.label), xs[i] + 3, y + 4, { width: widths[i] - 6, align: isNum(c.type) ? 'right' : 'left' }));
    doc.y = y + h;
  };
  const line = (cells, { bold = false, shade = null, rowObj = null, totalsRaw = null } = {}) => {
    if (doc.y + rowH > bottom()) { doc.addPage(); header(); }
    const y = doc.y;
    if (shade) doc.rect(L, y, W, rowH).fill(shade);
    cells.forEach((text, i) => {
      const c = cols[i];
      const raw = rowObj ? rowObj[c.key] : null;
      const negative = c.cf === 'negative' && Number(raw) < 0;
      const status = c.cf === 'status' && rowObj ? rowObj.status : null;
      doc.fillColor(negative || status === 'out_of_stock' ? RED : status === 'low_stock' ? '#9A6B00' : INK)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize)
        .text(fit(text, c, rowObj ? rowObj[c.key] : totalsRaw?.[c.key], i), xs[i] + 3, y + 3.5, { width: widths[i] - 6, height: rowH - 3, ellipsis: true, lineBreak: false, align: isNum(typeOf(c, rowObj || {})) ? 'right' : 'left' });
    });
    doc.moveTo(L, y + rowH).lineTo(L + W, y + rowH).strokeColor(LINE).lineWidth(0.4).stroke();
    doc.y = y + rowH; doc.x = L;
  };

  header();
  if (!s.rows.length) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8.5).text('No records for the selected filters.', L + 4, doc.y + 6);
    doc.moveDown(1);
  }
  const shown = s.rows.slice(0, PDF_ROW_LIMIT);
  shown.forEach((r, idx) => {
    const cells = cols.map((c) => {
      const t = typeOf(c, r);
      if (c.suffixFrom && r[c.key] !== null && r[c.key] !== undefined) return `${r[c.key] >= 0 ? '+' : ''}${Number(r[c.key]).toFixed(1)}${r[c.suffixFrom] === 'points' ? ' pts' : '%'}`;
      return fmt(r[c.key], t);
    });
    line(cells, { bold: !!r.emphasis, shade: r.emphasis ? '#F6EFDF' : idx % 2 ? '#FAF8F3' : null, rowObj: r });
  });
  if (s.totals && s.rows.length) {
    line(cols.map((c, i) => (i === 0 ? 'Total' : s.totals[c.key] !== undefined ? fmt(s.totals[c.key], c.type) : '')), { bold: true, shade: GOLD_LIGHT, totalsRaw: s.totals });
  }
  doc.moveDown(0.4);
  const notes = [];
  if (s.rows.length > PDF_ROW_LIMIT) notes.push(`Showing the first ${PDF_ROW_LIMIT} of ${s.rows.length.toLocaleString('en-IN')} rows; totals cover all rows. Download the Excel workbook for every row.`);
  if (s.note) notes.push(s.note);
  if (notes.length) doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(7.5).text(ascii(notes.join(' ')), L, doc.y, { width: W });
  doc.moveDown(0.8);
}

function chartFrame(doc, { x, y, w, h, title }) {
  doc.roundedRect(x, y, w, h, 6).fillAndStroke('#FFFFFF', LINE);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(ascii(title), x + 12, y + 10, { width: w - 24 });
}

function barLineChart(doc, { x, y, w, h, title, rows, financial }) {
  chartFrame(doc, { x, y, w, h, title });
  const pl = x + 46; const pr = x + w - 12; const pt = y + 32; const pb = y + h - 34;
  const series = [{ key: 'revenue', color: GOLD, label: 'Revenue' }, { key: 'expenses', color: '#454856', label: 'Expenses' }];
  const hasProfit = financial && rows.some((r) => r.netProfit !== null && r.netProfit !== undefined);
  const vals = rows.flatMap((r) => [r.revenue, r.expenses, hasProfit ? r.netProfit : 0]);
  const max = Math.max(1, ...vals); const min = Math.min(0, ...vals);
  const yOf = (v) => pb - ((v - min) / (max - min)) * (pb - pt);
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4; const yy = yOf(v);
    doc.moveTo(pl, yy).lineTo(pr, yy).strokeColor('#EEEAE1').lineWidth(0.5).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text(compactNum(v), x + 4, yy - 3, { width: 38, align: 'right' });
  }
  const n = rows.length; const slot = (pr - pl) / n; const bw = Math.max(1.5, Math.min(14, (slot * 0.7) / 2));
  rows.forEach((r, i) => {
    const cx = pl + slot * i + slot / 2;
    series.forEach((s, k) => {
      const v = r[s.key] || 0; const top = yOf(Math.max(0, v)); const base = yOf(0);
      doc.rect(cx - bw + k * bw, Math.min(top, base), bw - 0.6, Math.abs(base - top)).fill(s.color);
    });
    const every = Math.ceil(n / 10);
    if (i % every === 0) doc.fillColor(MUTED).font('Helvetica').fontSize(6).text(ascii(r.label), cx - 26, pb + 4, { width: 52, align: 'center', lineBreak: false, ellipsis: true });
  });
  if (hasProfit) {
    rows.forEach((r, i) => {
      const cx = pl + slot * i + slot / 2; const yy = yOf(r.netProfit || 0);
      if (i === 0) doc.moveTo(cx, yy); else doc.lineTo(cx, yy);
    });
    doc.strokeColor(GREEN).lineWidth(1.6).stroke();
    rows.forEach((r, i) => doc.circle(pl + slot * i + slot / 2, yOf(r.netProfit || 0), 1.8).fill(GREEN));
  }
  const legend = [...series, ...(hasProfit ? [{ color: GREEN, label: 'Net profit' }] : [])];
  legend.forEach((s, i) => {
    const lx = x + 12 + i * 80;
    doc.rect(lx, y + h - 16, 8, 8).fill(s.color);
    doc.fillColor(INK).font('Helvetica').fontSize(7).text(s.label, lx + 12, y + h - 15, { lineBreak: false });
  });
}

function hBarChart(doc, { x, y, w, h, title, rows, color = GOLD }) {
  chartFrame(doc, { x, y, w, h, title });
  if (!rows.length) return;
  const top = y + 32; const area = h - 44; const rh = Math.min(20, area / rows.length);
  const labelW = w * 0.36; const barX = x + 12 + labelW; const barMax = w - labelW - 90;
  const max = Math.max(1, ...rows.map((r) => r.value));
  rows.forEach((r, i) => {
    const yy = top + i * rh;
    doc.fillColor(INK).font('Helvetica').fontSize(7).text(ascii(r.label), x + 12, yy + rh / 2 - 4, { width: labelW - 6, lineBreak: false, ellipsis: true });
    doc.roundedRect(barX, yy + 3, Math.max(2, (r.value / max) * barMax), rh - 6, 2).fill(color);
    doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(`Rs. ${compactNum(r.value)}`, barX + Math.max(2, (r.value / max) * barMax) + 4, yy + rh / 2 - 4, { lineBreak: false });
  });
}
