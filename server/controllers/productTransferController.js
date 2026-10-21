import multer from 'multer';
import ExcelJS from 'exceljs';
import Product from '../models/Product.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Supplier from '../models/Supplier.js';
import TaxRate from '../models/TaxRate.js';
import Inventory from '../models/Inventory.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { toCSV } from '../utils/csv.js';
import { isFullAccessRole } from '../services/permissionService.js';
import { invalidateProductCache } from '../services/reportEngine.js';

// Product import / export (Excel or CSV). One column layout is shared by export, the blank template
// and import, so an exported file can be edited and imported straight back.
const FIELDS = [
  { key: 'sku', label: 'SKU', required: true, width: 14 },
  { key: 'name', label: 'Product Name', required: true, width: 38 },
  { key: 'barcode', label: 'Barcode', width: 16 },
  { key: 'brand', label: 'Brand', width: 18 },
  { key: 'category', label: 'Category', width: 22 },
  { key: 'subcategory', label: 'Subcategory', width: 22 },
  { key: 'supplier', label: 'Manufacturer / Supplier', width: 26 },
  { key: 'hsn', label: 'HSN Code', width: 10 },
  { key: 'gstRate', label: 'GST Rate %', required: true, number: true, width: 10 },
  { key: 'unit', label: 'Unit', width: 8 },
  { key: 'mrp', label: 'MRP', required: true, number: true, width: 10 },
  { key: 'sellingPrice', label: 'Selling Price (ex-GST)', required: true, number: true, width: 14 },
  { key: 'purchasePrice', label: 'Purchase Price', required: true, number: true, width: 13 },
  { key: 'reorderLevel', label: 'Reorder Level', number: true, width: 12 },
  { key: 'status', label: 'Status', width: 10 },
  { key: 'description', label: 'Description', width: 50 },
];
const EXPORT_ONLY = [{ key: 'stock', label: 'Current Stock (all locations)', width: 14 }, { key: 'margin', label: 'Margin %', width: 10 }];
const STATUSES = ['active', 'inactive', 'discontinued'];
const MAX_ROWS = 5000;

export const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (/\.(xlsx|csv)$/i.test(file.originalname) ? cb(null, true) : cb(new ApiError(400, 'Upload an .xlsx or .csv file.'))),
}).single('file');

async function exportRows() {
  const [products, stock] = await Promise.all([
    Product.find().populate('brand', 'name').populate('category', 'name').populate('subcategory', 'name').populate('primarySupplier', 'name').sort({ name: 1 }).lean(),
    Inventory.aggregate([{ $group: { _id: '$product', qty: { $sum: '$currentStock' } } }]),
  ]);
  const qty = new Map(stock.map((s) => [String(s._id), s.qty]));
  return products.map((p) => ({
    sku: p.sku, name: p.name, barcode: p.barcode || '', brand: p.brand?.name || '', category: p.category?.name || '', subcategory: p.subcategory?.name || '',
    supplier: p.primarySupplier?.name || '', hsn: p.hsn || '', gstRate: p.gstRate ?? 0, unit: p.unit || 'PCS', mrp: p.mrp, sellingPrice: p.sellingPrice,
    purchasePrice: p.purchasePrice, reorderLevel: p.reorderLevel ?? 10, status: p.status, description: p.description || '',
    stock: qty.get(String(p._id)) || 0, margin: p.sellingPrice ? Math.round(((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 1000) / 10 : null,
  }));
}

async function workbookFor(rows, { template = false } = {}) {
  const cols = template ? FIELDS : [...FIELDS, ...EXPORT_ONLY];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.required ? `${c.label} *` : c.label, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2029' } }; });
  rows.forEach((r) => ws.addRow(r));
  ['mrp', 'sellingPrice', 'purchasePrice'].forEach((k) => { ws.getColumn(k).numFmt = '"₹"#,##0.00'; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, rows.length + 1), column: cols.length } };
  const help = wb.addWorksheet('Instructions');
  help.columns = [{ width: 28 }, { width: 90 }];
  [
    ['How to import', 'Fill one product per row on the Products sheet, then upload the file from Product Master > Import.'],
    ['Required columns', FIELDS.filter((f) => f.required).map((f) => f.label).join(', ')],
    ['Existing SKUs', 'Rows whose SKU already exists update that product (administrators only). Other users can only add new SKUs.'],
    ['Brand / Category / Manufacturer', 'Matched by name (not case-sensitive). Names that do not exist yet are created automatically.'],
    ['Prices', 'Selling price is excluding GST. MRP is the printed retail price including GST.'],
    ['GST Rate %', 'Use a configured GST slab, e.g. 0, 5, 12, 18 or 28.'],
    ['Status', STATUSES.join(' / ') + ' (default: active)'],
  ].forEach((r) => { const row = help.addRow(r); row.getCell(1).font = { bold: true }; row.alignment = { wrapText: true, vertical: 'top' }; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const exportProducts = catchAsync(async (req, res) => {
  const rows = await exportRows();
  const stamp = new Date().toISOString().slice(0, 10);
  if (req.query.format === 'csv') {
    const csv = toCSV(rows, [...FIELDS, ...EXPORT_ONLY].map((c) => ({ label: c.label, value: c.key })));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="products-${stamp}.csv"`);
    return res.send(`﻿${csv}`);
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="products-${stamp}.xlsx"`);
  res.send(await workbookFor(rows));
});

export const importTemplate = catchAsync(async (req, res) => {
  const sample = [{ sku: 'AUR20001', name: 'Tata Salt 1 kg', barcode: '8901058000016', brand: 'Tata Salt', category: 'Groceries & Staples', subcategory: 'Salt, Sugar & Jaggery', supplier: 'Tata Consumer Products', hsn: '2501', gstRate: 0, unit: 'PKT', mrp: 28, sellingPrice: 28, purchasePrice: 24.5, reorderLevel: 20, status: 'active', description: 'Iodised salt, 1 kg pack' }];
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.xlsx"');
  res.send(await workbookFor(sample, { template: true }));
});

// ---------------------------------------------------------------- import

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

async function readSheet(file) {
  if (/\.csv$/i.test(file.originalname)) return parseCsv(file.buffer.toString('utf8').replace(/^﻿/, ''));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.buffer);
  const ws = wb.getWorksheet('Products') || wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      let v = row.getCell(c).value;
      if (v && typeof v === 'object') v = v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join('') : '');
      vals.push(v ?? '');
    }
    out.push(vals);
  });
  return out;
}

const norm = (s) => String(s).toLowerCase().replace(/\*/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
const slugify = (v) => v.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const importProducts = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Choose an .xlsx or .csv file to import.');
  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === 'true';
  const table = await readSheet(req.file);
  if (table.length < 2) throw new ApiError(400, 'The file has no product rows. Download the template to see the expected layout.');
  const header = table[0].map(norm);
  const colIndex = {};
  for (const f of FIELDS) {
    const i = header.findIndex((h) => h === norm(f.label) || h === norm(f.key) || (f.key === 'supplier' && (h === 'manufacturer' || h === 'supplier')));
    if (i >= 0) colIndex[f.key] = i;
  }
  const missing = FIELDS.filter((f) => f.required && colIndex[f.key] === undefined).map((f) => f.label);
  if (missing.length) throw new ApiError(400, `Missing required column(s): ${missing.join(', ')}. Download the template to see the expected layout.`);
  const body = table.slice(1);
  if (body.length > MAX_ROWS) throw new ApiError(400, `Import up to ${MAX_ROWS} products at a time (this file has ${body.length}).`);

  const admin = isFullAccessRole(req.user.role);
  const taxRates = await TaxRate.find({ status: { $ne: 'inactive' } }).lean();
  const cache = { brand: new Map(), category: new Map(), supplier: new Map() };
  const findOrCreate = async (kind, name, parent = null) => {
    const key = `${parent || ''}|${name.toLowerCase()}`;
    if (cache[kind].has(key)) return cache[kind].get(key);
    const Model = { brand: Brand, category: Category, supplier: Supplier }[kind];
    const filter = { name: new RegExp(`^${escapeRx(name)}$`, 'i') };
    if (kind === 'category') filter.parent = parent;
    let doc = await Model.findOne(filter).select('_id').lean();
    if (!doc && !dryRun) {
      const data = { name };
      if (kind === 'category') { data.parent = parent; data.slug = `${slugify(name)}${parent ? `-${String(parent).slice(-5)}` : ''}`; }
      doc = await Model.create(data);
    }
    const id = doc?._id || `new:${name}`;
    cache[kind].set(key, id);
    return id;
  };

  const result = { total: body.length, created: 0, updated: 0, skipped: 0, errors: [], dryRun };
  const seen = new Set();
  for (let i = 0; i < body.length; i++) {
    const rowNo = i + 2;
    const cell = (k) => (colIndex[k] === undefined ? '' : String(body[i][colIndex[k]] ?? '').trim());
    const sku = cell('sku').toUpperCase();
    try {
      const errs = [];
      for (const f of FIELDS) {
        if (f.required && !cell(f.key)) errs.push(`${f.label} is required`);
        if (f.number && cell(f.key) && (Number.isNaN(Number(cell(f.key))) || Number(cell(f.key)) < 0)) errs.push(`${f.label} must be a number ≥ 0`);
      }
      if (sku && seen.has(sku)) errs.push('SKU appears more than once in this file');
      const status = (cell('status') || 'active').toLowerCase();
      if (!STATUSES.includes(status)) errs.push(`Status must be ${STATUSES.join(', ')}`);
      const gst = Number(cell('gstRate'));
      const tax = taxRates.find((t) => t.ratePercent === gst);
      if (cell('gstRate') && !tax) errs.push(`GST ${gst}% is not a configured GST slab`);
      const mrp = Number(cell('mrp')); const sp = Number(cell('sellingPrice')); const pp = Number(cell('purchasePrice'));
      if (!errs.length && sp * (1 + gst / 100) > mrp + 0.5) errs.push(`Selling price + GST (${(sp * (1 + gst / 100)).toFixed(2)}) is above MRP (${mrp})`);
      if (errs.length) throw new Error(errs.join('; '));
      seen.add(sku);

      const existing = await Product.findOne({ sku }).select('_id').lean();
      if (existing && !admin) { result.skipped += 1; result.errors.push({ row: rowNo, sku, message: 'SKU already exists - only administrators can update existing products' }); continue; }

      const doc = {
        sku, name: cell('name'), hsn: cell('hsn') || undefined, gstRate: gst, taxRate: tax?._id, unit: (cell('unit') || 'PCS').toUpperCase(),
        mrp, sellingPrice: sp, purchasePrice: pp, status, description: cell('description') || undefined,
        reorderLevel: cell('reorderLevel') ? Number(cell('reorderLevel')) : undefined,
      };
      if (cell('barcode')) doc.barcode = cell('barcode');
      if (cell('brand')) doc.brand = await findOrCreate('brand', cell('brand'));
      if (cell('supplier')) doc.primarySupplier = await findOrCreate('supplier', cell('supplier'));
      if (cell('category')) {
        doc.category = await findOrCreate('category', cell('category'));
        if (cell('subcategory')) doc.subcategory = await findOrCreate('category', cell('subcategory'), String(doc.category).startsWith('new:') ? null : doc.category);
      }
      if (cell('barcode')) {
        const clash = await Product.findOne({ barcode: cell('barcode'), sku: { $ne: sku } }).select('sku').lean();
        if (clash) throw new Error(`Barcode already used by ${clash.sku}`);
      }
      Object.keys(doc).forEach((k) => doc[k] === undefined && delete doc[k]);
      if (dryRun) { if (existing) result.updated += 1; else result.created += 1; continue; }
      if (existing) {
        await Product.updateOne({ _id: existing._id }, { $set: doc }, { runValidators: true });
        result.updated += 1;
      } else {
        await Product.create({ ...doc, createdBy: req.user._id });
        result.created += 1;
      }
    } catch (err) {
      result.skipped += 1;
      result.errors.push({ row: rowNo, sku, message: err.message });
    }
  }
  if (!dryRun) {
    invalidateProductCache();
    await recordAudit({ req, action: 'product.import', entity: 'Product', newValue: { file: req.file.originalname, created: result.created, updated: result.updated, skipped: result.skipped } });
  }
  res.json({ success: true, data: { ...result, errors: result.errors.slice(0, 200) } });
});

export default { exportProducts, importTemplate, importProducts, importUpload };
