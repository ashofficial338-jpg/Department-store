import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import SalesReturn from '../models/SalesReturn.js';
import Purchase from '../models/Purchase.js';
import PurchaseReturn from '../models/PurchaseReturn.js';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import Expense from '../models/Expense.js';
import Customer from '../models/Customer.js';
import Vendor from '../models/Vendor.js';
import Supplier from '../models/Supplier.js';
import Store from '../models/Store.js';
import Payment from '../models/Payment.js';
import Account from '../models/Account.js';
import LedgerEntry from '../models/LedgerEntry.js';
import ApiError from '../utils/ApiError.js';
import { round2 } from '../utils/gstCalculator.js';
import { getFinancialYearCode } from '../utils/financialYear.js';
import {
  parseFilters, resolveProductScope, stockStatusOf, pctChange, SALE_STATUSES, BELOW_THE_LINE,
} from './analyticsService.js';

// Advanced reporting engine. Every figure comes from the live database at request time, and the same
// numbers feed the Analytics page, the PDF and the Excel workbook. Formulas follow analyticsService
// (the dashboard), so a report and the dashboard agree for the same filters:
//   Revenue        = invoice grand totals incl. GST (line totals when product filters apply)
//   Net Sales      = taxable value after discounts − sales returns
//   COGS           = units sold × product purchase price
//   Gross Profit   = Net Sales − COGS            Net Profit = Gross Profit − Expenses
//   Gross / Net Margin = profit ÷ Net Sales

export const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];
export const TRANSACTION_TYPES = ['sale', 'sales_return', 'purchase', 'purchase_return', 'expense', 'payment'];
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
const DAY_MS = 86400000;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const pct = (a, b) => (b ? round2((a / b) * 100) : null);
const sum = (rows, k) => round2(rows.reduce((t, r) => t + (Number(r[k]) || 0), 0));

// ---------------------------------------------------------------- filters

export function parseReportFilters(query = {}) {
  const f = parseFilters(query, { range: 'this_month' });
  const str = (v) => (Array.isArray(v) ? v[0] : v) || '';
  for (const key of ['supplier', 'vendor']) {
    const v = str(query[key]);
    if (v) {
      if (!mongoose.isValidObjectId(v)) throw new ApiError(400, `Invalid ${key} filter.`);
      f[key] = v;
    }
  }
  const tt = str(query.transactionType);
  if (tt) {
    if (!TRANSACTION_TYPES.includes(tt)) throw new ApiError(400, 'Invalid transaction type.');
    f.transactionType = tt;
  }
  const g = str(query.granularity);
  if (g && g !== 'auto' && !GRANULARITIES.includes(g)) throw new ApiError(400, 'Invalid granularity.');
  f.granularity = g && g !== 'auto' ? g : (f.days <= 31 ? 'day' : f.days <= 92 ? 'week' : f.days <= 731 ? 'month' : 'quarter');
  f.compare = str(query.compare) !== 'false';

  // Previous period of the same length, ending just before this one starts.
  const effectiveEnd = new Date(Math.min(f.to.getTime(), Date.now()));
  const span = effectiveEnd.getTime() - f.from.getTime();
  f.prevTo = new Date(f.from.getTime() - 1);
  f.prevFrom = new Date(f.from.getTime() - span - 1);
  f.effectiveEnd = effectiveEnd;
  return f;
}

// Product filters (product, category, brand, stock status, manufacturer) resolve to a product id list; null = all products.
export async function resolveScope(f) {
  let ids = await resolveProductScope(f);
  if (f.supplier) {
    const bySupplier = await Product.find({ primarySupplier: oid(f.supplier) }).distinct('_id');
    ids = ids ? ids.filter((id) => bySupplier.some((s) => String(s) === String(id))) : bySupplier;
  }
  return ids;
}

export function describeFilters(f, names = {}) {
  const fmt = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const parts = [`${fmt(f.from)} – ${fmt(f.effectiveEnd < f.to ? f.effectiveEnd : f.to)}`];
  if (f.product) parts.push(`Product: ${names.product || f.product}`);
  if (f.category) parts.push(`Category: ${names.category || f.category}`);
  if (f.brand) parts.push(`Brand: ${names.brand || f.brand}`);
  if (f.supplier) parts.push(`Manufacturer: ${names.supplier || f.supplier}`);
  if (f.vendor) parts.push(`Vendor: ${names.vendor || f.vendor}`);
  if (f.paymentMethod) parts.push(`Payment: ${f.paymentMethod.replace('_', ' ')}`);
  if (f.expenseCategory) parts.push(`Expense: ${f.expenseCategory.replace('_', ' ')}`);
  if (f.stockStatus) parts.push(`Stock: ${f.stockStatus.replace(/_/g, ' ')}`);
  if (f.transactionType) parts.push(`Transactions: ${f.transactionType.replace('_', ' ')}`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------- buckets

const pad = (n) => String(n).padStart(2, '0');
const dayKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function bucketOf(dayKey, granularity) {
  const d = parseDay(dayKey);
  switch (granularity) {
    case 'week': { const s = new Date(d); s.setDate(s.getDate() - s.getDay()); return { key: dayKeyOf(s), label: `Week of ${s.getDate()} ${MONTHS[s.getMonth()]}` }; }
    case 'month': return { key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    case 'quarter': {
      const fy = getFinancialYearCode(d);
      const q = ((Math.floor(d.getMonth() / 3) + 3) % 4) + 1; // Apr-Jun = Q1
      return { key: `${fy}-Q${q}`, label: `Q${q} FY${fy.slice(0, 2)}-${fy.slice(2)}` };
    }
    case 'year': { const fy = getFinancialYearCode(d); return { key: `FY${fy}`, label: `FY 20${fy.slice(0, 2)}-${fy.slice(2)}` }; }
    default: return { key: dayKey, label: `${d.getDate()} ${MONTHS[d.getMonth()]}` };
  }
}

function eachDay(from, to) {
  const out = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= to; d.setDate(d.getDate() + 1)) out.push(dayKeyOf(d));
  return out;
}

// ---------------------------------------------------------------- facts

function saleMatch(from, to, f, ids) {
  const m = { createdAt: { $gte: from, $lte: to }, status: { $in: SALE_STATUSES } };
  if (f.paymentMethod) m['payments.method'] = f.paymentMethod;
  if (ids) m['items.product'] = { $in: ids };
  return m;
}
const dayExpr = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: TZ } });

let productCache = { at: 0, map: null };
async function productMeta() {
  if (productCache.map && Date.now() - productCache.at < 30000) return productCache.map;
  const [products, brands, cats, suppliers] = await Promise.all([
    Product.find().select('name sku hsn gstRate unit mrp sellingPrice purchasePrice reorderLevel status brand category subcategory primarySupplier primaryVendor').lean(),
    mongoose.model('Brand').find().select('name').lean(),
    mongoose.model('Category').find().select('name parent').lean(),
    Supplier.find().select('name').lean(),
  ]);
  const name = (list) => new Map(list.map((x) => [String(x._id), x.name]));
  const bn = name(brands); const cn = name(cats); const sn = name(suppliers);
  const map = new Map(products.map((p) => [String(p._id), {
    ...p, id: String(p._id),
    brandName: bn.get(String(p.brand)) || 'Unbranded',
    categoryName: cn.get(String(p.category)) || 'Uncategorized',
    subcategoryName: cn.get(String(p.subcategory)) || '',
    supplierName: sn.get(String(p.primarySupplier)) || '',
  }]));
  productCache = { at: Date.now(), map };
  return map;
}

// One pass over sales, returns, expenses and purchases for a period, kept per day and per product.
export async function buildFacts(from, to, f, ids) {
  const products = await productMeta();
  const idSet = ids ? new Set(ids.map(String)) : null;
  const sm = saleMatch(from, to, f, ids);
  const lineMatch = ids ? [{ $match: { 'items.product': { $in: ids } } }] : [];

  const [lines, invoices, returns, expenses, purchases, purchaseLines] = await Promise.all([
    Sale.aggregate([
      { $match: sm }, { $unwind: '$items' }, ...lineMatch,
      { $group: {
        _id: { day: dayExpr('$createdAt'), product: '$items.product', rate: '$items.gstRate' },
        units: { $sum: '$items.quantity' }, gross: { $sum: '$items.grossAmount' }, discount: { $sum: '$items.discountAmount' },
        taxable: { $sum: '$items.taxableAmount' }, cgst: { $sum: '$items.cgst' }, sgst: { $sum: '$items.sgst' }, igst: { $sum: '$items.igst' },
        tax: { $sum: '$items.taxAmount' }, total: { $sum: '$items.totalAmount' },
      } },
    ]),
    Sale.aggregate([{ $match: sm }, { $group: { _id: dayExpr('$createdAt'), revenue: { $sum: '$grandTotal' }, invoices: { $sum: 1 } } }]),
    SalesReturn.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      ...(ids ? [{ $unwind: '$items' }, { $match: { 'items.product': { $in: ids } } }, { $group: { _id: dayExpr('$createdAt'), amount: { $sum: '$items.refundAmount' } } }]
        : [{ $group: { _id: dayExpr('$createdAt'), amount: { $sum: '$totalRefund' } } }]),
    ]),
    Expense.aggregate([
      { $match: { expenseDate: { $gte: from, $lte: to }, ...(f.expenseCategory ? { category: f.expenseCategory } : {}) } },
      { $group: { _id: { day: dayExpr('$expenseDate'), category: '$category' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Purchase.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' }, ...(f.vendor ? { vendor: oid(f.vendor) } : {}), ...(ids ? { 'items.product': { $in: ids } } : {}) } },
      { $group: { _id: dayExpr('$createdAt'), total: { $sum: '$grandTotal' }, taxable: { $sum: '$subtotal' }, tax: { $sum: '$taxAmount' }, count: { $sum: 1 } } },
    ]),
    Purchase.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' }, ...(f.vendor ? { vendor: oid(f.vendor) } : {}) } },
      { $unwind: '$items' }, ...lineMatch,
      { $group: { _id: { rate: '$items.gstRate' }, taxable: { $sum: '$items.taxableAmount' }, tax: { $sum: '$items.taxAmount' }, total: { $sum: '$items.totalAmount' }, units: { $sum: '$items.quantity' } } },
    ]),
  ]);

  const days = new Map();
  const day = (k) => {
    if (!days.has(k)) days.set(k, { revenue: 0, invoices: 0, gross: 0, discount: 0, taxable: 0, tax: 0, cogs: 0, units: 0, returns: 0, expenses: 0, expenseCount: 0, purchases: 0, purchaseCount: 0 });
    return days.get(k);
  };
  const byProduct = new Map();
  const gstOut = new Map();
  for (const l of lines) {
    const p = products.get(String(l._id.product));
    const cogs = l.units * (p?.purchasePrice || 0);
    const d = day(l._id.day);
    d.gross += l.gross; d.discount += l.discount; d.taxable += l.taxable; d.tax += l.tax; d.cogs += cogs; d.units += l.units;
    if (ids) { d.revenue += l.total; }
    const pk = String(l._id.product);
    const pr = byProduct.get(pk) || { units: 0, taxable: 0, total: 0, cogs: 0, tax: 0 };
    pr.units += l.units; pr.taxable += l.taxable; pr.total += l.total; pr.cogs += cogs; pr.tax += l.tax;
    byProduct.set(pk, pr);
    const rate = l._id.rate ?? 0;
    const g = gstOut.get(rate) || { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 };
    g.taxable += l.taxable; g.cgst += l.cgst; g.sgst += l.sgst; g.igst += l.igst; g.tax += l.tax; g.total += l.total;
    gstOut.set(rate, g);
  }
  for (const i of invoices) { const d = day(i._id); d.invoices += i.invoices; if (!ids) d.revenue += i.revenue; }
  for (const r of returns) day(r._id).returns += r.amount;
  const expenseByCategory = new Map();
  for (const e of expenses) {
    const d = day(e._id.day); d.expenses += e.amount; d.expenseCount += e.count;
    expenseByCategory.set(e._id.category, (expenseByCategory.get(e._id.category) || 0) + e.amount);
  }
  for (const p of purchases) { const d = day(p._id); d.purchases += p.total; d.purchaseCount += p.count; }
  if (ids) {
    // With product filters, purchases count only the filtered products' lines.
    const scoped = await Purchase.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' }, ...(f.vendor ? { vendor: oid(f.vendor) } : {}) } },
      { $unwind: '$items' }, { $match: { 'items.product': { $in: ids } } },
      { $group: { _id: dayExpr('$createdAt'), total: { $sum: '$items.totalAmount' } } },
    ]);
    days.forEach((d) => { d.purchases = 0; });
    for (const s of scoped) day(s._id).purchases += s.total;
  }
  const gstIn = new Map(purchaseLines.map((r) => [r._id.rate ?? 0, r]));
  return { days, byProduct, gstOut, gstIn, expenseByCategory, products, idSet, scoped: !!ids || !!f.paymentMethod };
}

export function summarize(facts) {
  const t = { revenue: 0, invoices: 0, gross: 0, discount: 0, taxable: 0, tax: 0, cogs: 0, units: 0, returns: 0, expenses: 0, expenseCount: 0, purchases: 0, purchaseCount: 0 };
  facts.days.forEach((d) => { Object.keys(t).forEach((k) => { t[k] += d[k]; }); });
  Object.keys(t).forEach((k) => { t[k] = round2(t[k]); });
  const netSales = round2(t.taxable - t.returns);
  const grossProfit = round2(netSales - t.cogs);
  const expensesByCategory = Object.fromEntries([...facts.expenseByCategory].map(([k, v]) => [k, round2(v)]));
  const addBacks = Object.fromEntries(Object.entries(BELOW_THE_LINE).map(([k, cat]) => [k, expensesByCategory[cat] || 0]));
  // Expenses are not allocated to products or payment methods, so net profit is only shown for the whole business.
  const netProfit = facts.scoped ? null : round2(grossProfit - t.expenses);
  let gstOutput = 0; facts.gstOut.forEach((g) => { gstOutput += g.tax; });
  let gstInput = 0; facts.gstIn.forEach((g) => { gstInput += g.tax; });
  return {
    revenue: t.revenue, invoices: t.invoices, averageBill: t.invoices ? round2(t.revenue / t.invoices) : 0, unitsSold: t.units,
    grossSales: t.gross, discounts: t.discount, returns: t.returns, netSales, cogs: t.cogs, grossProfit,
    grossMargin: pct(grossProfit, netSales),
    expenses: t.expenses, expenseCount: t.expenseCount, purchases: t.purchases, purchaseOrders: t.purchaseCount,
    netProfit, netMargin: netProfit === null ? null : pct(netProfit, netSales),
    ebitda: netProfit === null ? null : round2(netProfit + addBacks.interest + addBacks.taxes + addBacks.depreciation + addBacks.amortization),
    gstOutput: round2(gstOutput), gstInput: round2(gstInput), gstNet: round2(gstOutput - gstInput),
    expensesByCategory, addBacks,
  };
}

export function trendRows(facts, f) {
  const buckets = new Map();
  for (const dk of eachDay(f.from, f.effectiveEnd)) {
    const b = bucketOf(dk, f.granularity);
    if (!buckets.has(b.key)) buckets.set(b.key, { period: b.key, label: b.label, revenue: 0, invoices: 0, taxable: 0, returns: 0, cogs: 0, expenses: 0, purchases: 0 });
    const d = facts.days.get(dk);
    if (!d) continue;
    const r = buckets.get(b.key);
    r.revenue += d.revenue; r.invoices += d.invoices; r.taxable += d.taxable; r.returns += d.returns; r.cogs += d.cogs; r.expenses += d.expenses; r.purchases += d.purchases;
  }
  let prevProfit = null;
  return [...buckets.values()].map((r) => {
    const netSales = round2(r.taxable - r.returns);
    const grossProfit = round2(netSales - r.cogs);
    const netProfit = facts.scoped ? null : round2(grossProfit - r.expenses);
    const basis = netProfit ?? grossProfit;
    const growth = prevProfit === null || prevProfit === 0 ? null : round2(((basis - prevProfit) / Math.abs(prevProfit)) * 100);
    prevProfit = basis;
    return {
      period: r.period, label: r.label, revenue: round2(r.revenue), invoices: r.invoices, netSales, cogs: round2(r.cogs), grossProfit,
      expenses: round2(r.expenses), purchases: round2(r.purchases), netProfit, netMargin: netProfit === null ? null : pct(netProfit, netSales), profitGrowth: growth,
    };
  });
}

export function productRows(facts) {
  return [...facts.products.values()]
    .filter((p) => !facts.idSet || facts.idSet.has(p.id))
    .map((p) => {
      const s = facts.byProduct.get(p.id) || { units: 0, taxable: 0, total: 0, cogs: 0 };
      return {
        productId: p.id, sku: p.sku, name: p.name, brand: p.brandName, category: p.categoryName, subcategory: p.subcategoryName,
        supplier: p.supplierName, hsn: p.hsn || '', gstRate: p.gstRate || 0, unit: p.unit, mrp: p.mrp,
        purchasePrice: p.purchasePrice, sellingPrice: p.sellingPrice,
        unitMargin: p.sellingPrice ? round2(((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100) : null,
        units: s.units, revenue: round2(s.total), netSales: round2(s.taxable), cogs: round2(s.cogs),
        grossProfit: round2(s.taxable - s.cogs), profitMargin: pct(s.taxable - s.cogs, s.taxable), status: p.status,
      };
    });
}

export function groupRows(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const g = m.get(r[key]) || { name: r[key], products: 0, activeProducts: 0, units: 0, revenue: 0, netSales: 0, cogs: 0 };
    g.products += 1; if (r.units > 0) g.activeProducts += 1;
    g.units += r.units; g.revenue += r.revenue; g.netSales += r.netSales; g.cogs += r.cogs;
    m.set(r[key], g);
  }
  const total = [...m.values()].reduce((t, g) => t + g.revenue, 0);
  return [...m.values()].map((g) => ({
    ...g, revenue: round2(g.revenue), netSales: round2(g.netSales), cogs: round2(g.cogs), grossProfit: round2(g.netSales - g.cogs),
    profitMargin: pct(g.netSales - g.cogs, g.netSales), share: pct(g.revenue, total),
  })).sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------- inventory

export async function stockRows(facts, f) {
  const stock = new Map((await Inventory.aggregate([{ $group: { _id: '$product', qty: { $sum: '$currentStock' } } }])).map((r) => [String(r._id), r.qty]));
  const days = Math.max(1, Math.ceil((f.effectiveEnd - f.from) / DAY_MS));
  return [...facts.products.values()]
    .filter((p) => (!facts.idSet || facts.idSet.has(p.id)) && p.status !== 'discontinued')
    .map((p) => {
      const qty = stock.get(p.id) || 0;
      const sold = facts.byProduct.get(p.id)?.units || 0;
      const daily = sold / days;
      const status = stockStatusOf(qty, p.reorderLevel);
      return {
        productId: p.id, sku: p.sku, name: p.name, brand: p.brandName, category: p.categoryName, supplier: p.supplierName,
        stock: qty, reorderLevel: p.reorderLevel, status, statusLabel: { in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock' }[status],
        purchasePrice: p.purchasePrice, sellingPrice: p.sellingPrice,
        stockValue: round2(qty * p.purchasePrice), retailValue: round2(qty * p.sellingPrice), expectedProfit: round2(qty * (p.sellingPrice - p.purchasePrice)),
        dailySales: round2(daily), daysOfCover: daily > 0 ? round2(qty / daily) : null,
        reorderQty: Math.max(0, (p.reorderLevel || 0) * 2 - qty),
      };
    })
    .filter((r) => !f.stockStatus || r.status === f.stockStatus);
}

// ---------------------------------------------------------------- money

export async function cashflow(f) {
  const money = await Account.find({ accountGroup: { $in: ['cash', 'bank'] } }).lean();
  const ids = money.map((a) => a._id);
  if (!ids.length) return { accounts: [], sources: [], inflow: 0, outflow: 0, net: 0, hasLedger: false };
  const [before, during, bySource, total] = await Promise.all([
    LedgerEntry.aggregate([{ $match: { account: { $in: ids }, entryDate: { $lt: f.from } } }, { $group: { _id: { a: '$account', t: '$entryType' }, amt: { $sum: '$amount' } } }]),
    LedgerEntry.aggregate([{ $match: { account: { $in: ids }, entryDate: { $gte: f.from, $lte: f.to } } }, { $group: { _id: { a: '$account', t: '$entryType' }, amt: { $sum: '$amount' } } }]),
    LedgerEntry.aggregate([
      { $match: { account: { $in: ids }, entryDate: { $gte: f.from, $lte: f.to }, referenceType: { $ne: 'Contra' } } },
      { $group: { _id: { r: '$referenceType', t: '$entryType' }, amt: { $sum: '$amount' } } },
    ]),
    LedgerEntry.estimatedDocumentCount(),
  ]);
  const get = (rows, a, t) => rows.find((r) => String(r._id.a) === String(a) && r._id.t === t)?.amt || 0;
  const accounts = money.map((a) => {
    const opening = round2((a.openingBalance || 0) + get(before, a._id, 'debit') - get(before, a._id, 'credit'));
    const inflow = round2(get(during, a._id, 'debit'));
    const outflow = round2(get(during, a._id, 'credit'));
    return { account: a.name, opening, inflow, outflow, closing: round2(opening + inflow - outflow) };
  });
  const LABELS = { Sale: 'Sales collections', Payment: 'Payment vouchers (receipts & vendor payments)', Purchase: 'Vendor bill payments', Expense: 'Business expenses', SalesReturn: 'Customer refunds', PurchaseReturn: 'Vendor returns' };
  const srcMap = new Map();
  for (const r of bySource) {
    const k = r._id.r || 'Other';
    const s = srcMap.get(k) || { source: LABELS[k] || k, inflow: 0, outflow: 0 };
    if (r._id.t === 'debit') s.inflow += r.amt; else s.outflow += r.amt;
    srcMap.set(k, s);
  }
  const sources = [...srcMap.values()].map((s) => ({ ...s, inflow: round2(s.inflow), outflow: round2(s.outflow), net: round2(s.inflow - s.outflow) }));
  const inflow = sum(sources, 'inflow'); const outflow = sum(sources, 'outflow');
  return { accounts, sources, inflow, outflow, net: round2(inflow - outflow), hasLedger: total > 0 };
}

export async function outstanding() {
  const [customers, bills] = await Promise.all([
    Customer.find({ outstanding: { $gt: 0 } }).select('name phone outstanding creditLimit updatedAt').sort({ outstanding: -1 }).lean(),
    Purchase.aggregate([
      { $match: { status: { $in: ['received', 'invoiced'] } } },
      { $project: { vendor: 1, poNumber: 1, invoiceNumber: 1, createdAt: 1, grandTotal: 1, amountPaid: 1, balance: { $subtract: ['$grandTotal', '$amountPaid'] } } },
      { $match: { balance: { $gt: 0.009 } } },
      { $lookup: { from: 'vendors', localField: 'vendor', foreignField: '_id', as: 'v' } },
      { $sort: { createdAt: 1 } },
    ]),
  ]);
  const now = Date.now();
  const rows = [
    ...customers.map((c) => ({ type: 'Receivable', party: c.name, reference: c.phone, date: c.updatedAt, ageDays: null, total: null, paid: null, due: round2(c.outstanding) })),
    ...bills.map((b) => ({
      type: 'Payable', party: b.v[0]?.name || '—', reference: b.invoiceNumber ? `${b.poNumber} / ${b.invoiceNumber}` : b.poNumber, date: b.createdAt,
      ageDays: Math.floor((now - new Date(b.createdAt).getTime()) / DAY_MS), total: round2(b.grandTotal), paid: round2(b.amountPaid), due: round2(b.balance),
    })),
  ];
  return {
    rows,
    receivables: sum(rows.filter((r) => r.type === 'Receivable'), 'due'), receivableCount: customers.length,
    payables: sum(rows.filter((r) => r.type === 'Payable'), 'due'), payableCount: bills.length,
  };
}

export async function paymentMix(f, ids) {
  const rows = await Sale.aggregate([
    { $match: saleMatch(f.from, f.to, f, ids) }, { $unwind: '$payments' },
    ...(f.paymentMethod ? [{ $match: { 'payments.method': f.paymentMethod } }] : []),
    { $group: { _id: '$payments.method', amount: { $sum: '$payments.amount' }, count: { $sum: 1 } } }, { $sort: { amount: -1 } },
  ]);
  return rows.map((r) => ({ name: (r._id || 'other').replace('_', ' '), amount: round2(r.amount), count: r.count }));
}

// ---------------------------------------------------------------- record lists

const namesOf = async (Model, ids, field = 'name') => {
  const docs = await Model.find({ _id: { $in: [...new Set(ids.filter(Boolean).map(String))] } }).select(field).lean();
  return new Map(docs.map((d) => [String(d._id), d[field]]));
};

export async function salesInvoiceRows(f, ids) {
  const docs = await Sale.find(saleMatch(f.from, f.to, f, ids))
    .select('invoiceNumber createdAt store customer items.quantity subtotal discount taxableAmount cgst sgst igst taxAmount grandTotal payments.method status')
    .sort({ createdAt: -1 }).lean();
  const [stores, customers] = await Promise.all([namesOf(Store, docs.map((d) => d.store)), namesOf(Customer, docs.map((d) => d.customer))]);
  return docs.map((d) => ({
    invoice: d.invoiceNumber, date: d.createdAt, store: stores.get(String(d.store)) || '', customer: customers.get(String(d.customer)) || 'Walk-in',
    payment: [...new Set((d.payments || []).map((p) => p.method))].join(', ').replace(/_/g, ' '),
    units: (d.items || []).reduce((t, i) => t + i.quantity, 0), subtotal: d.subtotal, discount: d.discount, taxable: d.taxableAmount,
    gst: d.taxAmount, total: d.grandTotal, status: d.status.replace('_', ' '),
  }));
}

export async function expenseRows(f) {
  const docs = await Expense.find({ expenseDate: { $gte: f.from, $lte: f.to }, ...(f.expenseCategory ? { category: f.expenseCategory } : {}) }).sort({ expenseDate: -1 }).lean();
  const stores = await namesOf(Store, docs.map((d) => d.store));
  return docs.map((d) => ({
    date: d.expenseDate, category: d.category.replace('_', ' '), description: d.description, store: stores.get(String(d.store)) || '',
    method: (d.paymentMethod || '').replace('_', ' '), amount: d.amount,
  }));
}

export async function purchaseRows(f, ids) {
  const docs = await Purchase.find({
    createdAt: { $gte: f.from, $lte: f.to }, status: { $ne: 'draft' },
    ...(f.vendor ? { vendor: oid(f.vendor) } : {}), ...(ids ? { 'items.product': { $in: ids } } : {}),
  }).select('poNumber invoiceNumber createdAt vendor store distributionCenter items.quantity subtotal taxAmount grandTotal amountPaid status').sort({ createdAt: -1 }).lean();
  const [vendors, stores] = await Promise.all([namesOf(Vendor, docs.map((d) => d.vendor)), namesOf(Store, docs.map((d) => d.store))]);
  return docs.map((d) => ({
    po: d.poNumber, vendorInvoice: d.invoiceNumber || '', date: d.createdAt, vendor: vendors.get(String(d.vendor)) || '', location: stores.get(String(d.store)) || 'Distribution centre',
    units: (d.items || []).reduce((t, i) => t + i.quantity, 0), taxable: d.subtotal, gst: d.taxAmount, total: d.grandTotal, paid: d.amountPaid || 0,
    balance: round2((d.grandTotal || 0) - (d.amountPaid || 0)), status: d.status.replace('_', ' '),
  }));
}

export async function customerRows(f) {
  const [customers, spend] = await Promise.all([
    Customer.find().select('customerId name phone customerType loyaltyTier creditLimit outstanding').lean(),
    Sale.aggregate([
      { $match: { createdAt: { $gte: f.from, $lte: f.to }, status: { $in: SALE_STATUSES }, customer: { $ne: null } } },
      { $group: { _id: '$customer', orders: { $sum: 1 }, spend: { $sum: '$grandTotal' }, last: { $max: '$createdAt' } } },
    ]),
  ]);
  const sm = new Map(spend.map((s) => [String(s._id), s]));
  return customers.map((c) => {
    const s = sm.get(String(c._id));
    return {
      code: c.customerId, name: c.name, phone: c.phone, type: c.customerType, tier: c.loyaltyTier, orders: s?.orders || 0, spend: round2(s?.spend || 0),
      averageBill: s?.orders ? round2(s.spend / s.orders) : 0, lastPurchase: s?.last || null, creditLimit: c.creditLimit || 0, outstanding: round2(c.outstanding || 0),
    };
  }).sort((a, b) => b.spend - a.spend);
}

export async function vendorRows(f) {
  const [vendors, buys, returns, balances] = await Promise.all([
    Vendor.find().select('name gstin phone paymentTerms').lean(),
    Purchase.aggregate([{ $match: { createdAt: { $gte: f.from, $lte: f.to }, status: { $ne: 'draft' } } }, { $group: { _id: '$vendor', orders: { $sum: 1 }, total: { $sum: '$grandTotal' }, paid: { $sum: '$amountPaid' } } }]),
    PurchaseReturn.aggregate([{ $match: { createdAt: { $gte: f.from, $lte: f.to } } }, { $group: { _id: '$vendor', amount: { $sum: '$totalAmount' } } }]),
    Purchase.aggregate([{ $match: { status: { $in: ['received', 'invoiced'] } } }, { $group: { _id: '$vendor', due: { $sum: { $subtract: ['$grandTotal', '$amountPaid'] } } } }]),
  ]);
  const by = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  const b = by(buys); const r = by(returns); const d = by(balances);
  return vendors.filter((v) => !f.vendor || String(v._id) === f.vendor).map((v) => ({
    name: v.name, gstin: v.gstin || '', phone: v.phone || '', terms: v.paymentTerms || '',
    orders: b.get(String(v._id))?.orders || 0, purchases: round2(b.get(String(v._id))?.total || 0), paid: round2(b.get(String(v._id))?.paid || 0),
    returns: round2(r.get(String(v._id))?.amount || 0), outstanding: round2(Math.max(0, d.get(String(v._id))?.due || 0)),
  })).sort((a, b2) => b2.purchases - a.purchases);
}

export async function transactionRows(f, ids) {
  const want = (t) => !f.transactionType || f.transactionType === t;
  const range = { $gte: f.from, $lte: f.to };
  const [sales, sReturns, purchases, pReturns, expenses, payments] = await Promise.all([
    want('sale') ? salesInvoiceRows(f, ids) : [],
    want('sales_return') ? SalesReturn.find({ createdAt: range }).populate('sale', 'invoiceNumber').populate('customer', 'name').lean() : [],
    want('purchase') ? purchaseRows(f, ids) : [],
    want('purchase_return') ? PurchaseReturn.find({ createdAt: range, ...(f.vendor ? { vendor: oid(f.vendor) } : {}) }).populate('purchase', 'poNumber').populate('vendor', 'name').lean() : [],
    want('expense') ? expenseRows(f) : [],
    want('payment') ? Payment.find({ paymentDate: range }).populate('party', 'name').lean() : [],
  ]);
  const rows = [
    ...sales.map((s) => ({ date: s.date, type: 'Sale', reference: s.invoice, party: s.customer, method: s.payment, inflow: s.total, outflow: 0 })),
    ...sReturns.map((r) => ({ date: r.createdAt, type: 'Sales return', reference: `${r.returnNumber} (${r.sale?.invoiceNumber || ''})`, party: r.customer?.name || 'Walk-in', method: (r.refundMethod || '').replace('_', ' '), inflow: 0, outflow: r.totalRefund })),
    ...purchases.map((p) => ({ date: p.date, type: 'Purchase bill', reference: p.po, party: p.vendor, method: p.status, inflow: 0, outflow: p.total })),
    ...pReturns.map((r) => ({ date: r.createdAt, type: 'Purchase return', reference: `${r.returnNumber} (${r.purchase?.poNumber || ''})`, party: r.vendor?.name || '', method: 'credit note', inflow: r.totalAmount, outflow: 0 })),
    ...expenses.map((e) => ({ date: e.date, type: 'Expense', reference: e.description, party: e.category, method: e.method, inflow: 0, outflow: e.amount })),
    ...payments.map((p) => ({
      date: p.paymentDate, type: p.direction === 'incoming' ? 'Receipt' : 'Payment', reference: p.voucherNumber, party: p.party?.name || '', method: (p.method || '').replace('_', ' '),
      inflow: p.direction === 'incoming' ? p.amount : 0, outflow: p.direction === 'outgoing' ? p.amount : 0,
    })),
  ];
  return rows.map((r) => ({ ...r, net: round2(r.inflow - r.outflow) })).sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function gstRows(facts) {
  const rates = [...new Set([...facts.gstOut.keys(), ...facts.gstIn.keys()])].sort((a, b) => a - b);
  return rates.map((rate) => {
    const o = facts.gstOut.get(rate) || {}; const i = facts.gstIn.get(rate) || {};
    const outputTax = round2(o.tax || 0); const inputTax = round2(i.tax || 0);
    return {
      rate: `GST ${rate}%`, salesTaxable: round2(o.taxable || 0), cgst: round2(o.cgst || 0), sgst: round2(o.sgst || 0), igst: round2(o.igst || 0),
      outputTax, purchaseTaxable: round2(i.taxable || 0), inputTax, net: round2(outputTax - inputTax),
    };
  });
}

export function pnlRows(s) {
  const lines = [
    { line: 'Gross sales (before discount, ex-GST)', amount: s.grossSales },
    { line: 'Less: discounts', amount: -s.discounts },
    { line: 'Less: sales returns', amount: -s.returns },
    { line: 'Net sales', amount: s.netSales, emphasis: true },
    { line: 'Less: cost of goods sold', amount: -s.cogs },
    { line: 'Gross profit', amount: s.grossProfit, emphasis: true },
    ...Object.entries(s.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ line: `Less: ${k.replace('_', ' ')} expense`, amount: -v })),
    { line: 'Total expenses', amount: -s.expenses, emphasis: true },
  ];
  if (s.netProfit !== null) {
    lines.push({ line: 'Net profit', amount: s.netProfit, emphasis: true });
    lines.push({ line: 'Add back: interest, tax, depreciation & amortization', amount: round2(s.ebitda - s.netProfit) });
    lines.push({ line: 'EBITDA', amount: s.ebitda, emphasis: true });
  }
  return lines.map((l) => ({ ...l, ofSales: pct(l.amount, s.netSales) }));
}

export function summaryRows(cur, prev, { financial }) {
  const M = [
    ['Revenue (incl. GST)', 'revenue', 'currency'], ['Invoices', 'invoices', 'int'], ['Average bill value', 'averageBill', 'currency'], ['Units sold', 'unitsSold', 'int'],
    ['Net sales (ex-GST, after returns)', 'netSales', 'currency'], ['Discounts given', 'discounts', 'currency'], ['Sales returns', 'returns', 'currency'],
    ['Expenses', 'expenses', 'currency'], ['Purchases', 'purchases', 'currency', true],
    ['Cost of goods sold', 'cogs', 'currency', true], ['Gross profit', 'grossProfit', 'currency', true], ['Gross margin', 'grossMargin', 'percent', true],
    ['Net profit', 'netProfit', 'currency', true], ['Net profit margin', 'netMargin', 'percent', true], ['EBITDA', 'ebitda', 'currency', true],
    ['GST collected (output)', 'gstOutput', 'currency', true], ['GST paid on purchases (input)', 'gstInput', 'currency', true],
  ];
  return M.filter((m) => financial || !m[3]).map(([metric, key, type]) => ({
    metric, type, current: cur[key], previous: prev ? prev[key] : null,
    change: prev && cur[key] !== null && prev[key] !== null ? (type === 'percent' ? round2(cur[key] - prev[key]) : pctChange(cur[key], prev[key])) : null,
    changeType: type === 'percent' ? 'points' : 'percent',
  }));
}

export async function dataStatus() {
  const [products, sales, purchases, expenses] = await Promise.all([
    Product.estimatedDocumentCount(), Sale.estimatedDocumentCount(), Purchase.estimatedDocumentCount(), Expense.estimatedDocumentCount(),
  ]);
  return { products, sales, purchases, expenses, empty: !products && !sales && !purchases && !expenses };
}

export function invalidateProductCache() { productCache = { at: 0, map: null }; }
