import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Inventory from '../models/Inventory.js';
import { itrAnalysis } from '../services/itrAnalysisService.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { round2 } from '../utils/gstCalculator.js';
import { can } from '../middleware/auth.js';
import { EXPORT_FORMATS, sendExport } from '../utils/exporters.js';
import DATASETS from '../services/dashboardDatasets.js';
import {
  SALE_STATUSES, EXPENSE_CATEGORIES, PAYMENT_METHODS, STOCK_STATUSES,
  parseFilters, hasFilterParams, resolveProductScope, salesByProduct, salesTotal, purchasesTotal, purchaseCount, expensesTotal,
  productProfitability, inventoryAnalysis, financialSummary, receivablesTotal, payablesTotal, pctChange, todayAndYesterday, stockStatusOf,
} from '../services/analyticsService.js';

const canSection = (req) => (section) => can(req, `dashboard.${section}`);

// Filters (date range, product, category, stock, revenue, expense) are an explicit permission.
// Without it the API rejects filter parameters instead of silently honouring them.
function readFilters(req, defaults) {
  if (hasFilterParams(req.query) && !can(req, 'dashboard.filters')) {
    throw new ApiError(403, 'You do not have permission to filter dashboard data.');
  }
  return parseFilters(req.query, defaults);
}

function requireSection(req, section) {
  if (section && !can(req, `dashboard.${section}`)) throw new ApiError(403, 'You do not have access to this dashboard information.');
}

function scopeInfo(f, req) {
  return {
    from: f.from, to: f.to, range: f.range, days: f.days,
    filtersApplied: hasFilterParams(req.query),
  };
}

export const kpis = catchAsync(async (req, res) => {
  const f = readFilters(req, { range: 'this_month' });
  const allow = canSection(req);
  const ids = await resolveProductScope(f);
  const { today, yesterday } = todayAndYesterday();
  const data = { scope: scopeInfo(f, req), today: {}, period: {} };
  const jobs = [];

  if (allow('sales')) {
    jobs.push(Promise.all([salesTotal(today.from, today.to, null), salesTotal(yesterday.from, yesterday.to, null), salesTotal(f.from, f.to, ids, f)])
      .then(([t, y, p]) => {
        data.today.sales = { value: t.value, change: pctChange(t.value, y.value), invoices: t.invoices };
        data.period.revenue = { value: p.value, invoices: p.invoices };
      }));
  }
  if (allow('expenses')) {
    jobs.push(Promise.all([expensesTotal(today.from, today.to), expensesTotal(yesterday.from, yesterday.to), expensesTotal(f.from, f.to, f)])
      .then(([t, y, p]) => {
        data.today.expenses = { value: t.value, change: pctChange(t.value, y.value) };
        data.period.expenses = { value: p.value, count: p.count, category: f.expenseCategory || null };
      }));
  }
  if (allow('inventory')) {
    jobs.push(inventoryAnalysis(f, ids).then(({ totals }) => {
      data.period.stockValue = { value: totals.currentInventory };
      data.period.lowStockItems = { value: totals.lowStockItems, outOfStock: totals.outOfStockItems };
      data.period.itr = {
        value: totals.itr, cogs: totals.cogs, openingInventory: totals.openingInventory,
        closingInventory: totals.closingInventory, averageInventory: totals.averageInventory,
      };
      data.period.holdingPeriod = {
        value: totals.holdingDays, currentInventory: totals.currentInventory, avgDailyConsumption: totals.avgDailyConsumption, days: totals.days,
      };
    }));
  }
  if (allow('financials')) {
    jobs.push(Promise.all([
      purchasesTotal(today.from, today.to), purchasesTotal(yesterday.from, yesterday.to), purchasesTotal(f.from, f.to), purchaseCount(f.from, f.to),
      productProfitability(today.from, today.to, null), productProfitability(yesterday.from, yesterday.to, null),
      productProfitability(f.from, f.to, ids), financialSummary(f.from, f.to), receivablesTotal(), payablesTotal(),
    ]).then(([tp, yp, pp, pCount, tProfit, yProfit, period, fin, rec, pay]) => {
      data.today.purchases = { value: tp, change: pctChange(tp, yp) };
      data.today.profit = { value: tProfit.totals.profit, change: pctChange(tProfit.totals.profit, yProfit.totals.profit) };
      data.period.purchases = { value: pp, count: pCount };
      data.period.netProfit = { value: fin.profit.netProfit, grossProfit: fin.profit.grossProfit, expenses: fin.profit.operatingExpenses };
      data.period.grossMargin = { value: period.totals.marginPercent, profit: period.totals.profit, revenue: period.totals.revenue };
      data.period.productRoi = { value: period.totals.roiPercent, ...period.totals };
      data.period.ebitda = fin.ebitda;
      data.period.receivables = rec;
      data.period.payables = pay;
    }));
  }
  await Promise.all(jobs);
  res.json({ success: true, data });
});

export const topProducts = catchAsync(async (req, res) => {
  requireSection(req, 'sales');
  const f = readFilters(req, { range: 'this_month' });
  const limit = Math.min(Number(req.query.limit) || 5, 50);
  const ids = await resolveProductScope(f);
  const rows = (await salesByProduct(f.from, f.to, ids, { paymentMethod: f.paymentMethod }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue).slice(0, limit);
  const totalRevenue = rows.reduce((s, r) => s + r.grossRevenue, 0);
  res.json({
    success: true,
    data: rows.map((r) => ({
      _id: r._id, productName: r.name, sku: r.sku, unitsSold: r.units, revenue: round2(r.grossRevenue),
      // Profit is measured on revenue excluding GST so it matches Product ROI and the P&L.
      profit: round2(r.revenue - r.cogs),
      contributionPercent: totalRevenue ? Math.round((r.grossRevenue / totalRevenue) * 1000) / 10 : 0,
    })),
  });
});

const CATALOG_SORTS = {
  revenue: (a, b) => b.revenue - a.revenue,
  units: (a, b) => b.unitsSold - a.unitsSold,
  name: (a, b) => a.name.localeCompare(b.name),
  price_high: (a, b) => b.sellingPrice - a.sellingPrice,
  price_low: (a, b) => a.sellingPrice - b.sellingPrice,
  margin: (a, b) => b.marginPercent - a.marginPercent,
  stock_low: (a, b) => a.stock - b.stock,
};

// Full product catalogue with brand, category, prices, GST, stock and sales for the selected period.
// Visible with either the sales or the inventory dashboard section.
export const productCatalog = catchAsync(async (req, res) => {
  if (!can(req, 'dashboard.sales') && !can(req, 'dashboard.inventory')) throw new ApiError(403, 'You do not have access to this dashboard information.');
  const f = readFilters(req, { range: 'this_month' });
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
  const sort = CATALOG_SORTS[req.query.sort] ? req.query.sort : 'revenue';
  const search = String(req.query.search || '').trim();

  const ids = await resolveProductScope(f);
  const match = { status: { $ne: 'discontinued' } };
  if (ids) match._id = { $in: ids };
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const brandIds = (await Brand.find({ name: rx }).select('_id').lean()).map((b) => b._id);
    match.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { hsn: rx }, { brand: { $in: brandIds } }];
  }

  const [products, stockRows, salesRows] = await Promise.all([
    Product.find(match)
      .select('name sku barcode hsn gstRate unit mrp sellingPrice purchasePrice discountPercent reorderLevel status images brand category subcategory primarySupplier')
      .populate('brand', 'name').populate('category', 'name').populate('subcategory', 'name').populate('primarySupplier', 'name').lean(),
    Inventory.aggregate([{ $group: { _id: '$product', qty: { $sum: '$currentStock' } } }]),
    salesByProduct(f.from, f.to, ids, { paymentMethod: f.paymentMethod }),
  ]);
  const stock = new Map(stockRows.map((r) => [String(r._id), r.qty]));
  const sales = new Map(salesRows.map((r) => [String(r._id), r]));

  const rows = products.map((p) => {
    const qty = stock.get(String(p._id)) || 0;
    const s = sales.get(String(p._id));
    // Selling price is stored excluding GST; the shelf price the customer pays adds GST on top.
    const priceInclGst = round2(p.sellingPrice * (1 + (p.gstRate || 0) / 100));
    return {
      _id: p._id, name: p.name, sku: p.sku, barcode: p.barcode, hsn: p.hsn, unit: p.unit, status: p.status,
      image: (p.images || []).find((i) => i.isPrimary)?.url || p.images?.[0]?.url || null,
      brand: p.brand?.name || '—', supplier: p.primarySupplier?.name || null, category: p.category?.name || 'Uncategorized', subcategory: p.subcategory?.name || null,
      mrp: p.mrp, sellingPrice: p.sellingPrice, priceInclGst, purchasePrice: p.purchasePrice, gstRate: p.gstRate || 0,
      discountPercent: p.mrp ? Math.max(0, round2(((p.mrp - priceInclGst) / p.mrp) * 100)) : 0,
      // Margin on the selling price excluding GST, same basis as Gross Margin.
      marginPercent: p.sellingPrice ? round2(((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100) : 0,
      stock: qty, stockValue: round2(qty * p.purchasePrice), reorderLevel: p.reorderLevel, stockStatus: stockStatusOf(qty, p.reorderLevel),
      unitsSold: s?.units || 0, revenue: round2(s?.grossRevenue || 0), profit: round2((s?.revenue || 0) - (s?.cogs || 0)),
    };
  }).sort(CATALOG_SORTS[sort]);

  const summary = {
    products: rows.length,
    brands: new Set(rows.map((r) => r.brand)).size,
    categories: new Set(rows.map((r) => r.category)).size,
    stockValue: round2(rows.reduce((t, r) => t + r.stockValue, 0)),
    revenue: round2(rows.reduce((t, r) => t + r.revenue, 0)),
  };
  res.json({
    success: true,
    data: rows.slice((page - 1) * limit, page * limit),
    summary,
    pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
  });
});

export const productRoi = catchAsync(async (req, res) => {
  requireSection(req, 'financials');
  const f = readFilters(req, { range: 'this_month' });
  const limit = Math.min(Number(req.query.limit) || 10, 100);
  const ids = await resolveProductScope(f);
  const { products, totals } = await productProfitability(f.from, f.to, ids);
  res.json({ success: true, data: { products: products.slice(0, limit), totals, count: products.length } });
});

export const salesTrend = catchAsync(async (req, res) => {
  requireSection(req, 'sales');
  const f = readFilters(req, { range: 'this_month' });
  const groupBy = req.query.groupBy || (f.days > 62 ? 'month' : 'day');
  const dateFormat = { day: '%Y-%m-%d', week: '%Y-%U', month: '%Y-%m', year: '%Y' }[groupBy] || '%Y-%m-%d';
  const ids = await resolveProductScope(f);
  const showPurchases = can(req, 'dashboard.financials') && !ids;

  const saleMatch = { createdAt: { $gte: f.from, $lte: f.to }, status: { $in: SALE_STATUSES } };
  if (f.paymentMethod) saleMatch['payments.method'] = f.paymentMethod;
  const salesPipeline = ids
    ? [{ $match: saleMatch }, { $unwind: '$items' }, { $match: { 'items.product': { $in: ids } } },
      { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, sales: { $sum: '$items.totalAmount' } } }]
    : [{ $match: saleMatch }, { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, sales: { $sum: '$grandTotal' } } }];

  const [sales, purchases] = await Promise.all([
    Sale.aggregate(salesPipeline),
    showPurchases ? Purchase.aggregate([
      { $match: { createdAt: { $gte: f.from, $lte: f.to }, status: { $ne: 'draft' } } },
      { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, purchases: { $sum: '$grandTotal' } } },
    ]) : [],
  ]);

  const map = new Map();
  sales.forEach((s) => map.set(s._id, { period: s._id, sales: round2(s.sales), ...(showPurchases ? { purchases: 0 } : {}) }));
  purchases.forEach((p) => {
    const existing = map.get(p._id) || { period: p._id, sales: 0, purchases: 0 };
    existing.purchases = round2(p.purchases);
    map.set(p._id, existing);
  });
  res.json({ success: true, data: Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period)), showPurchases });
});

export const categoryBrandSales = catchAsync(async (req, res) => {
  requireSection(req, 'sales');
  const f = readFilters(req, { range: 'this_month' });
  const ids = await resolveProductScope(f);
  const match = { createdAt: { $gte: f.from, $lte: f.to }, status: { $in: SALE_STATUSES } };
  if (f.paymentMethod) match['payments.method'] = f.paymentMethod;
  const itemScope = ids ? [{ $match: { 'items.product': { $in: ids } } }] : [];
  const byLookup = (collection, field, fallback) => Sale.aggregate([
    { $match: match }, { $unwind: '$items' }, ...itemScope,
    // Total per product first, so the lookups run once per product instead of once per invoice line.
    { $group: { _id: '$items.product', value: { $sum: '$items.totalAmount' } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p' } },
    { $unwind: '$p' },
    { $lookup: { from: collection, localField: `p.${field}`, foreignField: '_id', as: 'x' } },
    { $unwind: { path: '$x', preserveNullAndEmptyArrays: true } },
    { $group: { _id: { $ifNull: ['$x.name', fallback] }, value: { $sum: '$value' } } },
    { $sort: { value: -1 } },
  ]);
  const [byCategory, byBrand, byPayment] = await Promise.all([
    byLookup('categories', 'category', 'Uncategorized'),
    byLookup('brands', 'brand', 'Unbranded'),
    Sale.aggregate([
      { $match: { ...match, ...(ids ? { 'items.product': { $in: ids } } : {}) } },
      { $unwind: '$payments' },
      ...(f.paymentMethod ? [{ $match: { 'payments.method': f.paymentMethod } }] : []),
      { $group: { _id: '$payments.method', value: { $sum: '$payments.amount' } } },
    ]),
  ]);
  res.json({ success: true, data: { byCategory, byBrand, byPayment } });
});

// Options for the filter controls (only for users allowed to filter).
export const filterOptions = catchAsync(async (req, res) => {
  const [categories, products, brands] = await Promise.all([
    Category.find({ status: { $ne: 'inactive' } }).select('name parent').sort({ name: 1 }).lean(),
    Product.find({ status: { $ne: 'discontinued' } }).select('name sku category subcategory brand').sort({ name: 1 }).limit(2000).lean(),
    Brand.find({ status: { $ne: 'inactive' } }).select('name').sort({ name: 1 }).lean(),
  ]);
  res.json({
    success: true,
    data: {
      categories, products, brands, stockStatuses: STOCK_STATUSES, expenseCategories: EXPENSE_CATEGORIES, paymentMethods: PAYMENT_METHODS,
      exportFormats: Object.keys(EXPORT_FORMATS),
    },
  });
});

async function buildDataset(req) {
  const def = DATASETS[req.params.metric];
  if (!def) throw new ApiError(404, 'Unknown dashboard metric.');
  requireSection(req, def.section);
  const f = readFilters(req, { range: def.defaultRange });
  const result = await def.build(f, { canSection: canSection(req), query: req.query });
  return { metric: req.params.metric, title: def.title, section: def.section, scope: scopeInfo(f, req), filters: f, ...result };
}

async function describeFilters(f) {
  const parts = [`Period: ${f.from.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} to ${f.to.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`];
  if (f.product) parts.push(`Product: ${(await Product.findById(f.product).select('name').lean())?.name || f.product}`);
  if (f.category) parts.push(`Category: ${(await Category.findById(f.category).select('name').lean())?.name || f.category}`);
  if (f.brand) parts.push(`Brand: ${(await Brand.findById(f.brand).select('name').lean())?.name || f.brand}`);
  if (f.stockStatus) parts.push(`Stock: ${f.stockStatus.replace(/_/g, ' ')}`);
  if (f.expenseCategory) parts.push(`Expense: ${f.expenseCategory.replace(/_/g, ' ')}`);
  if (f.paymentMethod) parts.push(`Payment: ${f.paymentMethod.replace(/_/g, ' ')}`);
  return parts.join('  |  ');
}

// Product-wise ITR over 3/6/12 months. `period` picks the window used for ranking and classification and is
// available to everyone with inventory access; product/category/brand narrowing needs the filters permission.
export const itrAnalysisReport = catchAsync(async (req, res) => {
  requireSection(req, 'inventory');
  const f = readFilters(req, { range: 'this_month' });
  const period = Number(req.query.period) || 12;
  if (![3, 6, 12].includes(period)) throw new ApiError(400, 'Period must be 3, 6 or 12 months.');
  res.json({ success: true, data: await itrAnalysis({ product: f.product, category: f.category, brand: f.brand, period }) });
});

export const metricDetails = catchAsync(async (req, res) => {
  const { filters, ...ds } = await buildDataset(req);
  res.json({ success: true, data: { ...ds, filtersText: await describeFilters(filters) } });
});

export const exportMetric = catchAsync(async (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  if (!EXPORT_FORMATS[format]) throw new ApiError(400, 'Export format must be csv, xlsx or pdf.');
  const { filters, ...ds } = await buildDataset(req);
  ds.filtersText = `${await describeFilters(filters)}  |  Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} by ${req.user.name}`;
  await recordAudit({ req, action: 'dashboard.export', entity: 'Dashboard', newValue: { metric: ds.metric, format, query: req.query } });
  const stamp = new Date().toISOString().slice(0, 10);
  await sendExport(res, format, ds, `${ds.metric}-${stamp}`);
});

export default { kpis, topProducts, productCatalog, productRoi, salesTrend, categoryBrandSales, filterOptions, itrAnalysisReport, metricDetails, exportMetric };
