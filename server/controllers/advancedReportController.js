import Product from '../models/Product.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Supplier from '../models/Supplier.js';
import Vendor from '../models/Vendor.js';
import ReportTemplate from '../models/ReportTemplate.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { isFullAccessRole } from '../services/permissionService.js';
import { PAYMENT_METHODS, EXPENSE_CATEGORIES, RANGE_KEYS } from '../services/analyticsService.js';
import {
  GRANULARITIES, TRANSACTION_TYPES, trendRows, productRows, groupRows, paymentMix, dataStatus,
} from '../services/reportEngine.js';
import {
  SECTIONS, SHEET_ORDER, BUILT_IN_TEMPLATES, allowedSections, createContext, buildSection, hasFinancialAccess,
} from '../services/reportSections.js';
import { buildWorkbook, buildPdf } from '../utils/reportExport.js';

const FINANCIAL_SUMMARY_KEYS = ['cogs', 'grossProfit', 'grossMargin', 'netProfit', 'netMargin', 'ebitda', 'purchases', 'purchaseOrders', 'gstOutput', 'gstInput', 'gstNet', 'addBacks'];
const stripFinancial = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !FINANCIAL_SUMMARY_KEYS.includes(k)));

export const meta = catchAsync(async (req, res) => {
  const [brands, categories, suppliers, vendors, products, templates] = await Promise.all([
    Brand.find().select('name').sort({ name: 1 }).lean(),
    Category.find().select('name parent').sort({ name: 1 }).lean(),
    Supplier.find().select('name').sort({ name: 1 }).lean(),
    Vendor.find().select('name').sort({ name: 1 }).lean(),
    Product.find({ status: { $ne: 'discontinued' } }).select('name sku').sort({ name: 1 }).lean(),
    ReportTemplate.find({ $or: [{ owner: req.user._id }, { shared: true }] }).populate('owner', 'name').sort({ name: 1 }).lean(),
  ]);
  const allowed = allowedSections(req);
  const parentName = new Map(categories.map((c) => [String(c._id), c.name]));
  res.json({
    success: true,
    data: {
      access: { financial: hasFinancialAccess(req) },
      sections: allowed.map((key) => ({ key, title: SECTIONS[key].title, description: SECTIONS[key].description, group: SECTIONS[key].group, sheet: SECTIONS[key].sheet, financial: !!SECTIONS[key].financial })),
      sheets: SHEET_ORDER,
      templates: {
        builtIn: BUILT_IN_TEMPLATES.map((t) => ({ ...t, sections: t.sections.filter((s) => allowed.includes(s)) })),
        saved: templates.map((t) => ({
          _id: t._id, name: t.name, description: t.description, sections: t.sections.filter((s) => allowed.includes(s)), filters: t.filters,
          shared: t.shared, ownerName: t.owner?.name, mine: String(t.owner?._id) === String(req.user._id),
        })),
      },
      options: {
        ranges: RANGE_KEYS, granularities: GRANULARITIES, transactionTypes: TRANSACTION_TYPES, paymentMethods: PAYMENT_METHODS, expenseCategories: EXPENSE_CATEGORIES,
        brands: brands.map((b) => ({ value: b._id, label: b.name })),
        categories: categories.map((c) => ({ value: c._id, label: c.parent ? `${parentName.get(String(c.parent)) || ''} › ${c.name}` : c.name })),
        suppliers: suppliers.map((s) => ({ value: s._id, label: s.name })),
        vendors: vendors.map((v) => ({ value: v._id, label: v.name })),
        products: products.map((p) => ({ value: p._id, label: `${p.name} (${p.sku})` })),
      },
    },
  });
});

async function overviewData(ctx) {
  const facts = await ctx.facts();
  const current = await ctx.summary();
  const previous = ctx.f.compare ? await ctx.prevSummary() : null;
  const products = productRows(facts);
  const stock = await ctx.stock();
  const stockTotals = stock.reduce((t, r) => ({
    value: t.value + r.stockValue, retail: t.retail + r.retailValue, expectedProfit: t.expectedProfit + r.expectedProfit,
    low: t.low + (r.status === 'low_stock' ? 1 : 0), out: t.out + (r.status === 'out_of_stock' ? 1 : 0), units: t.units + r.stock,
  }), { value: 0, retail: 0, expectedProfit: 0, low: 0, out: 0, units: 0 });
  const r2 = (n) => Math.round(n * 100) / 100;
  const data = {
    scope: { from: ctx.f.from, to: ctx.f.to, effectiveEnd: ctx.f.effectiveEnd, prevFrom: ctx.f.prevFrom, prevTo: ctx.f.prevTo, granularity: ctx.f.granularity, days: ctx.f.days, scoped: ctx.scoped, filtersText: await ctx.filtersText() },
    summary: { current, previous },
    trend: trendRows(facts, ctx.f),
    topProducts: products.filter((p) => p.units > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    brands: groupRows(products, 'brand').filter((b) => b.revenue > 0).slice(0, 10),
    categories: groupRows(products, 'category').filter((c) => c.revenue > 0),
    paymentMix: await paymentMix(ctx.f, ctx.ids),
    stock: {
      value: r2(stockTotals.value), retail: r2(stockTotals.retail), expectedProfit: r2(stockTotals.expectedProfit), units: stockTotals.units,
      lowStock: stockTotals.low, outOfStock: stockTotals.out, products: stock.length,
      alerts: stock.filter((s) => s.status !== 'in_stock').sort((a, b) => a.stock - b.stock).slice(0, 8),
    },
    dataStatus: await dataStatus(),
  };
  if (ctx.financial) {
    const [o, c] = await Promise.all([ctx.outstanding(), ctx.cashflow()]);
    data.outstanding = { receivables: o.receivables, receivableCount: o.receivableCount, payables: o.payables, payableCount: o.payableCount };
    data.cashflow = { inflow: c.inflow, outflow: c.outflow, net: c.net, accounts: c.accounts, hasLedger: c.hasLedger };
    data.gst = { output: current.gstOutput, input: current.gstInput, net: current.gstNet };
  } else {
    data.summary.current = stripFinancial(current);
    data.summary.previous = previous && stripFinancial(previous);
    data.topProducts = data.topProducts.map(({ cogs, grossProfit, profitMargin, purchasePrice, unitMargin, ...p }) => p);
    data.stock.expectedProfit = undefined;
  }
  return data;
}

export const overview = catchAsync(async (req, res) => {
  const ctx = await createContext(req);
  res.json({ success: true, data: await overviewData(ctx) });
});

// One section as a searchable, sortable, paginated table. Totals follow the search.
export const section = catchAsync(async (req, res) => {
  if (!allowedSections(req).includes(req.params.key)) throw new ApiError(SECTIONS[req.params.key] ? 403 : 404, SECTIONS[req.params.key] ? 'You do not have access to this report section.' : 'Unknown report section.');
  const ctx = await createContext(req);
  const s = await buildSection(ctx, req.params.key);
  let rows = s.rows;
  const q = String(req.query.search || '').trim().toLowerCase();
  if (q) {
    const textCols = s.columns.filter((c) => ['text', 'mixed'].includes(c.type) || c.key === 'invoice').map((c) => c.key);
    rows = rows.filter((r) => textCols.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
  }
  const sortKey = s.columns.some((c) => c.key === req.query.sort) ? req.query.sort : null;
  if (sortKey) {
    const dir = req.query.dir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const x = a[sortKey]; const y = b[sortKey];
      if (x === y) return 0; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      if (x instanceof Date || y instanceof Date || s.columns.find((c) => c.key === sortKey)?.type?.startsWith('date')) return (new Date(x) - new Date(y)) * dir;
      return String(x).localeCompare(String(y), 'en', { numeric: true }) * dir;
    });
  }
  let totals = s.totals;
  if (q && totals) {
    totals = {};
    for (const c of s.columns) {
      if (c.total === 'sum') totals[c.key] = Math.round(rows.reduce((t, r) => t + (Number(r[c.key]) || 0), 0) * 100) / 100;
      if (c.total?.ratio) {
        const den = rows.reduce((t, r) => t + (Number(r[c.total.ratio[1]]) || 0), 0);
        totals[c.key] = den ? Math.round((rows.reduce((t, r) => t + (Number(r[c.total.ratio[0]]) || 0), 0) / den) * 10000) / 100 : null;
      }
    }
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  res.json({
    success: true,
    data: {
      key: s.key, title: s.title, description: s.description, note: s.note, summary: s.summary,
      columns: s.columns.map(({ key, label, type, total, cf, suffixFrom }) => ({ key, label, type, total: !!total, cf, suffixFrom })),
      rows: rows.slice((page - 1) * limit, page * limit), totals,
      pagination: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
      filtersText: await ctx.filtersText(),
    },
  });
});

const fmtPeriod = (f) => {
  const d = (x) => x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${d(f.from)} - ${d(f.effectiveEnd < f.to ? f.effectiveEnd : f.to)}`;
};

// POST /reports/advanced/export  { format: 'pdf'|'xlsx', sections: [...], title, filters: {...}, charts: [{ title, dataUrl }] }
export const exportReport = catchAsync(async (req, res) => {
  const { format, sections = [], title, filters = {}, charts = [] } = req.body || {};
  if (!['pdf', 'xlsx'].includes(format)) throw new ApiError(400, 'Choose PDF or Excel.');
  const allowed = allowedSections(req);
  const keys = [...new Set(sections)].filter((k) => SECTIONS[k]);
  if (!keys.length) throw new ApiError(400, 'Select at least one report section to export.');
  const denied = keys.filter((k) => !allowed.includes(k));
  if (denied.length) throw new ApiError(403, `You do not have access to: ${denied.map((k) => SECTIONS[k].title).join(', ')}.`);

  // Filters arrive in the body; createContext reads req.query, so expose them there (strings only).
  const q = {};
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q[k] = String(v); });
  const ctx = await createContext({ ...req, query: q, user: req.user, permissions: req.permissions });
  const started = Date.now();
  const built = [];
  for (const k of keys) built.push(await buildSection(ctx, k));
  const settings = (await ctx.settings()) || {};
  const now = new Date();
  const metaInfo = {
    companyName: settings.companyName || 'Department Store', logo: settings.logo, address: settings.address, gstin: settings.gstin,
    reportTitle: String(title || 'Business Report').slice(0, 80), filtersText: await ctx.filtersText(), periodText: fmtPeriod(ctx.f),
    generatedText: now.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }), generatedBy: req.user.name,
    financial: ctx.financial, compare: ctx.f.compare, sheetOrder: SHEET_ORDER,
  };
  const stamp = now.toISOString().slice(0, 10);
  const base = `${metaInfo.reportTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'report'}-${stamp}`;
  let body; let mime; let ext;
  if (format === 'xlsx') {
    const imgs = (Array.isArray(charts) ? charts : []).filter((c) => typeof c?.dataUrl === 'string' && c.dataUrl.length < 3_000_000).slice(0, 8);
    body = await buildWorkbook(built, metaInfo, imgs);
    mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; ext = 'xlsx';
  } else {
    const withCharts = keys.includes('summary') || keys.includes('trend');
    body = await buildPdf(built, metaInfo, withCharts ? await overviewData(ctx) : null);
    mime = 'application/pdf'; ext = 'pdf';
  }
  await recordAudit({ req, action: 'report.export', entity: 'Report', newValue: { format, sections: keys, filters: q, rows: built.reduce((t, s) => t + s.rows.length, 0), ms: Date.now() - started } });
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${base}.${ext}"`);
  res.setHeader('Content-Length', body.length);
  res.send(body);
});

// ---------------------------------------------------------------- templates

function cleanTemplate(body, req) {
  const allowed = allowedSections(req);
  const sections = [...new Set(Array.isArray(body.sections) ? body.sections : [])].filter((s) => allowed.includes(s));
  const filters = {};
  ['range', 'from', 'to', 'granularity', 'compare', 'product', 'category', 'brand', 'supplier', 'vendor', 'paymentMethod', 'expenseCategory', 'stockStatus', 'transactionType']
    .forEach((k) => { if (body.filters?.[k] !== undefined && body.filters[k] !== '') filters[k] = String(body.filters[k]); });
  return { name: body.name, description: body.description, sections, filters, shared: !!body.shared };
}

export const createTemplate = catchAsync(async (req, res) => {
  const doc = await ReportTemplate.create({ ...cleanTemplate(req.body, req), owner: req.user._id });
  await recordAudit({ req, action: 'report.template.create', entity: 'ReportTemplate', entityId: doc._id, newValue: { name: doc.name } });
  res.status(201).json({ success: true, data: doc });
});

async function ownTemplate(req) {
  const doc = await ReportTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Template not found.');
  if (String(doc.owner) !== String(req.user._id) && !isFullAccessRole(req.user.role)) throw new ApiError(403, 'Only the owner can change this template.');
  return doc;
}

export const updateTemplate = catchAsync(async (req, res) => {
  const doc = await ownTemplate(req);
  Object.assign(doc, cleanTemplate({ ...doc.toObject(), ...req.body }, req));
  await doc.save();
  res.json({ success: true, data: doc });
});

export const deleteTemplate = catchAsync(async (req, res) => {
  const doc = await ownTemplate(req);
  await doc.deleteOne();
  res.json({ success: true, message: 'Template deleted.' });
});

export default { meta, overview, section, exportReport, createTemplate, updateTemplate, deleteTemplate };
