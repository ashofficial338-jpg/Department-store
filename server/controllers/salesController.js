import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import SalesReturn from '../models/SalesReturn.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';
import Customer from '../models/Customer.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { calculateLineGst, summarizeInvoice } from '../utils/gstCalculator.js';
import { applyStockDelta, recordInventoryTransaction } from './inventoryController.js';
import { postLedgerPair, methodToAccountKey } from '../utils/ledger.js';

async function pickBatchFEFO(productId, storeId) {
  return Batch.findOne({ product: productId, store: storeId, status: 'active', availableQuantity: { $gt: 0 } }).sort({ expiryDate: 1 });
}

async function buildSaleLines(items, isInterState, req) {
  const lines = [];
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) throw new ApiError(404, `Product not found for one of the cart items.`);
    const gstRate = item.gstRateOverride !== undefined ? item.gstRateOverride : product.gstRate;

    if (item.gstRateOverride !== undefined && Number(item.gstRateOverride) !== product.gstRate) {
      if (!item.overrideReason) {
        throw new ApiError(400, 'A reason is required when overriding a product\'s GST rate.');
      }
      await recordAudit({
        req, action: 'gst.override', entity: 'Product', entityId: product._id,
        oldValue: { gstRate: product.gstRate }, newValue: { gstRate: Number(item.gstRateOverride), reason: item.overrideReason },
      });
    }

    const calc = calculateLineGst({
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? product.sellingPrice,
      discountPercent: item.discountPercent || 0,
      gstRate,
      isInterState,
    });
    lines.push({
      product: product._id,
      batch: item.batch || undefined,
      productName: product.name,
      sku: product.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? product.sellingPrice,
      discountPercent: item.discountPercent || 0,
      gstRate,
      ...calc,
    });
  }
  return lines;
}

export const previewSale = catchAsync(async (req, res) => {
  const { items = [], isInterState = false } = req.body;
  if (!items.length) throw new ApiError(400, 'Cart is empty.');
  const lines = await buildSaleLines(items, isInterState, req);
  const summary = summarizeInvoice(lines);
  res.json({ success: true, data: { lines, summary } });
});

export const createSale = catchAsync(async (req, res) => {
  const { items = [], customer, store, payments = [], isInterState = false, status = 'completed', notes } = req.body;
  if (!items.length) throw new ApiError(400, 'Cart is empty. Add at least one product.');

  const lines = await buildSaleLines(items, isInterState, req);
  const summary = summarizeInvoice(lines);

  if (status === 'held') {
    const sale = await Sale.create({
      invoiceNumber: `HOLD-${Date.now()}`, store, customer, items: lines,
      ...summary, isInterState, status: 'held', cashier: req.user._id, notes,
    });
    return res.status(201).json({ success: true, data: sale });
  }

  const amountPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const hasCredit = payments.some((p) => p.method === 'credit');
  if (amountPaid < summary.grandTotal && !hasCredit) {
    throw new ApiError(400, 'Payment amount is less than the invoice total. Add a credit line or collect the balance.');
  }

  // stock availability check + resolve batches (FEFO if not explicitly chosen)
  for (const line of lines) {
    if (!line.batch && store) {
      const batch = await pickBatchFEFO(line.product, store);
      if (batch) line.batch = batch._id;
    }
    if (line.batch) {
      const batch = await Batch.findById(line.batch);
      if (!batch || batch.availableQuantity < line.quantity) {
        throw new ApiError(400, 'Insufficient stock for this batch.');
      }
    }
  }

  const invoiceNumber = await generateDocNumber('sale');
  const sale = await Sale.create({
    invoiceNumber, store, customer, items: lines, ...summary,
    amountPaid, payments, isInterState, status: 'completed', cashier: req.user._id, notes,
  });

  for (const line of lines) {
    await applyStockDelta({ product: line.product, store, delta: -line.quantity });
    if (line.batch) {
      await Batch.findByIdAndUpdate(line.batch, { $inc: { availableQuantity: -line.quantity } });
    }
    await recordInventoryTransaction({
      product: line.product, batch: line.batch, quantity: -line.quantity, type: 'sale',
      source: store, sourceModel: 'Store',
      referenceType: 'Sale', referenceId: sale._id, referenceNumber: invoiceNumber, user: req.user._id,
    });
  }

  for (const p of payments) {
    if (p.method === 'credit') continue;
    await postLedgerPair({
      debitKey: methodToAccountKey(p.method), creditKey: 'sales', amount: p.amount,
      narration: `Sale ${invoiceNumber}`, referenceType: 'Sale', referenceId: sale._id, userId: req.user._id,
    });
  }
  if (summary.taxAmount > 0) {
    await postLedgerPair({
      debitKey: 'sales', creditKey: 'gstOutput', amount: summary.taxAmount,
      narration: `GST on ${invoiceNumber}`, referenceType: 'Sale', referenceId: sale._id, userId: req.user._id,
    });
  }

  if (customer) {
    const creditAmount = payments.filter((p) => p.method === 'credit').reduce((s, p) => s + Number(p.amount || 0), 0);
    const loyaltyEarned = Math.floor(summary.grandTotal / 100);
    await Customer.findByIdAndUpdate(customer, { $inc: { outstanding: creditAmount, loyaltyPoints: loyaltyEarned } });
  }

  await recordAudit({ req, action: 'sale.create', entity: 'Sale', entityId: sale._id, newValue: { invoiceNumber, grandTotal: summary.grandTotal } });

  res.status(201).json({ success: true, data: sale });
});

export const resumeSale = catchAsync(async (req, res) => {
  const held = await Sale.findById(req.params.id);
  if (!held) throw new ApiError(404, 'Held bill not found.');
  if (held.status !== 'held') throw new ApiError(400, 'This bill is not on hold.');

  req.body = { ...req.body, items: held.items.map((i) => ({ product: i.product, batch: i.batch, quantity: i.quantity, unitPrice: i.unitPrice, discountPercent: i.discountPercent, gstRateOverride: i.gstRate })), customer: held.customer, store: held.store, isInterState: held.isInterState, status: 'completed' };
  await held.deleteOne();
  return createSale(req, res);
});

export const listSales = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.search) filter.invoiceNumber = new RegExp(req.query.search, 'i');
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  const [docs, total] = await Promise.all([
    Sale.find(filter).populate('customer', 'name phone').populate('cashier', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Sale.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getSale = catchAsync(async (req, res) => {
  const sale = await Sale.findById(req.params.id).populate('customer store cashier items.product');
  if (!sale) throw new ApiError(404, 'Invoice not found.');
  res.json({ success: true, data: sale });
});

export const heldSales = catchAsync(async (req, res) => {
  const docs = await Sale.find({ status: 'held' }).sort({ createdAt: -1 });
  res.json({ success: true, data: docs });
});

export const cancelSale = catchAsync(async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) throw new ApiError(404, 'Invoice not found.');
  if (sale.status === 'cancelled') throw new ApiError(400, 'This invoice is already cancelled.');

  if (sale.status === 'completed') {
    for (const line of sale.items) {
      await applyStockDelta({ product: line.product, store: sale.store, delta: line.quantity });
      if (line.batch) await Batch.findByIdAndUpdate(line.batch, { $inc: { availableQuantity: line.quantity } });
      await recordInventoryTransaction({
        product: line.product, batch: line.batch, quantity: line.quantity, type: 'sale_return',
        destination: sale.store, destinationModel: 'Store',
        referenceType: 'Sale', referenceId: sale._id, referenceNumber: sale.invoiceNumber,
        notes: 'Invoice cancelled', user: req.user._id,
      });
    }
  }
  sale.status = 'cancelled';
  await sale.save();
  await recordAudit({ req, action: 'sale.cancel', entity: 'Sale', entityId: sale._id });
  res.json({ success: true, data: sale });
});

// ---------- Sales Returns ----------

export const createSalesReturn = catchAsync(async (req, res) => {
  const { saleId, items, refundMethod = 'cash' } = req.body;
  const sale = await Sale.findById(saleId);
  if (!sale) throw new ApiError(404, 'Original invoice not found.');
  if (!items?.length) throw new ApiError(400, 'Select at least one item to return.');

  let totalRefund = 0;
  const returnItems = [];

  for (const ret of items) {
    const line = sale.items.find((l) => String(l.product) === String(ret.product));
    if (!line) throw new ApiError(400, 'Returned item was not part of the original invoice.');
    if (ret.quantity > line.quantity) throw new ApiError(400, 'Return quantity exceeds the quantity originally sold.');

    const unitRefund = line.totalAmount / line.quantity;
    const refundAmount = Math.round(unitRefund * ret.quantity * 100) / 100;
    totalRefund += refundAmount;

    returnItems.push({
      product: line.product, batch: line.batch, quantity: ret.quantity,
      unitPrice: line.unitPrice, refundAmount, reason: ret.reason, restockStatus: ret.restockStatus || 'restocked',
    });

    if ((ret.restockStatus || 'restocked') === 'restocked') {
      await applyStockDelta({ product: line.product, store: sale.store, delta: ret.quantity });
      if (line.batch) await Batch.findByIdAndUpdate(line.batch, { $inc: { availableQuantity: ret.quantity } });
    }
    await recordInventoryTransaction({
      product: line.product, batch: line.batch, quantity: ret.quantity, type: 'sale_return',
      destination: sale.store, destinationModel: 'Store',
      referenceType: 'SalesReturn', referenceNumber: sale.invoiceNumber, notes: ret.reason, user: req.user._id,
    });
  }

  const returnNumber = await generateDocNumber('saleReturn');
  const salesReturn = await SalesReturn.create({
    returnNumber, sale: sale._id, customer: sale.customer, items: returnItems,
    refundMethod, totalRefund, processedBy: req.user._id,
  });

  const remainingQty = sale.items.reduce((s, l) => s + l.quantity, 0) - returnItems.reduce((s, l) => s + l.quantity, 0);
  sale.status = remainingQty <= 0 ? 'returned' : 'partially_returned';
  await sale.save();

  if (sale.customer) {
    if (refundMethod === 'store_credit') {
      await Customer.findByIdAndUpdate(sale.customer, { $inc: { outstanding: -totalRefund } });
    }
  }

  await postLedgerPair({
    debitKey: 'sales', creditKey: methodToAccountKey(refundMethod === 'store_credit' ? 'credit' : refundMethod),
    amount: totalRefund, narration: `Return against ${sale.invoiceNumber}`,
    referenceType: 'SalesReturn', referenceId: salesReturn._id, userId: req.user._id,
  });

  await recordAudit({ req, action: 'sale.return', entity: 'SalesReturn', entityId: salesReturn._id, newValue: { returnNumber, totalRefund } });

  res.status(201).json({ success: true, data: salesReturn });
});

export const listSalesReturns = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [docs, total] = await Promise.all([
    SalesReturn.find().populate('sale', 'invoiceNumber').populate('customer', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    SalesReturn.countDocuments(),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export default {
  previewSale, createSale, resumeSale, listSales, getSale, heldSales, cancelSale,
  createSalesReturn, listSalesReturns,
};
