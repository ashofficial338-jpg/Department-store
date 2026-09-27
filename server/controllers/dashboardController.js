import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import Customer from '../models/Customer.js';
import catchAsync from '../utils/catchAsync.js';
import { parseDateRange } from '../utils/dateRanges.js';

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

async function salesTotalInRange(from, to) {
  const rows = await Sale.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] } } },
    { $group: { _id: null, total: { $sum: '$grandTotal' } } },
  ]);
  return rows[0]?.total || 0;
}
async function purchasesTotalInRange(from, to) {
  const rows = await Purchase.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' } } },
    { $group: { _id: null, total: { $sum: '$grandTotal' } } },
  ]);
  return rows[0]?.total || 0;
}
async function profitInRange(from, to) {
  const rows = await Sale.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] } } },
    { $unwind: '$items' },
    { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
    { $unwind: '$p' },
    { $project: { revenue: '$items.taxableAmount', cost: { $multiply: ['$items.quantity', '$p.purchasePrice'] } } },
    { $group: { _id: null, revenue: { $sum: '$revenue' }, cost: { $sum: '$cost' } } },
  ]);
  const revenue = rows[0]?.revenue || 0;
  const cost = rows[0]?.cost || 0;
  return { profit: revenue - cost, revenue, cost };
}
function pctChange(curr, prev) {
  if (!prev) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export const kpis = catchAsync(async (req, res) => {
  const today = { from: startOfDay(new Date()), to: endOfDay(new Date()) };
  const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = { from: startOfDay(yesterdayDate), to: endOfDay(yesterdayDate) };

  const [todaySales, ySales, todayPurchases, yPurchases, todayProfitData, yProfitData, lowStockCount, stockValueAgg, receivables, payables] = await Promise.all([
    salesTotalInRange(today.from, today.to),
    salesTotalInRange(yesterday.from, yesterday.to),
    purchasesTotalInRange(today.from, today.to),
    purchasesTotalInRange(yesterday.from, yesterday.to),
    profitInRange(today.from, today.to),
    profitInRange(yesterday.from, yesterday.to),
    Inventory.aggregate([
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $match: { $expr: { $lte: ['$currentStock', '$product.reorderLevel'] } } },
      { $count: 'count' },
    ]),
    Inventory.aggregate([
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $group: { _id: null, value: { $sum: { $multiply: ['$currentStock', '$product.purchasePrice'] } } } },
    ]),
    Customer.aggregate([{ $group: { _id: null, total: { $sum: '$outstanding' } } }]),
    Purchase.aggregate([
      { $match: { status: { $in: ['received', 'invoiced'] } } },
      { $group: { _id: null, total: { $sum: { $subtract: ['$grandTotal', '$amountPaid'] } } } },
    ]),
  ]);

  const grossMargin = todayProfitData.revenue ? Math.round((todayProfitData.profit / todayProfitData.revenue) * 1000) / 10 : 0;

  res.json({
    success: true,
    data: {
      todaySales: { value: todaySales, change: pctChange(todaySales, ySales) },
      todayPurchases: { value: todayPurchases, change: pctChange(todayPurchases, yPurchases) },
      todayProfit: { value: todayProfitData.profit, change: pctChange(todayProfitData.profit, yProfitData.profit) },
      grossMargin: { value: grossMargin },
      stockValue: { value: stockValueAgg[0]?.value || 0 },
      lowStockItems: { value: lowStockCount[0]?.count || 0 },
      outstandingReceivables: { value: receivables[0]?.total || 0 },
      outstandingPayables: { value: payables[0]?.total || 0 },
    },
  });
});

export const topProducts = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const limit = Number(req.query.limit || 5);

  const rows = await Sale.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.product', unitsSold: { $sum: '$items.quantity' }, revenue: { $sum: '$items.totalAmount' } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $project: {
      productName: '$product.name', sku: '$product.sku', image: { $arrayElemAt: ['$product.images.url', 0] },
      unitsSold: 1, revenue: 1, cost: { $multiply: ['$unitsSold', '$product.purchasePrice'] },
    } },
    { $addFields: { profit: { $subtract: ['$revenue', '$cost'] } } },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const withShare = rows.map((r) => ({ ...r, contributionPercent: totalRevenue ? Math.round((r.revenue / totalRevenue) * 1000) / 10 : 0 }));

  res.json({ success: true, data: withShare });
});

export const salesTrend = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const groupBy = req.query.groupBy || 'day'; // day | week | month | year
  const dateFormat = { day: '%Y-%m-%d', week: '%Y-%U', month: '%Y-%m', year: '%Y' }[groupBy] || '%Y-%m-%d';

  const [sales, purchases] = await Promise.all([
    Sale.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] } } },
      { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, sales: { $sum: '$grandTotal' } } },
      { $sort: { _id: 1 } },
    ]),
    Purchase.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' } } },
      { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, purchases: { $sum: '$grandTotal' } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const map = new Map();
  sales.forEach((s) => map.set(s._id, { period: s._id, sales: s.sales, purchases: 0 }));
  purchases.forEach((p) => {
    const existing = map.get(p._id) || { period: p._id, sales: 0, purchases: 0 };
    existing.purchases = p.purchases;
    map.set(p._id, existing);
  });

  res.json({ success: true, data: Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period)) });
});

export const categoryBrandSales = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const [byCategory, byBrand, byPayment] = await Promise.all([
    Sale.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] } } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      { $lookup: { from: 'categories', localField: 'p.category', foreignField: '_id', as: 'c' } },
      { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $ifNull: ['$c.name', 'Uncategorized'] }, value: { $sum: '$items.totalAmount' } } },
      { $sort: { value: -1 } },
    ]),
    Sale.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] } } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      { $lookup: { from: 'brands', localField: 'p.brand', foreignField: '_id', as: 'b' } },
      { $unwind: { path: '$b', preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $ifNull: ['$b.name', 'Unbranded'] }, value: { $sum: '$items.totalAmount' } } },
      { $sort: { value: -1 } },
    ]),
    Sale.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] } } },
      { $unwind: '$payments' },
      { $group: { _id: '$payments.method', value: { $sum: '$payments.amount' } } },
    ]),
  ]);
  res.json({ success: true, data: { byCategory, byBrand, byPayment } });
});

export default { kpis, topProducts, salesTrend, categoryBrandSales };
