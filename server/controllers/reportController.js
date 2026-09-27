import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Inventory from '../models/Inventory.js';
import Batch from '../models/Batch.js';
import Vendor from '../models/Vendor.js';
import Customer from '../models/Customer.js';
import Expense from '../models/Expense.js';
import InwardDC from '../models/InwardDC.js';
import OutwardDC from '../models/OutwardDC.js';
import Payment from '../models/Payment.js';
import catchAsync from '../utils/catchAsync.js';
import { parseDateRange } from '../utils/dateRanges.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { sendCSV } from '../utils/csv.js';
import { round2 } from '../utils/gstCalculator.js';

export const salesReport = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const filter = { createdAt: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } };
  const docs = await Sale.find(filter).populate('customer', 'name phone').populate('cashier', 'name').sort({ createdAt: -1 });

  if (req.query.format === 'csv') {
    return sendCSV(res, 'sales-report.csv', docs, [
      { label: 'Invoice #', value: 'invoiceNumber' },
      { label: 'Date', value: (r) => r.createdAt.toISOString().slice(0, 10) },
      { label: 'Customer', value: (r) => r.customer?.name || 'Walk-in' },
      { label: 'Subtotal', value: 'subtotal' },
      { label: 'Discount', value: 'discount' },
      { label: 'Tax', value: 'taxAmount' },
      { label: 'Grand Total', value: 'grandTotal' },
      { label: 'Status', value: 'status' },
    ]);
  }
  const totals = docs.reduce((a, d) => ({ subtotal: a.subtotal + d.subtotal, tax: a.tax + d.taxAmount, grandTotal: a.grandTotal + d.grandTotal }), { subtotal: 0, tax: 0, grandTotal: 0 });
  res.json({ success: true, data: docs, totals });
});

export const purchaseReport = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const filter = { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' } };
  const docs = await Purchase.find(filter).populate('vendor', 'name').sort({ createdAt: -1 });

  if (req.query.format === 'csv') {
    return sendCSV(res, 'purchase-report.csv', docs, [
      { label: 'PO #', value: 'poNumber' },
      { label: 'Date', value: (r) => r.createdAt.toISOString().slice(0, 10) },
      { label: 'Vendor', value: (r) => r.vendor?.name || '' },
      { label: 'Subtotal', value: 'subtotal' },
      { label: 'Tax', value: 'taxAmount' },
      { label: 'Grand Total', value: 'grandTotal' },
      { label: 'Status', value: 'status' },
    ]);
  }
  const totals = docs.reduce((a, d) => ({ subtotal: a.subtotal + d.subtotal, tax: a.tax + d.taxAmount, grandTotal: a.grandTotal + d.grandTotal }), { subtotal: 0, tax: 0, grandTotal: 0 });
  res.json({ success: true, data: docs, totals });
});

export const stockReport = catchAsync(async (req, res) => {
  const rows = await Inventory.find().populate('product', 'name sku unit purchasePrice sellingPrice reorderLevel').populate('store', 'name').populate('distributionCenter', 'name');
  if (req.query.format === 'csv') {
    return sendCSV(res, 'stock-report.csv', rows, [
      { label: 'Product', value: (r) => r.product?.name },
      { label: 'SKU', value: (r) => r.product?.sku },
      { label: 'Location', value: (r) => r.store?.name || r.distributionCenter?.name || '' },
      { label: 'Current Stock', value: 'currentStock' },
      { label: 'Stock Value', value: (r) => round2((r.currentStock || 0) * (r.product?.purchasePrice || 0)) },
    ]);
  }
  res.json({ success: true, data: rows });
});

export const batchReport = catchAsync(async (req, res) => {
  const rows = await Batch.find().populate('product', 'name sku').populate('supplier', 'name').populate('store', 'name').sort({ expiryDate: 1 });
  res.json({ success: true, data: rows });
});

export const vendorReport = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const rows = await Purchase.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' } } },
    { $group: { _id: '$vendor', totalPurchases: { $sum: '$grandTotal' }, paid: { $sum: '$amountPaid' }, orders: { $sum: 1 } } },
    { $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'vendor' } },
    { $unwind: '$vendor' },
    { $project: { name: '$vendor.name', totalPurchases: 1, paid: 1, outstanding: { $subtract: ['$totalPurchases', '$paid'] }, orders: 1 } },
    { $sort: { totalPurchases: -1 } },
  ]);
  res.json({ success: true, data: rows });
});

export const customerReport = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const rows = await Sale.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] }, customer: { $ne: null } } },
    { $group: { _id: '$customer', totalSpend: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
    { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
    { $unwind: '$customer' },
    { $project: { name: '$customer.name', phone: '$customer.phone', totalSpend: 1, orders: 1, outstanding: '$customer.outstanding' } },
    { $sort: { totalSpend: -1 } },
  ]);
  res.json({ success: true, data: rows });
});

export const productReport = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const rows = await Sale.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.product', unitsSold: { $sum: '$items.quantity' }, revenue: { $sum: '$items.totalAmount' } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $project: { name: '$product.name', sku: '$product.sku', unitsSold: 1, revenue: 1 } },
    { $sort: { revenue: -1 } },
  ]);
  res.json({ success: true, data: rows });
});

export const dcReport = catchAsync(async (req, res) => {
  const [inward, outward] = await Promise.all([
    InwardDC.countDocuments({ status: { $in: ['pending', 'partially_received'] } }),
    OutwardDC.countDocuments({ status: { $nin: ['received', 'cancelled'] } }),
  ]);
  const stock = await Inventory.aggregate([
    { $match: { distributionCenter: { $ne: null } } },
    { $group: { _id: '$distributionCenter', totalStock: { $sum: '$currentStock' } } },
    { $lookup: { from: 'distributioncenters', localField: '_id', foreignField: '_id', as: 'dc' } },
    { $unwind: '$dc' },
    { $project: { name: '$dc.name', code: '$dc.code', totalStock: 1 } },
  ]);
  res.json({ success: true, data: { pendingInward: inward, pendingOutward: outward, stockByDC: stock } });
});

export const expenseReport = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const rows = await Expense.aggregate([
    { $match: { expenseDate: { $gte: from, $lte: to } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } },
  ]);
  res.json({ success: true, data: rows });
});

export const paymentReport = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { from, to } = parseDateRange(req.query);
  const filter = { paymentDate: { $gte: from, $lte: to } };
  const [docs, total] = await Promise.all([
    Payment.find(filter).populate('party').sort({ paymentDate: -1 }).skip(skip).limit(limit),
    Payment.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const outstandingReport = catchAsync(async (req, res) => {
  const [receivables, payables] = await Promise.all([
    Customer.find({ outstanding: { $gt: 0 } }).select('name phone outstanding').sort({ outstanding: -1 }),
    Purchase.aggregate([
      { $match: { status: { $in: ['received', 'invoiced'] } } },
      { $project: { vendor: 1, poNumber: 1, balance: { $subtract: ['$grandTotal', '$amountPaid'] } } },
      { $match: { balance: { $gt: 0 } } },
      { $lookup: { from: 'vendors', localField: 'vendor', foreignField: '_id', as: 'vendor' } },
      { $unwind: '$vendor' },
    ]),
  ]);
  res.json({ success: true, data: { receivables, payables } });
});

export const cashBankReport = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const rows = await Payment.aggregate([
    { $match: { paymentDate: { $gte: from, $lte: to } } },
    { $group: { _id: { method: '$method', direction: '$direction' }, total: { $sum: '$amount' } } },
  ]);
  res.json({ success: true, data: rows });
});

// ---------- Profit & Loss (section 8) ----------
export const profitAndLoss = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);

  const [salesAgg, returnsAgg, cogsAgg, purchaseAgg, expenseAgg] = await Promise.all([
    Sale.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] } } },
      { $group: { _id: null, grossSales: { $sum: '$subtotal' }, discounts: { $sum: '$discount' } } },
    ]),
    Sale.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['returned', 'partially_returned'] } } },
      { $lookup: { from: 'salesreturns', localField: '_id', foreignField: 'sale', as: 'ret' } },
      { $unwind: '$ret' },
      { $group: { _id: null, returns: { $sum: '$ret.totalRefund' } } },
    ]),
    Sale.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['completed', 'partially_returned'] } } },
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
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const grossSales = salesAgg[0]?.grossSales || 0;
  const discounts = salesAgg[0]?.discounts || 0;
  const returns = returnsAgg[0]?.returns || 0;
  const netSales = round2(grossSales - discounts - returns);
  const cogs = cogsAgg[0]?.cogs || 0;
  const purchaseCost = purchaseAgg[0]?.total || 0;
  const operatingExpenses = expenseAgg[0]?.total || 0;
  const grossProfit = round2(netSales - cogs);
  const netProfit = round2(grossProfit - operatingExpenses);

  res.json({
    success: true,
    data: {
      revenue: { grossSales, discounts, returns, netSales },
      cost: { costOfGoodsSold: cogs, purchaseCost, otherCosts: operatingExpenses },
      profit: { grossProfit, operatingExpenses, netProfit },
    },
  });
});

export default {
  salesReport, purchaseReport, stockReport, batchReport, vendorReport, customerReport,
  productReport, dcReport, expenseReport, paymentReport, outstandingReport, cashBankReport, profitAndLoss,
};
