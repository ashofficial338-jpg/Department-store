import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import SalesReturn from '../models/SalesReturn.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';
import Customer from '../models/Customer.js';
import Store from '../models/Store.js';
import TaxRate from '../models/TaxRate.js';
import Inventory from '../models/Inventory.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Account from '../models/Account.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { calculateLineGst, summarizeInvoice, round2 } from '../utils/gstCalculator.js';
import { recordInventoryTransaction } from './inventoryController.js';
import { postLedgerPair, methodToAccountKey } from '../utils/ledger.js';
import { searchRegex, requireId, number, positive, oneOf } from '../utils/validate.js';

// POS billing. Everything that affects money or stock is decided here, never by the browser:
// prices come from the product master, quantities/discounts/payments are validated, stock is
// reserved atomically, and a repeated submission with the same clientRequestId returns the first bill.

const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'credit'];
const REFUND_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'store_credit'];
const LOOSE_UNITS = ['KG', 'G', 'GM', 'L', 'LTR', 'ML', 'MTR', 'M']; // sold by weight/length - fractions allowed
const MAX_LINES = 200;
const MAX_QTY = 10000;

async function buildSaleLines(items, isInterState, req) {
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Cart is empty. Add at least one product.');
  if (items.length > MAX_LINES) throw new ApiError(400, `A bill can have at most ${MAX_LINES} lines.`);
  const slabs = (await TaxRate.find({ status: { $ne: 'inactive' } }).select('ratePercent').lean()).map((t) => t.ratePercent);

  const lines = [];
  for (const item of items) {
    requireId(item?.product, 'Product');
    const product = await Product.findById(item.product);
    if (!product) throw new ApiError(404, 'Product not found for one of the cart items.');
    if (product.status !== 'active') throw new ApiError(400, `${product.name} is ${product.status} and cannot be sold.`);
    const quantity = positive(item.quantity, `Quantity for ${product.name}`, { max: MAX_QTY, integer: !LOOSE_UNITS.includes(String(product.unit).toUpperCase()) });
    const discountPercent = item.discountPercent === undefined || item.discountPercent === '' ? 0 : number(item.discountPercent, `Discount for ${product.name}`, { min: 0, max: 100 });

    let gstRate = product.gstRate;
    if (item.gstRateOverride !== undefined && item.gstRateOverride !== null && Number(item.gstRateOverride) !== product.gstRate) {
      const override = number(item.gstRateOverride, 'GST override', { min: 0, max: 100 });
      if (!slabs.includes(override)) throw new ApiError(400, `GST ${override}% is not a configured GST slab.`);
      if (!item.overrideReason || !String(item.overrideReason).trim()) throw new ApiError(400, 'A reason is required when overriding a product\'s GST rate.');
      gstRate = override;
      await recordAudit({
        req, action: 'gst.override', entity: 'Product', entityId: product._id,
        oldValue: { gstRate: product.gstRate }, newValue: { gstRate: override, reason: String(item.overrideReason).slice(0, 200) },
      });
    }

    // The unit price is always the catalogue price; any unitPrice sent by the client is ignored.
    const unitPrice = product.sellingPrice;
    const calc = calculateLineGst({ quantity, unitPrice, discountPercent, gstRate, isInterState });
    lines.push({
      product: product._id, batch: item.batch || undefined, productName: product.name, sku: product.sku,
      quantity, unitPrice, discountPercent, ...calc, gstRate,
    });
  }
  return lines;
}

export const previewSale = catchAsync(async (req, res) => {
  const { items = [], isInterState = false } = req.body;
  const lines = await buildSaleLines(items, !!isInterState, req);
  res.json({ success: true, data: { lines, summary: summarizeInvoice(lines) } });
});

// Validates the payment split and works out change. Only cash can be overpaid (the excess is change);
// card / UPI / bank / credit lines together may not exceed the bill.
function settlePayments(payments, grandTotal, customer) {
  if (!Array.isArray(payments)) throw new ApiError(400, 'Payments must be a list.');
  const clean = payments.map((p) => {
    const method = oneOf(p?.method, PAYMENT_METHODS, 'Payment method');
    const amount = positive(p.amount, `${method} amount`);
    return { method, amount: round2(amount), referenceId: p.referenceId ? String(p.referenceId).slice(0, 80) : undefined };
  });
  const total = round2(clean.reduce((s, p) => s + p.amount, 0));
  const cash = round2(clean.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0));
  const nonCash = round2(total - cash);
  const credit = round2(clean.filter((p) => p.method === 'credit').reduce((s, p) => s + p.amount, 0));
  if (credit > 0 && !customer) throw new ApiError(400, 'Select a customer to bill on credit.');
  if (total + 0.001 < grandTotal) throw new ApiError(400, `Payment of ₹${total} is less than the bill total of ₹${grandTotal}. Collect the balance or add a credit line.`);
  if (nonCash > grandTotal + 0.001) throw new ApiError(400, 'Card, UPI, bank and credit payments cannot exceed the bill total. Only cash can be overpaid (as change).');

  let change = round2(total - grandTotal);
  // Change comes back out of the cash lines: record what was tendered and what was returned.
  for (const p of clean) {
    if (p.method !== 'cash' || change <= 0) continue;
    const back = Math.min(change, p.amount);
    p.cashReceived = p.amount;
    p.changeReturned = round2(back);
    p.amount = round2(p.amount - back);
    change = round2(change - back);
  }
  return { payments: clean.filter((p) => p.amount > 0 || p.changeReturned), amountPaid: grandTotal, creditAmount: credit };
}

// Reserves stock atomically (a conditional decrement), so two tills cannot sell the same last units.
// Returns an undo function that puts everything back if a later step fails.
async function reserveStock(lines, store) {
  const done = [];
  const undo = async () => {
    for (const d of done.reverse()) {
      if (d.kind === 'inv') await Inventory.updateOne({ _id: d.id }, { $inc: { currentStock: d.qty } });
      else await Batch.updateOne({ _id: d.id }, { $inc: { availableQuantity: d.qty } });
    }
  };
  try {
    const byProduct = new Map();
    lines.forEach((l) => byProduct.set(String(l.product), (byProduct.get(String(l.product)) || 0) + l.quantity));
    for (const [product, qty] of byProduct) {
      const inv = await Inventory.findOneAndUpdate(
        { product, store, currentStock: { $gte: qty } },
        { $inc: { currentStock: -qty } },
        { new: true },
      );
      if (!inv) {
        const have = (await Inventory.findOne({ product, store }).select('currentStock').lean())?.currentStock || 0;
        const name = lines.find((l) => String(l.product) === product).productName;
        throw new ApiError(400, `Only ${have} of ${name} in stock at this store (bill needs ${qty}).`);
      }
      done.push({ kind: 'inv', id: inv._id, qty });
    }
    for (const line of lines) {
      if (line.batch) {
        if (!mongoose.isValidObjectId(line.batch)) throw new ApiError(400, 'Invalid batch selected.');
        const b = await Batch.findOneAndUpdate(
          { _id: line.batch, product: line.product, store, availableQuantity: { $gte: line.quantity } },
          { $inc: { availableQuantity: -line.quantity } },
        );
        if (!b) throw new ApiError(400, `The selected batch of ${line.productName} doesn't belong to this store or has too little stock.`);
        done.push({ kind: 'batch', id: b._id, qty: line.quantity });
      } else {
        // First-expiry-first-out: the earliest-expiring batch that can cover the whole line.
        const b = await Batch.findOneAndUpdate(
          { product: line.product, store, status: 'active', availableQuantity: { $gte: line.quantity } },
          { $inc: { availableQuantity: -line.quantity } },
          { sort: { expiryDate: 1 } },
        );
        if (b) { line.batch = b._id; done.push({ kind: 'batch', id: b._id, qty: line.quantity }); }
      }
    }
  } catch (err) {
    await undo();
    throw err;
  }
  return undo;
}

async function validateParties({ store, customer }) {
  requireId(store, 'Store');
  if (!(await Store.exists({ _id: store }))) throw new ApiError(400, 'Selected store was not found.');
  if (customer) {
    requireId(customer, 'Customer');
    if (!(await Customer.exists({ _id: customer }))) throw new ApiError(400, 'Selected customer was not found.');
  }
}

async function existingFor(clientRequestId) {
  return clientRequestId ? Sale.findOne({ clientRequestId }) : null;
}

// Creates a completed sale from a request body. Shared by "New bill" and "Resume held bill".
async function completeSale(req, body) {
  const { items = [], customer, store, payments = [], isInterState = false, notes } = body;
  const clientRequestId = body.clientRequestId ? String(body.clientRequestId).slice(0, 100) : undefined;
  const prior = await existingFor(clientRequestId);
  if (prior) return { sale: prior, duplicate: true };

  await validateParties({ store, customer });
  const lines = await buildSaleLines(items, !!isInterState, req);
  const summary = summarizeInvoice(lines);
  const settled = settlePayments(payments, summary.grandTotal, customer);

  const undo = await reserveStock(lines, store);
  let sale;
  try {
    const invoiceNumber = await generateDocNumber('sale');
    sale = await Sale.create({
      invoiceNumber, store, customer: customer || undefined, items: lines, ...summary,
      amountPaid: settled.amountPaid, payments: settled.payments, isInterState: !!isInterState,
      status: 'completed', cashier: req.user._id, notes: notes ? String(notes).slice(0, 500) : undefined, clientRequestId,
    });
  } catch (err) {
    await undo();
    if (err.code === 11000 && clientRequestId) {
      const first = await existingFor(clientRequestId);
      if (first) return { sale: first, duplicate: true };
    }
    throw err;
  }

  for (const line of lines) {
    await recordInventoryTransaction({
      product: line.product, batch: line.batch, quantity: -line.quantity, type: 'sale',
      source: store, sourceModel: 'Store',
      referenceType: 'Sale', referenceId: sale._id, referenceNumber: sale.invoiceNumber, user: req.user._id,
    });
  }
  for (const p of settled.payments) {
    if (p.method === 'credit' || p.amount <= 0) continue;
    await postLedgerPair({
      debitKey: methodToAccountKey(p.method), creditKey: 'sales', amount: p.amount,
      narration: `Sale ${sale.invoiceNumber}`, referenceType: 'Sale', referenceId: sale._id, userId: req.user._id,
    });
  }
  if (settled.creditAmount > 0) {
    await postLedgerPair({
      debitKey: 'receivable', creditKey: 'sales', amount: settled.creditAmount,
      narration: `Credit sale ${sale.invoiceNumber}`, referenceType: 'Sale', referenceId: sale._id, userId: req.user._id,
    });
  }
  if (summary.taxAmount > 0) {
    await postLedgerPair({
      debitKey: 'sales', creditKey: 'gstOutput', amount: summary.taxAmount,
      narration: `GST on ${sale.invoiceNumber}`, referenceType: 'Sale', referenceId: sale._id, userId: req.user._id,
    });
  }
  if (customer) {
    await Customer.findByIdAndUpdate(customer, { $inc: { outstanding: settled.creditAmount, loyaltyPoints: Math.floor(summary.grandTotal / 100) } });
  }
  await recordAudit({ req, action: 'sale.create', entity: 'Sale', entityId: sale._id, newValue: { invoiceNumber: sale.invoiceNumber, grandTotal: summary.grandTotal } });
  return { sale, duplicate: false };
}

export const createSale = catchAsync(async (req, res) => {
  const body = req.body || {};
  if (body.status === 'held') {
    await validateParties({ store: body.store, customer: body.customer });
    const lines = await buildSaleLines(body.items, !!body.isInterState, req);
    const sale = await Sale.create({
      invoiceNumber: `HOLD-${Date.now()}-${Math.floor(Math.random() * 1000)}`, store: body.store, customer: body.customer || undefined, items: lines,
      ...summarizeInvoice(lines), isInterState: !!body.isInterState, status: 'held', cashier: req.user._id,
      notes: body.notes ? String(body.notes).slice(0, 500) : undefined,
    });
    return res.status(201).json({ success: true, data: sale });
  }
  const { sale, duplicate } = await completeSale(req, body);
  res.status(duplicate ? 200 : 201).json({ success: true, data: sale, duplicate });
});

// Completes a held bill with the cart as it is now (the cashier may have edited it). The held bill
// is removed only after the sale succeeds, so a failed attempt never loses it.
export const resumeSale = catchAsync(async (req, res) => {
  const held = await Sale.findById(req.params.id);
  if (!held) throw new ApiError(404, 'Held bill not found.');
  if (held.status !== 'held') throw new ApiError(400, 'This bill is not on hold.');
  const body = {
    ...req.body,
    items: req.body.items?.length ? req.body.items : held.items.map((i) => ({ product: i.product, quantity: i.quantity, discountPercent: i.discountPercent })),
    customer: req.body.customer ?? held.customer, store: req.body.store ?? held.store,
    isInterState: req.body.isInterState ?? held.isInterState,
  };
  const { sale, duplicate } = await completeSale(req, body);
  await Sale.deleteOne({ _id: held._id, status: 'held' });
  res.status(duplicate ? 200 : 201).json({ success: true, data: sale, duplicate });
});

export const listSales = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.customer && mongoose.isValidObjectId(req.query.customer)) filter.customer = req.query.customer;
  const rx = searchRegex(req.query.search);
  if (rx) filter.invoiceNumber = rx;
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

// Posts the mirror image of every ledger line recorded for a document, and updates account balances.
async function reverseLedger(referenceId, narration, userId) {
  const entries = await LedgerEntry.find({ referenceId }).lean();
  if (!entries.length) return;
  const now = new Date();
  await LedgerEntry.insertMany(entries.map((e) => ({
    account: e.account, entryType: e.entryType === 'debit' ? 'credit' : 'debit', amount: e.amount,
    narration, referenceType: e.referenceType, referenceId, entryDate: now, createdBy: userId,
  })));
  for (const e of entries) {
    await Account.updateOne({ _id: e.account }, { $inc: { currentBalance: e.entryType === 'debit' ? -e.amount : e.amount } });
  }
}

export const cancelSale = catchAsync(async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) throw new ApiError(404, 'Invoice not found.');
  if (sale.status === 'cancelled') throw new ApiError(400, 'This invoice is already cancelled.');
  if (['returned', 'partially_returned'].includes(sale.status) || await SalesReturn.exists({ sale: sale._id })) {
    throw new ApiError(400, 'This invoice has returns against it. Process the remaining items as a sales return instead of cancelling.');
  }

  if (sale.status === 'completed') {
    // Flip the status first (atomically) so two simultaneous cancels cannot both restock.
    const claimed = await Sale.findOneAndUpdate({ _id: sale._id, status: 'completed' }, { status: 'cancelled' });
    if (!claimed) throw new ApiError(409, 'This invoice was changed by someone else. Refresh and try again.');
    for (const line of sale.items) {
      await Inventory.updateOne({ product: line.product, store: sale.store }, { $inc: { currentStock: line.quantity } }, { upsert: true });
      if (line.batch) await Batch.updateOne({ _id: line.batch }, { $inc: { availableQuantity: line.quantity } });
      await recordInventoryTransaction({
        product: line.product, batch: line.batch, quantity: line.quantity, type: 'sale_return',
        destination: sale.store, destinationModel: 'Store',
        referenceType: 'Sale', referenceId: sale._id, referenceNumber: sale.invoiceNumber,
        notes: 'Invoice cancelled', user: req.user._id,
      });
    }
    await reverseLedger(sale._id, `Cancelled ${sale.invoiceNumber}`, req.user._id);
    if (sale.customer) {
      const credit = (sale.payments || []).filter((p) => p.method === 'credit').reduce((s, p) => s + p.amount, 0);
      const customer = await Customer.findById(sale.customer);
      if (customer) {
        customer.outstanding = round2((customer.outstanding || 0) - credit);
        customer.loyaltyPoints = Math.max(0, (customer.loyaltyPoints || 0) - Math.floor(sale.grandTotal / 100));
        await customer.save();
      }
    }
  } else {
    await Sale.updateOne({ _id: sale._id }, { status: 'cancelled' });
  }
  await recordAudit({ req, action: 'sale.cancel', entity: 'Sale', entityId: sale._id, oldValue: { status: sale.status } });
  res.json({ success: true, data: await Sale.findById(sale._id) });
});

// ---------- Sales Returns ----------

export const createSalesReturn = catchAsync(async (req, res) => {
  const { saleId, items, refundMethod = 'cash' } = req.body;
  requireId(saleId, 'Invoice');
  oneOf(refundMethod, REFUND_METHODS, 'Refund method');
  const sale = await Sale.findById(saleId);
  if (!sale) throw new ApiError(404, 'Original invoice not found.');
  if (!['completed', 'partially_returned'].includes(sale.status)) throw new ApiError(400, `Items cannot be returned against a ${sale.status.replace('_', ' ')} invoice.`);
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Select at least one item to return.');
  if (refundMethod === 'store_credit' && !sale.customer) throw new ApiError(400, 'Store credit needs a customer on the invoice.');

  // What has already been returned on earlier returns, per product.
  const already = new Map();
  for (const r of await SalesReturn.find({ sale: sale._id }).lean()) {
    for (const i of r.items) already.set(String(i.product), (already.get(String(i.product)) || 0) + i.quantity);
  }
  const requested = new Map();
  for (const ret of items) {
    requireId(ret?.product, 'Returned product');
    const line = sale.items.find((l) => String(l.product) === String(ret.product));
    if (!line) throw new ApiError(400, 'Returned item was not part of the original invoice.');
    const qty = positive(ret.quantity, `Return quantity for ${line.productName}`, { max: line.quantity });
    const key = String(line.product);
    requested.set(key, (requested.get(key) || 0) + qty);
    const left = line.quantity - (already.get(key) || 0);
    if (requested.get(key) > left + 1e-9) throw new ApiError(400, `Only ${left} of ${line.productName} can still be returned on this invoice.`);
    if (ret.restockStatus && !['restocked', 'damaged'].includes(ret.restockStatus)) throw new ApiError(400, 'Restock status must be restocked or damaged.');
  }

  let totalRefund = 0;
  const returnItems = [];
  for (const ret of items) {
    const line = sale.items.find((l) => String(l.product) === String(ret.product));
    const qty = Number(ret.quantity);
    const refundAmount = round2((line.totalAmount / line.quantity) * qty);
    totalRefund += refundAmount;
    const restockStatus = ret.restockStatus || 'restocked';
    returnItems.push({ product: line.product, batch: line.batch, quantity: qty, unitPrice: line.unitPrice, refundAmount, reason: ret.reason ? String(ret.reason).slice(0, 200) : undefined, restockStatus });
    if (restockStatus === 'restocked') {
      await Inventory.updateOne({ product: line.product, store: sale.store }, { $inc: { currentStock: qty } }, { upsert: true });
      if (line.batch) await Batch.updateOne({ _id: line.batch }, { $inc: { availableQuantity: qty } });
    }
    await recordInventoryTransaction({
      product: line.product, batch: line.batch, quantity: qty, type: 'sale_return',
      destination: sale.store, destinationModel: 'Store',
      referenceType: 'SalesReturn', referenceNumber: sale.invoiceNumber, notes: ret.reason, user: req.user._id,
    });
  }
  totalRefund = round2(totalRefund);

  const returnNumber = await generateDocNumber('saleReturn');
  const salesReturn = await SalesReturn.create({
    returnNumber, sale: sale._id, customer: sale.customer, items: returnItems,
    refundMethod, totalRefund, processedBy: req.user._id,
  });

  const sold = sale.items.reduce((s, l) => s + l.quantity, 0);
  const returned = [...already.values()].reduce((s, q) => s + q, 0) + returnItems.reduce((s, l) => s + l.quantity, 0);
  sale.status = returned >= sold ? 'returned' : 'partially_returned';
  await sale.save();

  if (sale.customer && refundMethod === 'store_credit') {
    await Customer.findByIdAndUpdate(sale.customer, { $inc: { outstanding: -totalRefund } });
  }
  await postLedgerPair({
    debitKey: 'sales', creditKey: refundMethod === 'store_credit' ? 'receivable' : methodToAccountKey(refundMethod),
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
