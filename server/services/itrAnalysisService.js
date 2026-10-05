import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import InventoryTransaction from '../models/InventoryTransaction.js';
import Sale from '../models/Sale.js';
import { SALE_STATUSES } from './analyticsService.js';
import { round2 } from '../utils/gstCalculator.js';

// Product-wise Inventory Turnover Ratio over rolling 3, 6 and 12-month windows ending now.
//
//   ITR(N months)        = COGS over the window ÷ Average Inventory
//   Average Inventory    = (Inventory at window start + Inventory now) ÷ 2, valued at purchase price
//   Annualised ITR       = ITR(N) × 12 ÷ N   (puts windows of different length on one scale)
//   Days of inventory    = days in window ÷ ITR(N)
//
// Same method as the dashboard ITR card (services/analyticsService.js): inventory at a past instant is the
// current stock minus every InventoryTransaction recorded after that instant, so figures stay consistent.

export const WINDOWS = [3, 6, 12];
const MONTHS = 12;
const DAY_MS = 86400000;

// Movement classes on the annualised ITR of the selected window.
export const CLASSES = [
  { key: 'fast', label: 'Fast moving', min: 12 },
  { key: 'healthy', label: 'Healthy', min: 6 },
  { key: 'slow', label: 'Slow moving', min: 2 },
  { key: 'very_slow', label: 'Very slow', min: 0 },
];

function classify(annualised, unitsSold, currentQty) {
  if (!unitsSold) return currentQty > 0 ? 'non_moving' : 'no_stock';
  return CLASSES.find((c) => (annualised ?? 0) >= c.min).key;
}

const ratio = (a, b, digits = 2) => (b > 0 ? Math.round((a / b) * 10 ** digits) / 10 ** digits : null);

// Rolling month boundaries: b[0] = now, b[k] = now minus k months.
function boundaries(now) {
  return Array.from({ length: MONTHS + 1 }, (_, k) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - k);
    return d;
  });
}

// $switch expression mapping a date to its rolling-month bucket (0 = most recent month, 11 = a year ago).
function bucketExpr(b, field) {
  return {
    $switch: {
      branches: Array.from({ length: MONTHS }, (_, k) => ({
        case: { $and: [{ $gt: [field, b[k + 1]] }, { $lte: [field, b[k]] }] },
        then: k,
      })),
      default: -1, // after "now" (clock skew) - treated as part of the latest month
    },
  };
}

export async function itrAnalysis({ product, category, brand, period = 12 } = {}) {
  const now = new Date();
  const b = boundaries(now);
  const match = {};
  if (product) match._id = new mongoose.Types.ObjectId(product);
  if (category) match.$or = [{ category: new mongoose.Types.ObjectId(category) }, { subcategory: new mongoose.Types.ObjectId(category) }];
  if (brand) match.brand = new mongoose.Types.ObjectId(brand);

  const products = await Product.find(match)
    .select('name sku category subcategory brand purchasePrice reorderLevel images unit')
    .populate('category', 'name').populate('subcategory', 'name').populate('brand', 'name')
    .lean();
  const ids = products.map((p) => p._id);
  const idFilter = { $in: ids };

  const [stockRows, moveRows, saleRows] = await Promise.all([
    Inventory.aggregate([{ $match: { product: idFilter } }, { $group: { _id: '$product', qty: { $sum: '$currentStock' } } }]),
    InventoryTransaction.aggregate([
      { $match: { product: idFilter, createdAt: { $gt: b[MONTHS] } } },
      { $group: { _id: { p: '$product', k: bucketExpr(b, '$createdAt') }, qty: { $sum: '$quantity' } } },
    ]),
    Sale.aggregate([
      { $match: { createdAt: { $gt: b[MONTHS] }, status: { $in: SALE_STATUSES } } },
      { $unwind: '$items' },
      { $match: { 'items.product': idFilter } },
      { $group: { _id: { p: '$items.product', k: bucketExpr(b, '$createdAt') }, units: { $sum: '$items.quantity' }, revenue: { $sum: '$items.taxableAmount' } } },
    ]),
  ]);

  const current = new Map(stockRows.map((r) => [String(r._id), r.qty]));
  const moves = new Map();
  moveRows.forEach((r) => {
    const key = String(r._id.p);
    if (!moves.has(key)) moves.set(key, new Array(MONTHS).fill(0));
    moves.get(key)[Math.max(0, r._id.k)] += r.qty;
  });
  const sales = new Map();
  saleRows.forEach((r) => {
    const key = String(r._id.p);
    if (!sales.has(key)) sales.set(key, { units: new Array(MONTHS).fill(0), revenue: new Array(MONTHS).fill(0) });
    const s = sales.get(key);
    s.units[Math.max(0, r._id.k)] += r.units;
    s.revenue[Math.max(0, r._id.k)] += r.revenue;
  });

  const sel = WINDOWS.includes(Number(period)) ? Number(period) : 12;
  const monthCogs = new Array(MONTHS).fill(0);
  const monthStockValue = new Array(MONTHS + 1).fill(0); // inventory value at each boundary
  const rows = products.map((p) => {
    const id = String(p._id);
    const price = p.purchasePrice || 0;
    const mv = moves.get(id) || new Array(MONTHS).fill(0);
    const sl = sales.get(id) || { units: new Array(MONTHS).fill(0), revenue: new Array(MONTHS).fill(0) };
    const currentQty = current.get(id) || 0;

    // Stock at boundary k = current stock minus all movements in the k most recent months.
    const qtyAt = [currentQty];
    for (let k = 1; k <= MONTHS; k++) qtyAt[k] = qtyAt[k - 1] - mv[k - 1];
    const valueAt = qtyAt.map((q) => Math.max(0, q) * price);
    valueAt.forEach((v, k) => { monthStockValue[k] += v; });
    sl.units.forEach((u, k) => { monthCogs[k] += u * price; });

    const windows = {};
    for (const n of WINDOWS) {
      const units = sl.units.slice(0, n).reduce((a, x) => a + x, 0);
      const cogs = round2(units * price);
      const avgInventory = round2((valueAt[n] + valueAt[0]) / 2);
      const itr = ratio(cogs, avgInventory, 2);
      const annualised = itr == null ? null : Math.round(itr * (12 / n) * 100) / 100;
      const days = Math.round((b[0] - b[n]) / DAY_MS);
      windows[n] = {
        itr, annualised, cogs, units, avgInventory,
        revenue: round2(sl.revenue.slice(0, n).reduce((a, x) => a + x, 0)),
        daysOfInventory: itr ? Math.round(days / itr) : null,
      };
    }
    const monthly = Array.from({ length: MONTHS }, (_, k) => ratio(sl.units[k] * price, (valueAt[k] + valueAt[k + 1]) / 2, 2)).reverse();
    const a3 = windows[3].annualised;
    const a12 = windows[12].annualised;
    const trendPct = a3 != null && a12 ? Math.round(((a3 - a12) / a12) * 1000) / 10 : null;
    return {
      productId: p._id, name: p.name, sku: p.sku, image: p.images?.find((i) => i.isPrimary)?.url || p.images?.[0]?.url || null,
      category: p.category?.name || 'Uncategorized', subcategory: p.subcategory?.name || null, brand: p.brand?.name || '-',
      purchasePrice: price, currentQty, stockValue: round2(valueAt[0]), reorderLevel: p.reorderLevel,
      itr3: windows[3].itr, itr6: windows[6].itr, itr12: windows[12].itr,
      windows, monthly, trendPct,
      trend: trendPct == null ? 'flat' : trendPct > 10 ? 'rising' : trendPct < -10 ? 'falling' : 'flat',
      class: classify(windows[sel].annualised, windows[sel].units, currentQty),
    };
  });

  // Portfolio totals per window (Σ COGS ÷ Σ average inventory, not an average of ratios).
  const summary = {};
  for (const n of WINDOWS) {
    const cogs = round2(rows.reduce((a, r) => a + r.windows[n].cogs, 0));
    const avgInventory = round2(rows.reduce((a, r) => a + r.windows[n].avgInventory, 0));
    const itr = ratio(cogs, avgInventory, 2);
    const days = Math.round((b[0] - b[n]) / DAY_MS);
    summary[n] = {
      itr, annualised: itr == null ? null : Math.round(itr * (12 / n) * 100) / 100, cogs, avgInventory,
      daysOfInventory: itr ? Math.round(days / itr) : null, from: b[n], to: b[0],
    };
  }

  // Month-by-month portfolio ITR for the last 12 rolling months, oldest first.
  const trend = Array.from({ length: MONTHS }, (_, k) => {
    const avg = (monthStockValue[k] + monthStockValue[k + 1]) / 2;
    return {
      month: b[k].toISOString(), from: b[k + 1].toISOString(),
      label: b[k].toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' }),
      itr: ratio(monthCogs[k], avg, 3), cogs: round2(monthCogs[k]), avgInventory: round2(avg),
    };
  }).reverse();

  // Category comparison on the annualised scale for every window.
  const catMap = new Map();
  rows.forEach((r) => {
    const c = catMap.get(r.category) || { category: r.category, products: 0, w: Object.fromEntries(WINDOWS.map((n) => [n, { cogs: 0, avg: 0 }])) };
    c.products += 1;
    WINDOWS.forEach((n) => { c.w[n].cogs += r.windows[n].cogs; c.w[n].avg += r.windows[n].avgInventory; });
    catMap.set(r.category, c);
  });
  const categories = Array.from(catMap.values()).map((c) => ({
    category: c.category, products: c.products,
    ...Object.fromEntries(WINDOWS.map((n) => {
      const itr = ratio(c.w[n].cogs, c.w[n].avg, 3);
      return [`a${n}`, itr == null ? null : Math.round(itr * (12 / n) * 100) / 100];
    })),
  })).sort((x, y) => (y[`a${sel}`] ?? -1) - (x[`a${sel}`] ?? -1));

  const counts = Object.fromEntries([...CLASSES.map((c) => c.key), 'non_moving', 'no_stock'].map((k) => [k, rows.filter((r) => r.class === k).length]));
  return {
    generatedAt: now, period: sel, windows: WINDOWS,
    summary, trend, categories, counts,
    classes: [...CLASSES, { key: 'non_moving', label: 'Non-moving' }, { key: 'no_stock', label: 'No stock / no sales' }],
    rows: rows.sort((x, y) => (y.windows[sel].annualised ?? -1) - (x.windows[sel].annualised ?? -1)),
  };
}

export default itrAnalysis;
