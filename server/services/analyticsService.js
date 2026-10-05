import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import InventoryTransaction from '../models/InventoryTransaction.js';
import Expense from '../models/Expense.js';
import Customer from '../models/Customer.js';
import ApiError from '../utils/ApiError.js';
import { parseDateRange } from '../utils/dateRanges.js';
import { round2 } from '../utils/gstCalculator.js';

// Single source of truth for dashboard KPIs, detail pages, exports and the P&L report, so every
// screen shows the same figures for the same filters.
//
//   COGS                     = Σ (units sold × product purchase price) for completed / partially returned sales
//   Average Inventory        = (Opening Inventory + Closing Inventory) ÷ 2          (valued at purchase price)
//   ITR                      = COGS ÷ Average Inventory
//   Inventory Holding Period = Current Inventory ÷ Average Daily Consumption (COGS ÷ days in period)
//   EBITDA                   = Net Profit + Interest + Taxes + Depreciation + Amortization
//   Product ROI              = (Revenue ex-GST − COGS) ÷ COGS × 100

export const SALE_STATUSES = ['completed', 'partially_returned'];
export const BELOW_THE_LINE = { interest: 'interest', taxes: 'income_tax', depreciation: 'depreciation', amortization: 'amortization' };
export const STOCK_STATUSES = ['in_stock', 'low_stock', 'out_of_stock'];
export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'credit'];
export const EXPENSE_CATEGORIES = Expense.schema.path('category').enumValues;
export const RANGE_KEYS = ['today', 'yesterday', 'this_week', 'this_month', 'previous_month', 'this_year', 'previous_year', 'custom'];
export const FILTER_KEYS = ['range', 'from', 'to', 'product', 'category', 'brand', 'stockStatus', 'expenseCategory', 'paymentMethod'];

const DAY_MS = 24 * 60 * 60 * 1000;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const ratio = (a, b, digits = 2) => (b > 0 ? Math.round((a / b) * 10 ** digits) / 10 ** digits : null);

export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export function hasFilterParams(query) {
  return FILTER_KEYS.some((k) => query[k] !== undefined && query[k] !== '');
}

// Validates and normalises dashboard filters. `defaults.range` is used when no date filter is given.
export function parseFilters(query = {}, defaults = {}) {
  const f = {};
  const str = (v) => (Array.isArray(v) ? v[0] : v) || '';
  const range = str(query.range) || defaults.range || 'this_month';
  if (!RANGE_KEYS.includes(range)) throw new ApiError(400, 'Unknown date range.');

  if (range === 'custom' || query.from || query.to) {
    const from = new Date(str(query.from));
    const to = new Date(str(query.to));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ApiError(400, 'Please choose both a valid start and end date.');
    if (from > to) throw new ApiError(400, 'The start date must be on or before the end date.');
    Object.assign(f, parseDateRange({ from: str(query.from), to: str(query.to) }), { range: 'custom', fromInput: str(query.from), toInput: str(query.to) });
  } else {
    Object.assign(f, parseDateRange({ range }), { range });
  }

  for (const key of ['product', 'category', 'brand']) {
    const v = str(query[key]);
    if (v) {
      if (!mongoose.isValidObjectId(v)) throw new ApiError(400, `Invalid ${key} filter.`);
      f[key] = v;
    }
  }
  const enumFilter = (key, allowed) => {
    const v = str(query[key]);
    if (!v) return;
    if (!allowed.includes(v)) throw new ApiError(400, `Invalid ${key} filter.`);
    f[key] = v;
  };
  enumFilter('stockStatus', STOCK_STATUSES);
  enumFilter('expenseCategory', EXPENSE_CATEGORIES);
  enumFilter('paymentMethod', PAYMENT_METHODS);

  // Days elapsed in the period (a period ending in the future only counts up to now).
  const effectiveEnd = Math.min(f.to.getTime(), Date.now());
  f.days = Math.max(1, Math.ceil((effectiveEnd - f.from.getTime()) / DAY_MS));
  return f;
}

export function stockStatusOf(qty, reorderLevel) {
  if (qty <= 0) return 'out_of_stock';
  if (qty <= (reorderLevel ?? 0)) return 'low_stock';
  return 'in_stock';
}

async function stockByProduct(ids) {
  const match = ids ? { product: { $in: ids } } : {};
  const rows = await Inventory.aggregate([{ $match: match }, { $group: { _id: '$product', qty: { $sum: '$currentStock' } } }]);
  return new Map(rows.map((r) => [String(r._id), r.qty]));
}

// Net stock movement per product recorded strictly after `date` (positive = stock in).
async function movementsAfter(date, ids) {
  if (date.getTime() >= Date.now()) return new Map();
  const match = { createdAt: { $gt: date } };
  if (ids) match.product = { $in: ids };
  const rows = await InventoryTransaction.aggregate([{ $match: match }, { $group: { _id: '$product', qty: { $sum: '$quantity' } } }]);
  return new Map(rows.map((r) => [String(r._id), r.qty]));
}

// Resolves product / category / stock-status filters to a product id list (null = no product restriction).
export async function resolveProductScope(f) {
  if (!f.product && !f.category && !f.brand && !f.stockStatus) return null;
  const match = {};
  if (f.product) match._id = oid(f.product);
  if (f.category) match.$or = [{ category: oid(f.category) }, { subcategory: oid(f.category) }];
  if (f.brand) match.brand = oid(f.brand);
  const products = await Product.find(match).select('_id reorderLevel').lean();
  if (!f.stockStatus) return products.map((p) => p._id);
  const stock = await stockByProduct(products.map((p) => p._id));
  return products.filter((p) => stockStatusOf(stock.get(String(p._id)) || 0, p.reorderLevel) === f.stockStatus).map((p) => p._id);
}

function saleMatch(from, to, { paymentMethod } = {}) {
  const m = { createdAt: { $gte: from, $lte: to }, status: { $in: SALE_STATUSES } };
  if (paymentMethod) m['payments.method'] = paymentMethod;
  return m;
}

// Per-product sales for the period: units, revenue ex-GST (taxable), revenue incl. GST and COGS.
export async function salesByProduct(from, to, ids, opts = {}) {
  const pipeline = [{ $match: saleMatch(from, to, opts) }, { $unwind: '$items' }];
  if (ids) pipeline.push({ $match: { 'items.product': { $in: ids } } });
  pipeline.push(
    { $group: { _id: '$items.product', units: { $sum: '$items.quantity' }, revenue: { $sum: '$items.taxableAmount' }, grossRevenue: { $sum: '$items.totalAmount' } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p' } },
    { $unwind: '$p' },
    { $lookup: { from: 'categories', localField: 'p.category', foreignField: '_id', as: 'c' } },
    { $project: {
      units: 1, revenue: 1, grossRevenue: 1,
      name: '$p.name', sku: '$p.sku', category: { $ifNull: [{ $arrayElemAt: ['$c.name', 0] }, 'Uncategorized'] },
      purchasePrice: '$p.purchasePrice', cogs: { $multiply: ['$units', '$p.purchasePrice'] },
    } },
  );
  return Sale.aggregate(pipeline);
}

export async function salesTotal(from, to, ids, opts = {}) {
  if (!ids) {
    const rows = await Sale.aggregate([{ $match: saleMatch(from, to, opts) }, { $group: { _id: null, total: { $sum: '$grandTotal' }, invoices: { $sum: 1 } } }]);
    return { value: round2(rows[0]?.total || 0), invoices: rows[0]?.invoices || 0 };
  }
  const rows = await salesByProduct(from, to, ids, opts);
  return { value: round2(rows.reduce((s, r) => s + (r.grossRevenue || 0), 0)), invoices: null };
}

export async function purchasesTotal(from, to) {
  const rows = await Purchase.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' } } },
    { $group: { _id: null, total: { $sum: '$grandTotal' } } },
  ]);
  return round2(rows[0]?.total || 0);
}

export async function expensesTotal(from, to, { expenseCategory } = {}) {
  const match = { expenseDate: { $gte: from, $lte: to } };
  if (expenseCategory) match.category = expenseCategory;
  const rows = await Expense.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]);
  return { value: round2(rows[0]?.total || 0), count: rows[0]?.count || 0 };
}

// Profit on sales for the period (revenue ex-GST minus COGS).
export async function productProfitability(from, to, ids, opts = {}) {
  const rows = await salesByProduct(from, to, ids, opts);
  const products = rows.map((r) => {
    const profit = round2(r.revenue - r.cogs);
    return {
      productId: r._id, name: r.name, sku: r.sku, category: r.category,
      units: r.units, revenue: round2(r.revenue), cogs: round2(r.cogs), profit,
      marginPercent: ratio(profit * 100, r.revenue, 1),
      roiPercent: ratio(profit * 100, r.cogs, 1),
    };
  }).sort((a, b) => b.revenue - a.revenue);
  const revenue = round2(products.reduce((s, r) => s + r.revenue, 0));
  const cogs = round2(products.reduce((s, r) => s + r.cogs, 0));
  const profit = round2(revenue - cogs);
  return {
    products,
    totals: { revenue, cogs, profit, marginPercent: ratio(profit * 100, revenue, 1), roiPercent: ratio(profit * 100, cogs, 1) },
  };
}

// Opening / closing / current inventory, COGS, ITR and holding period, per product and in total.
// Stock at a past instant = current stock − net InventoryTransaction movements recorded after that instant.
export async function inventoryAnalysis(f, ids) {
  const productMatch = ids ? { _id: { $in: ids } } : {};
  const [products, current, afterFrom, afterTo, sales] = await Promise.all([
    Product.find(productMatch).select('name sku category purchasePrice reorderLevel unit').populate('category', 'name').lean(),
    stockByProduct(ids),
    movementsAfter(f.from, ids),
    movementsAfter(f.to, ids),
    salesByProduct(f.from, f.to, ids),
  ]);
  const salesMap = new Map(sales.map((s) => [String(s._id), s]));

  const rows = products.map((p) => {
    const id = String(p._id);
    const price = p.purchasePrice || 0;
    const currentQty = current.get(id) || 0;
    const openingQty = Math.max(0, currentQty - (afterFrom.get(id) || 0));
    const closingQty = Math.max(0, currentQty - (afterTo.get(id) || 0));
    const s = salesMap.get(id);
    const unitsSold = s?.units || 0;
    const cogs = round2(unitsSold * price);
    const openingValue = round2(openingQty * price);
    const closingValue = round2(closingQty * price);
    const averageInventory = round2((openingValue + closingValue) / 2);
    const currentValue = round2(currentQty * price);
    const avgDailyUnits = unitsSold / f.days;
    return {
      productId: p._id, name: p.name, sku: p.sku, category: p.category?.name || 'Uncategorized', unit: p.unit,
      purchasePrice: price, reorderLevel: p.reorderLevel, stockStatus: stockStatusOf(currentQty, p.reorderLevel),
      openingQty, closingQty, currentQty, unitsSold,
      openingValue, closingValue, averageInventory, currentValue, cogs,
      itr: ratio(cogs, averageInventory, 3),
      avgDailyUnits: Math.round(avgDailyUnits * 100) / 100,
      holdingDays: avgDailyUnits > 0 ? Math.round((currentQty / avgDailyUnits) * 10) / 10 : null,
    };
  });

  const sum = (k) => round2(rows.reduce((s, r) => s + r[k], 0));
  const openingInventory = sum('openingValue');
  const closingInventory = sum('closingValue');
  const averageInventory = round2((openingInventory + closingInventory) / 2);
  const cogs = sum('cogs');
  const currentInventory = sum('currentValue');
  const avgDailyConsumption = round2(cogs / f.days);
  return {
    rows,
    totals: {
      openingInventory, closingInventory, averageInventory, cogs, currentInventory, avgDailyConsumption,
      itr: ratio(cogs, averageInventory, 3),
      holdingDays: avgDailyConsumption > 0 ? Math.round((currentInventory / avgDailyConsumption) * 10) / 10 : null,
      days: f.days,
      lowStockItems: rows.filter((r) => r.stockStatus !== 'in_stock').length,
      outOfStockItems: rows.filter((r) => r.stockStatus === 'out_of_stock').length,
    },
  };
}

// Company-level P&L for the period (shared with Reports > Profit & Loss) plus EBITDA.
export async function financialSummary(from, to) {
  const [salesAgg, returnsAgg, cogsAgg, purchaseAgg, expenseAgg] = await Promise.all([
    Sale.aggregate([
      { $match: saleMatch(from, to) },
      { $group: { _id: null, grossSales: { $sum: '$subtotal' }, discounts: { $sum: '$discount' } } },
    ]),
    Sale.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['returned', 'partially_returned'] } } },
      { $lookup: { from: 'salesreturns', localField: '_id', foreignField: 'sale', as: 'ret' } },
      { $unwind: '$ret' },
      { $group: { _id: null, returns: { $sum: '$ret.totalRefund' } } },
    ]),
    Sale.aggregate([
      { $match: saleMatch(from, to) },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      { $group: { _id: null, cogs: { $sum: { $multiply: ['$items.quantity', '$p.purchasePrice'] } } } },
    ]),
    Purchase.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' } } },
      { $group: { _id: null, total: { $sum: '$subtotal' } } },
    ]),
    Expense.aggregate([
      { $match: { expenseDate: { $gte: from, $lte: to } } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
    ]),
  ]);

  const grossSales = round2(salesAgg[0]?.grossSales || 0);
  const discounts = round2(salesAgg[0]?.discounts || 0);
  const returns = round2(returnsAgg[0]?.returns || 0);
  const netSales = round2(grossSales - discounts - returns);
  const cogs = round2(cogsAgg[0]?.cogs || 0);
  const purchaseCost = round2(purchaseAgg[0]?.total || 0);
  const expensesByCategory = Object.fromEntries(expenseAgg.map((e) => [e._id, round2(e.total)]));
  const totalExpenses = round2(expenseAgg.reduce((s, e) => s + e.total, 0));
  const grossProfit = round2(netSales - cogs);
  const netProfit = round2(grossProfit - totalExpenses);

  const addBacks = Object.fromEntries(Object.entries(BELOW_THE_LINE).map(([k, cat]) => [k, expensesByCategory[cat] || 0]));
  const ebitda = round2(netProfit + addBacks.interest + addBacks.taxes + addBacks.depreciation + addBacks.amortization);

  return {
    revenue: { grossSales, discounts, returns, netSales },
    cost: { costOfGoodsSold: cogs, purchaseCost, otherCosts: totalExpenses },
    profit: { grossProfit, operatingExpenses: totalExpenses, netProfit, grossMarginPercent: ratio(grossProfit * 100, netSales, 1) },
    expensesByCategory,
    ebitda: { value: ebitda, netProfit, ...addBacks, marginPercent: ratio(ebitda * 100, netSales, 1) },
  };
}

export async function receivablesTotal() {
  const rows = await Customer.aggregate([{ $match: { outstanding: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$outstanding' }, count: { $sum: 1 } } }]);
  return { value: round2(rows[0]?.total || 0), count: rows[0]?.count || 0 };
}

export async function payablesTotal() {
  const rows = await Purchase.aggregate([
    { $match: { status: { $in: ['received', 'invoiced'] } } },
    { $project: { balance: { $subtract: ['$grandTotal', '$amountPaid'] } } },
    { $match: { balance: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } },
  ]);
  return { value: round2(rows[0]?.total || 0), count: rows[0]?.count || 0 };
}

export function pctChange(curr, prev) {
  if (!prev) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10;
}

export function todayAndYesterday() {
  const now = new Date();
  const y = new Date(now); y.setDate(y.getDate() - 1);
  return { today: { from: startOfDay(now), to: endOfDay(now) }, yesterday: { from: startOfDay(y), to: endOfDay(y) } };
}

export default {
  parseFilters, hasFilterParams, resolveProductScope, salesByProduct, salesTotal, purchasesTotal, expensesTotal,
  productProfitability, inventoryAnalysis, financialSummary, receivablesTotal, payablesTotal, pctChange, todayAndYesterday,
};
