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
import Settings from '../models/Settings.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { calculateLineGst, summarizeInvoice, round2 } from '../utils/gstCalculator.js';
import { recordInventoryTransaction } from './inventoryController.js';
import { postLedgerPair, methodToAccountKey } from '../utils/ledger.js';
import { searchRegex, requireId, number, positive, oneOf } from '../utils/validate.js';
import { assertActiveStore, mainStoreId } from '../utils/storeGuard.js';
import Brand from '../models/Brand.js';
import { resolveSaleCustomer } from './tradeController.js';
import { requireFields } from '../utils/fieldRules.js';
import { unitMap, normCode, compatible, convert, productUnits, round, unitRate } from '../utils/units.js';

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
// Single store: stock is taken from the central Inventory row, the same quantity Inventory shows.
async function reserveStock(lines) {
  const store = await mainStoreId();
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
        throw new ApiError(400, have > 0 ? `Only ${have} of ${name} in stock (bill needs ${qty}).` : `${name} is out of stock.`);
      }
      done.push({ kind: 'inv', id: inv._id, qty });
    }
    for (const line of lines) {
      if (line.brand) {
        // Brand chosen at billing: take the quantity from that brand's batches (oldest expiry first).
        let left = line.quantity;
        const batches = await Batch.find({ product: line.product, brand: line.brand, availableQuantity: { $gt: 0 } })
          .sort({ expiryDate: 1, createdAt: 1 }).select('_id availableQuantity').lean();
        const have = batches.reduce((t, b) => t + b.availableQuantity, 0);
        if (have + 1e-9 < left) {
          throw new ApiError(400, have > 0 ? `Only ${round(have, 3)} of ${line.productName} (${line.brandName || 'this brand'}) in stock.` : `${line.productName} (${line.brandName || 'this brand'}) is out of stock.`);
        }
        for (const b of batches) {
          if (left <= 1e-9) break;
          const take = Math.min(left, b.availableQuantity);
          const r = await Batch.updateOne({ _id: b._id, availableQuantity: { $gte: take } }, { $inc: { availableQuantity: -take } });
          if (!r.modifiedCount) throw new ApiError(409, 'Stock changed while billing. Try again.');
          done.push({ kind: 'batch', id: b._id, qty: take });
          line.batch = line.batch || b._id;
          left -= take;
        }
        continue;
      }
      if (line.batch) {
        if (!mongoose.isValidObjectId(line.batch)) throw new ApiError(400, 'Invalid batch selected.');
        const b = await Batch.findOneAndUpdate(
          { _id: line.batch, product: line.product, availableQuantity: { $gte: line.quantity } },
          { $inc: { availableQuantity: -line.quantity } },
        );
        if (!b) throw new ApiError(400, `The selected batch of ${line.productName} has too little stock.`);
        done.push({ kind: 'batch', id: b._id, qty: line.quantity });
      } else {
        // First-expiry-first-out: the earliest-expiring batch that can cover the whole line.
        const b = await Batch.findOneAndUpdate(
          { product: line.product, status: 'active', availableQuantity: { $gte: line.quantity } },
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
  await assertActiveStore(store, 'Selected store');
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
  const { items = [], customer, payments = [], isInterState = false, notes } = body;
  const store = await mainStoreId(); // single department store: every bill belongs to it
  const clientRequestId = body.clientRequestId ? String(body.clientRequestId).slice(0, 100) : undefined;
  const prior = await existingFor(clientRequestId);
  if (prior) return { sale: prior, duplicate: true };

  await validateParties({ store, customer });
  const lines = await buildSaleLines(items, !!isInterState, req);
  const summary = summarizeInvoice(lines);
  const settled = settlePayments(payments, summary.grandTotal, customer);

  const undo = await reserveStock(lines);
  let sale;
  try {
    const invoiceNumber = await generateDocNumber('sale');
    sale = await Sale.create({
      invoiceNumber, store, customer: customer || undefined, items: lines, ...summary,
      amountPaid: round2(settled.amountPaid - settled.creditAmount), payments: settled.payments, isInterState: !!isInterState,
      creditAmount: settled.creditAmount, amountDue: settled.creditAmount,
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
    body.store = await mainStoreId();
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

// Payment status of a bill from what is still due: paid / partial (some received, some due) / unpaid (nothing received).
const SALE_PAYMENT_STATUS = {
  paid: { amountDue: { $lte: 0.005 } },
  partial: { amountDue: { $gt: 0.005 }, amountPaid: { $gt: 0 } },
  unpaid: { amountDue: { $gt: 0.005 }, amountPaid: { $lte: 0 } },
};
const SALE_SORTS = { date: 'createdAt', total: 'grandTotal', due: 'amountDue', invoiceNumber: 'invoiceNumber' };
const istStart = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00.000+05:30`);
const istEnd = (d) => new Date(`${String(d).slice(0, 10)}T23:59:59.999+05:30`);
const asNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// Sales register filters (all combine): date range, invoice no, customer, product, brand, payment method,
// payment status, sale type (cash / credit), bill type, status, quantity / rate / amount ranges.
export async function salesFilter(q = {}) {
  const filter = {};
  const and = [];
  if (q.status) filter.status = { $in: String(q.status).split(',').filter(Boolean) };
  else filter.status = { $nin: ['held'] };
  if (q.customer) filter.customer = new mongoose.Types.ObjectId(requireId(q.customer, 'Customer'));
  if (q.billType) filter.billType = oneOf(q.billType, ['pos', 'simple'], 'Bill type');
  if (q.search) {
    const rx = searchRegex(q.search);
    const custIds = await Customer.find({ $or: [{ name: rx }, { phone: rx }] }).distinct('_id');
    and.push({ $or: [{ invoiceNumber: rx }, { customer: { $in: custIds } }, { 'items.productName': rx }] });
  }
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = istStart(q.from);
    if (q.to) filter.createdAt.$lte = istEnd(q.to);
  }
  if (q.method) and.push({ 'payments.method': oneOf(q.method, PAYMENT_METHODS, 'Payment method') });
  if (q.saleType === 'cash') and.push({ creditAmount: { $not: { $gt: 0 } }, 'payments.method': { $ne: 'credit' } });
  if (q.saleType === 'credit') and.push({ $or: [{ creditAmount: { $gt: 0 } }, { 'payments.method': 'credit' }] });
  if (q.paymentStatus) {
    const st = SALE_PAYMENT_STATUS[q.paymentStatus];
    if (!st) throw new ApiError(400, 'Payment status must be paid, partial or unpaid.');
    and.push(st);
  }
  const line = {};
  if (q.product) line.product = new mongoose.Types.ObjectId(requireId(q.product, 'Product'));
  if (q.brand) line.brand = new mongoose.Types.ObjectId(requireId(q.brand, 'Brand'));
  const range = (field, min, max) => {
    const a = asNum(min); const b = asNum(max);
    if (a === null && b === null) return;
    line[field] = {};
    if (a !== null) line[field].$gte = a;
    if (b !== null) line[field].$lte = b;
  };
  range('quantity', q.minQty, q.maxQty);
  range('unitPrice', q.minRate, q.maxRate);
  if (Object.keys(line).length) and.push({ items: { $elemMatch: line } });
  const minA = asNum(q.minAmount); const maxA = asNum(q.maxAmount);
  if (minA !== null || maxA !== null) {
    filter.grandTotal = {};
    if (minA !== null) filter.grandTotal.$gte = minA;
    if (maxA !== null) filter.grandTotal.$lte = maxA;
  }
  if (and.length) filter.$and = and;
  return filter;
}

export const listSales = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = await salesFilter(req.query);
  const sortKey = SALE_SORTS[req.query.sort] || 'createdAt';
  const dir = req.query.order === 'asc' ? 1 : -1;
  const [docs, total, sums] = await Promise.all([
    Sale.find(filter).populate('customer', 'name phone').populate('cashier', 'name').sort({ [sortKey]: dir, _id: dir }).skip(skip).limit(limit),
    Sale.countDocuments(filter),
    Sale.aggregate([
      { $match: { ...filter, status: filter.status?.$in ? filter.status : { $nin: ['held', 'cancelled'] } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, received: { $sum: '$amountPaid' }, due: { $sum: { $ifNull: ['$amountDue', 0] } }, credit: { $sum: { $ifNull: ['$creditAmount', 0] } } } },
    ]),
  ]);
  const s = sums[0] || {};
  const summary = { total: round2(s.total || 0), received: round2(s.received || 0), due: round2(s.due || 0), credit: round2(s.credit || 0), cash: round2((s.total || 0) - (s.credit || 0)) };
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }), summary });
});

export const getSale = catchAsync(async (req, res) => {
  const sale = await Sale.findById(req.params.id).populate('customer store cashier items.product').populate('items.brand', 'name');
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
  if (sale.receipts?.length) throw new ApiError(400, 'Payments have been received against this invoice. Process a sales return instead of cancelling.');
  if (['returned', 'partially_returned'].includes(sale.status) || await SalesReturn.exists({ sale: sale._id })) {
    throw new ApiError(400, 'This invoice has returns against it. Process the remaining items as a sales return instead of cancelling.');
  }

  if (sale.status === 'completed') {
    // Flip the status first (atomically) so two simultaneous cancels cannot both restock.
    const claimed = await Sale.findOneAndUpdate({ _id: sale._id, status: 'completed' }, { status: 'cancelled' });
    if (!claimed) throw new ApiError(409, 'This invoice was changed by someone else. Refresh and try again.');
    // Simple bills took stock only for priced lines (baseQty, in the product's base unit) - only that goes back.
    for (const line of sale.items) {
      if (sale.billType === 'simple' && !(line.baseQty > 0)) continue;
      const qty = sale.billType === 'simple' ? line.baseQty : line.quantity;
      await Inventory.updateOne({ product: line.product, store: await mainStoreId() }, { $inc: { currentStock: qty } }, { upsert: true });
      if (line.batch) await Batch.updateOne({ _id: line.batch }, { $inc: { availableQuantity: qty } });
      await recordInventoryTransaction({
        product: line.product, batch: line.batch, quantity: qty, type: 'sale_return',
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
        await Sale.updateOne({ _id: sale._id }, { $set: { amountDue: 0 } });
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

// ---------- Simple bill (Billing screen) ----------
// Each line: product, quantity + unit (g, kg, mg, ml, L, pcs, dozen, packet, ... see utils/units.js).
// * Priced product (Product Master selling price > 0): the rate is the catalogue price per the product's selling
//   unit (anything the browser sends is ignored), the quantity is converted to that unit (250 g of Rs 60/kg rice
//   = Rs 15), the product's discount % applies, and the stock is checked and taken in the product's base unit.
// * Name-only product (no selling price): the cashier types the rate per `rateUnit` (kg by default) - no stock.
// Only compatible units convert (weight <-> weight, volume <-> volume, pcs <-> dozen); a packet converts to
// grams only when the product's net content per packet is set. GST = taxable x the product's GST %; the GST type
// in Pricing & GST decides the split (Intra-State -> CGST + SGST, Inter-State -> IGST). Total = taxable + GST.
// Unit, rate and amounts are stored on the bill, so later price changes never alter old bills.
const SIMPLE_PAYMENTS = ['cash', 'upi', 'card', 'bank_transfer'];

function priceLine(it, product, units) {
  const unit = normCode(it.unit);
  if (!units.has(unit)) throw new ApiError(400, `Unknown unit "${it.unit}" for ${product.name}.`);
  const quantity = positive(it.quantity, `Quantity for ${product.name}`, { max: 1000000 });
  // Conversion rules of the product (box = 24 pcs, packet = 500 g...) take part in every conversion.
  const pack = product;
  const ownRate = unitRate(product, normCode(it.unit), 'sellingPrice');
  const catalogue = product.sellingPrice > 0 || ownRate !== null;
  let rateUnit; let rate; let base;
  if (catalogue) {
    if (product.status !== 'active') throw new ApiError(400, `${product.name} is ${product.status} and cannot be sold.`);
    const { sellingUnit, baseUnit } = productUnits(product, units);
    // A unit with its own selling rate (e.g. per box) is billed at that rate; other units convert to the selling unit.
    rateUnit = ownRate !== null ? normCode(it.unit) : sellingUnit;
    rate = ownRate !== null ? ownRate : product.sellingPrice;
    base = baseUnit;
    if (!compatible(normCode(it.unit), baseUnit, units, pack)) {
      throw new ApiError(400, `${product.name} is stocked in ${units.get(baseUnit)?.short}; ${units.get(normCode(it.unit))?.short || it.unit} does not convert to it. Add a conversion rule in Product Master.`);
    }
  } else {
    rateUnit = normCode(it.rateUnit || 'kg');
    if (!units.has(rateUnit)) throw new ApiError(400, `Unknown rate unit "${it.rateUnit}" for ${product.name}.`);
    rate = number(it.rate, `Rate for ${product.name}`, { min: 0, max: 1000000 });
  }
  const u = units.get(unit);
  if (!compatible(unit, rateUnit, units, pack)) {
    throw new ApiError(400, `${product.name} is priced per ${units.get(rateUnit).short}; ${u.short} cannot be converted to ${units.get(rateUnit).short}.`);
  }
  // Pieces and packs are counted whole (half a dozen = 6 pcs is fine, 1.5 packets is not).
  if (u.family === 'each' && !Number.isInteger(round(quantity * u.factor, 6))) throw new ApiError(400, `Quantity for ${product.name} must be whole pieces.`);
  if (u.family.startsWith('pack:') && !Number.isInteger(quantity)) throw new ApiError(400, `Quantity for ${product.name} must be a whole number of ${u.short}s.`);
  const rateQty = convert(quantity, unit, rateUnit, units, pack);
  const gross = round2(rateQty * rate);
  const discountPercent = catalogue ? Math.min(100, Math.max(0, Number(product.discountPercent) || 0)) : 0;
  const discountAmount = round2((gross * discountPercent) / 100);
  const line = {
    product: product._id, productName: product.name, sku: product.sku, quantity, unit, rateUnit, unitPrice: rate,
    discountPercent, grossAmount: gross, discountAmount, taxableAmount: round2(gross - discountAmount),
  };
  if (u.family === 'mass') line.quantityKg = convert(quantity, unit, 'kg', units);
  if (catalogue) { line.baseUnit = base; line.baseQty = convert(quantity, unit, base, units, pack); }
  return line;
}

export const createSimpleBill = catchAsync(async (req, res) => {
  const { items, paymentMethod = 'cash' } = req.body || {};
  oneOf(paymentMethod, SIMPLE_PAYMENTS, 'Payment method');
  // Optional customer (existing id, or name + phone to add one). Needed when part of the bill is left unpaid.
  const customerDoc = await resolveSaleCustomer(req, req.body?.customer, req.body?.newCustomer);
  await requireFields('billing', { customer: customerDoc?._id });
  const clientRequestId = req.body?.clientRequestId ? String(req.body.clientRequestId).slice(0, 100) : undefined;
  if (clientRequestId) {
    const first = await Sale.findOne({ clientRequestId });
    if (first) return res.json({ success: true, data: first, duplicate: true });
  }
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Add at least one product to the bill.');
  if (items.length > MAX_LINES) throw new ApiError(400, `A bill can have at most ${MAX_LINES} lines.`);

  const settings = await Settings.findOne().select('gstType customUnits').lean();
  const interState = settings?.gstType === 'inter';
  const units = unitMap(settings?.customUnits);
  const lines = [];
  for (const it of items) {
    requireId(it?.product, 'Product');
    const product = await Product.findById(it.product)
      .select('name sku status gstRate sellingPrice discountPercent unit sellingUnit baseUnit packUnit packQuantity packQuantityUnit conversions unitPrices').lean();
    if (!product || product.status === 'discontinued') throw new ApiError(400, 'A product on this bill is no longer in the product list.');
    const line = priceLine(it, product, units);
    if (it.brand) {
      requireId(it.brand, 'Brand');
      if (line.baseQty === undefined) throw new ApiError(400, `${product.name} has no selling price, so it is not sold from stock - remove the brand or set a price in Product Master.`);
      const brand = await Brand.findById(it.brand).select('name').lean();
      if (!brand) throw new ApiError(400, 'A brand on this bill was not found.');
      line.brand = brand._id;
      line.brandName = brand.name;
    }
    const gstRate = Number(product.gstRate) || 0;
    const tax = round2((line.taxableAmount * gstRate) / 100);
    const cgst = interState ? 0 : round2(tax / 2);
    const sgst = interState ? 0 : round2(tax - cgst);
    lines.push({ ...line, gstRate, cgst, sgst, igst: interState ? tax : 0, taxAmount: tax, totalAmount: round2(line.taxableAmount + tax) });
  }
  const sum = (k) => round2(lines.reduce((t, l) => t + (l[k] || 0), 0));
  const taxableTotal = sum('taxableAmount');
  const taxTotal = sum('taxAmount');
  const total = round2(taxableTotal + taxTotal);
  if (total <= 0) throw new ApiError(400, 'The bill total must be more than zero.');
  // Amount received now (default: the whole bill). The rest is a credit sale on the customer's account.
  const received = req.body?.amountReceived === undefined || req.body?.amountReceived === null || req.body?.amountReceived === ''
    ? total : round2(number(req.body.amountReceived, 'Amount received', { min: 0, max: 1e9 }));
  if (received > total + 0.001) throw new ApiError(400, `Amount received (₹${received}) is more than the bill total (₹${total}).`);
  const credit = round2(total - received);
  if (credit > 0.001 && !customerDoc) throw new ApiError(400, 'Select or add the customer for a credit / part-paid bill.');

  // Priced products: check the stock (in the base unit, with a clear message), then take it atomically -
  // the conditional decrement in reserveStock never lets stock go below zero.
  const stockLines = lines.filter((l) => l.baseQty !== undefined).map((l) => ({ product: l.product, brand: l.brand, brandName: l.brandName, quantity: l.baseQty, productName: l.productName, ref: l }));
  if (stockLines.length) {
    const need = new Map();
    for (const l of stockLines) need.set(String(l.product), round((need.get(String(l.product)) || 0) + l.quantity, 6));
    const storeId = await mainStoreId();
    const have = new Map((await Inventory.find({ product: { $in: [...need.keys()] }, store: storeId }).select('product currentStock').lean())
      .map((i) => [String(i.product), i.currentStock || 0]));
    for (const [id, qty] of need) {
      const avail = have.get(id) || 0;
      if (avail + 1e-9 < qty) {
        const l = stockLines.find((x) => String(x.product) === id).ref;
        const short = units.get(l.baseUnit)?.short || l.baseUnit;
        throw new ApiError(400, avail > 0 ? `Only ${round(avail, 3)} ${short} of ${l.productName} in stock (bill needs ${round(qty, 3)} ${short}).` : `${l.productName} is out of stock.`);
      }
    }
  }
  const undo = stockLines.length ? await reserveStock(stockLines) : async () => {};
  for (const l of stockLines) if (l.batch) l.ref.batch = l.batch;
  const store = await mainStoreId();
  let sale;
  try {
    sale = await Sale.create({
      invoiceNumber: await generateDocNumber('sale'), store, items: lines, billType: 'simple', customer: customerDoc?._id,
      subtotal: sum('grossAmount'), discount: sum('discountAmount'), taxableAmount: taxableTotal, cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'),
      taxAmount: taxTotal, roundOff: 0, grandTotal: total, isInterState: interState,
      amountPaid: received,
      payments: [...(received > 0 ? [{ method: paymentMethod, amount: received }] : []), ...(credit > 0 ? [{ method: 'credit', amount: credit }] : [])],
      creditAmount: credit, amountDue: credit,
      status: 'completed', cashier: req.user._id, clientRequestId,
    });
  } catch (err) {
    await undo();
    if (err.code === 11000 && clientRequestId) {
      const first = await Sale.findOne({ clientRequestId });
      if (first) return res.json({ success: true, data: first, duplicate: true });
    }
    throw err;
  }
  for (const line of stockLines) {
    await recordInventoryTransaction({
      product: line.product, batch: line.batch, quantity: -line.quantity, type: 'sale',
      source: store, sourceModel: 'Store',
      referenceType: 'Sale', referenceId: sale._id, referenceNumber: sale.invoiceNumber, user: req.user._id,
    });
  }
  await postLedgerPair({
    debitKey: methodToAccountKey(paymentMethod), creditKey: 'sales', amount: received,
    narration: `Sale ${sale.invoiceNumber}`, referenceType: 'Sale', referenceId: sale._id, userId: req.user._id,
  });
  if (credit > 0) {
    await postLedgerPair({
      debitKey: 'receivable', creditKey: 'sales', amount: credit,
      narration: `Credit sale ${sale.invoiceNumber}`, referenceType: 'Sale', referenceId: sale._id, userId: req.user._id,
    });
  }
  if (customerDoc) {
    await Customer.findByIdAndUpdate(customerDoc._id, { $inc: { outstanding: credit, loyaltyPoints: Math.floor(total / 100) } });
  }
  if (taxTotal > 0) {
    await postLedgerPair({
      debitKey: 'sales', creditKey: 'gstOutput', amount: taxTotal,
      narration: `GST on ${sale.invoiceNumber}`, referenceType: 'Sale', referenceId: sale._id, userId: req.user._id,
    });
  }
  await recordAudit({ req, action: 'sale.create', entity: 'Sale', entityId: sale._id, newValue: { invoiceNumber: sale.invoiceNumber, grandTotal: total, billType: 'simple' } });
  res.status(201).json({ success: true, data: sale });
});

// ---------- Sales Returns ----------

// A return is valued at the line's billed price (incl. GST). If the bill still has an amount due (credit /
// part-paid), the return first reduces that due; only the rest is refunded (cash / UPI / card / bank /
// store credit). Restocked items go back to stock: POS lines by quantity, Billing-screen lines by the base
// quantity that was taken (e.g. returning 0.5 kg of a 1 kg line puts back 500 g).
export const createSalesReturn = catchAsync(async (req, res) => {
  const { saleId, items, refundMethod = 'cash' } = req.body;
  requireId(saleId, 'Invoice');
  oneOf(refundMethod, REFUND_METHODS, 'Refund method');
  const sale = await Sale.findById(saleId);
  if (!sale) throw new ApiError(404, 'Original invoice not found.');
  if (!['completed', 'partially_returned'].includes(sale.status)) throw new ApiError(400, `Items cannot be returned against a ${sale.status.replace('_', ' ')} invoice.`);
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Select at least one item to return.');
  if (refundMethod === 'store_credit' && !sale.customer) throw new ApiError(400, 'Store credit needs a customer on the invoice.');

  // Which bill line each request item refers to: lineIndex, or the product when it is on the bill once.
  const lineIndexOf = (ret) => {
    if (ret?.lineIndex !== undefined && ret?.lineIndex !== null && ret?.lineIndex !== '') {
      const i = Number(ret.lineIndex);
      if (!Number.isInteger(i) || i < 0 || i >= sale.items.length) throw new ApiError(400, 'Returned item was not part of the original invoice.');
      return i;
    }
    requireId(ret?.product, 'Returned product');
    const matches = sale.items.map((l, i) => (String(l.product) === String(ret.product) ? i : -1)).filter((i) => i >= 0);
    if (!matches.length) throw new ApiError(400, 'Returned item was not part of the original invoice.');
    if (matches.length > 1) throw new ApiError(400, 'This product is on the bill more than once - choose the bill line to return.');
    return matches[0];
  };

  // Already returned per bill line (older returns have no line index: matched by product).
  const already = new Map();
  for (const r of await SalesReturn.find({ sale: sale._id }).lean()) {
    for (const i of r.items) {
      const idx = i.lineIndex ?? sale.items.findIndex((l) => String(l.product) === String(i.product));
      already.set(idx, (already.get(idx) || 0) + i.quantity);
    }
  }
  const plan = [];
  const requested = new Map();
  for (const ret of items) {
    const idx = lineIndexOf(ret);
    const line = sale.items[idx];
    const qty = positive(ret.quantity, `Return quantity for ${line.productName}`, { max: line.quantity });
    requested.set(idx, (requested.get(idx) || 0) + qty);
    const left = round(line.quantity - (already.get(idx) || 0), 6);
    if (requested.get(idx) > left + 1e-9) throw new ApiError(400, `Only ${left} ${line.unit || ''} of ${line.productName} can still be returned on this invoice.`.replace('  ', ' '));
    if (ret.restockStatus && !['restocked', 'damaged'].includes(ret.restockStatus)) throw new ApiError(400, 'Restock status must be restocked or damaged.');
    await requireFields('salesReturn', { reason: ret.reason });
    plan.push({ idx, line, qty, ret });
  }

  let totalRefund = 0;
  const returnItems = [];
  const store = await mainStoreId();
  for (const { idx, line, qty, ret } of plan) {
    const refundAmount = round2((line.totalAmount / line.quantity) * qty);
    totalRefund += refundAmount;
    const restockStatus = ret.restockStatus || 'restocked';
    // Stock that goes back: POS lines by quantity; Billing-screen lines only if stock was taken (baseQty).
    const stockQty = sale.billType === 'simple' ? (line.baseQty > 0 ? round((line.baseQty * qty) / line.quantity, 6) : 0) : qty;
    returnItems.push({
      product: line.product, brand: line.brand, lineIndex: idx, batch: line.batch, quantity: qty, unit: line.unit, stockQuantity: stockQty,
      unitPrice: line.unitPrice, refundAmount, reason: ret.reason ? String(ret.reason).slice(0, 200) : undefined, restockStatus,
    });
    if (restockStatus === 'restocked' && stockQty > 0) {
      await Inventory.updateOne({ product: line.product, store }, { $inc: { currentStock: stockQty } }, { upsert: true });
      if (line.batch) await Batch.updateOne({ _id: line.batch }, { $inc: { availableQuantity: stockQty } });
    }
    if (stockQty > 0) {
      await recordInventoryTransaction({
        product: line.product, batch: line.batch, quantity: restockStatus === 'restocked' ? stockQty : 0, type: 'sale_return',
        destination: sale.store, destinationModel: 'Store',
        referenceType: 'SalesReturn', referenceNumber: sale.invoiceNumber, notes: [restockStatus === 'damaged' ? 'Damaged - not restocked' : '', ret.reason].filter(Boolean).join(' - ') || undefined, user: req.user._id,
      });
    }
  }
  totalRefund = round2(totalRefund);
  // Credit / part-paid bill: the return first clears what the customer still owes on it.
  const dueAdjusted = round2(Math.min(totalRefund, Math.max(0, sale.amountDue || 0)));
  const refundPaid = round2(totalRefund - dueAdjusted);

  const returnNumber = await generateDocNumber('saleReturn');
  const salesReturn = await SalesReturn.create({
    returnNumber, sale: sale._id, customer: sale.customer, items: returnItems,
    refundMethod, totalRefund, dueAdjusted, refundPaid, processedBy: req.user._id,
  });

  const allReturned = new Map(already);
  plan.forEach(({ idx, qty }) => allReturned.set(idx, (allReturned.get(idx) || 0) + qty));
  const fully = sale.items.every((l, i) => (allReturned.get(i) || 0) + 1e-9 >= l.quantity);
  sale.status = fully ? 'returned' : 'partially_returned';
  sale.amountDue = round2((sale.amountDue || 0) - dueAdjusted);
  await sale.save();

  const customerDelta = dueAdjusted + (refundMethod === 'store_credit' ? refundPaid : 0);
  if (sale.customer && customerDelta > 0) await Customer.findByIdAndUpdate(sale.customer, { $inc: { outstanding: -round2(customerDelta) } });
  if (dueAdjusted > 0) {
    await postLedgerPair({
      debitKey: 'sales', creditKey: 'receivable', amount: dueAdjusted, narration: `Return against ${sale.invoiceNumber} (adjusted against amount due)`,
      referenceType: 'SalesReturn', referenceId: salesReturn._id, userId: req.user._id,
    });
  }
  await postLedgerPair({
    debitKey: 'sales', creditKey: refundMethod === 'store_credit' ? 'receivable' : methodToAccountKey(refundMethod),
    amount: refundPaid, narration: `Return against ${sale.invoiceNumber}`,
    referenceType: 'SalesReturn', referenceId: salesReturn._id, userId: req.user._id,
  });
  await recordAudit({ req, action: 'sale.return', entity: 'SalesReturn', entityId: salesReturn._id, newValue: { returnNumber, totalRefund, dueAdjusted, refundPaid } });
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
