import Purchase from '../models/Purchase.js';
import PurchaseReturn from '../models/PurchaseReturn.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { round2 } from '../utils/gstCalculator.js';
import { postLedgerPair, methodToAccountKey } from '../utils/ledger.js';
import Payment from '../models/Payment.js';
import { literalRegex, requireId, positive, number, oneOf } from '../utils/validate.js';
import Vendor from '../models/Vendor.js';
import PurchaseInvoice from '../models/PurchaseInvoice.js';
import InwardDC from '../models/InwardDC.js';
import OutwardDC from '../models/OutwardDC.js';
import { billedAmount, BILLED_EXPR, invoiceDue } from '../utils/payables.js';
import { assertVerifiedVendor } from '../utils/vendorGuard.js';
import { mainStoreId } from '../utils/storeGuard.js';
import mongoose from 'mongoose';
import { lineKey, findLine } from '../utils/lineMatch.js';
import { resolveBrand, rememberBrands, findOrCreateBrand, findOrCreateProduct } from '../utils/masters.js';
import { unitMap, normCode, compatible, convert, productUnits, allowsDecimal, round } from '../utils/units.js';
import { loadCustomUnits } from './productController.js';
import { requireFields } from '../utils/fieldRules.js';

function computeItemTotals(item) {
  const taxableAmount = round2(item.quantity * item.unitPrice);
  const taxAmount = round2((taxableAmount * (item.gstRate || 0)) / 100);
  return { taxableAmount, taxAmount, totalAmount: round2(taxableAmount + taxAmount) };
}

// Builds clean, priced PO lines. Only product and quantity are required; rate per piece, GST, brand and
// batch details are optional. Amount = quantity x rate per piece (+ GST when given).
// The unit a purchase line is entered in: the one chosen, else the product's purchase unit, else its stock unit.
// It must convert to the stock unit (directly, or through the product's conversion rule such as 1 box = 24 pcs).
function purchaseUnit(prod, requested, units) {
  const { baseUnit } = productUnits(prod, units);
  const unit = requested ? normCode(requested) : (units.has(prod.purchaseUnit) && compatible(prod.purchaseUnit, baseUnit, units, prod) ? prod.purchaseUnit : baseUnit);
  if (!units.has(unit)) throw new ApiError(400, `Unknown unit "${requested}" for ${prod.name}.`);
  if (!compatible(unit, baseUnit, units, prod)) {
    throw new ApiError(400, `${prod.name} is stocked in ${units.get(baseUnit).short}; ${units.get(unit).short} does not convert to it. Add a conversion rule (e.g. 1 box = 24 pcs) in Product Master.`);
  }
  return { unit, baseUnit, baseFactor: convert(1, unit, baseUnit, units, prod), decimal: allowsDecimal(units.get(unit)) };
}

async function buildPurchaseItems(items) {
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Add at least one item to the purchase order.');
  const computedItems = [];
  const seen = new Set();
  const blank = (v) => v === '' || v === null || v === undefined;
  const units = unitMap(await loadCustomUnits());
  for (const i of items) {
    requireId(i?.product, 'Product');
    const prod = await Product.findById(i.product).select('name unit sellingUnit baseUnit purchaseUnit packUnit packQuantity packQuantityUnit conversions').lean();
    if (!prod) throw new ApiError(400, 'A product on this order was not found.');
    const uom = purchaseUnit(prod, i.unit, units);
    await requireFields('purchaseOrder', { unitPrice: blank(i.unitPrice) || Number(i.unitPrice) === 0 ? '' : i.unitPrice, brand: i.brand || i.brandName, gstRate: blank(i.gstRate) ? '' : i.gstRate });
    const brand = await resolveBrand({ brand: i.brand, brandName: i.brandName });
    // One line per product + brand, so invoices and inward DCs can match lines unambiguously.
    const key = lineKey({ product: i.product, brand });
    if (seen.has(key)) throw new ApiError(400, 'A product appears twice on the order with the same brand - combine the quantities into one line (one unit per line).');
    seen.add(key);
    const clean = {
      product: i.product, brand, batchNumber: i.batchNumber || undefined,
      manufacturingDate: i.manufacturingDate || undefined, expiryDate: i.expiryDate || undefined,
      ...uom,
      quantity: round(positive(i.quantity, `Order quantity for ${prod.name}`, { integer: !uom.decimal, max: 1000000 }), 3),
      unitPrice: number(blank(i.unitPrice) ? 0 : i.unitPrice, 'Rate per piece', { min: 0, max: 10000000 }),
      gstRate: number(blank(i.gstRate) ? 0 : i.gstRate, 'GST rate', { min: 0, max: 100 }),
    };
    computedItems.push({ ...clean, ...computeItemTotals(clean) });
  }
  const subtotal = round2(computedItems.reduce((s, i) => s + i.taxableAmount, 0));
  const taxAmount = round2(computedItems.reduce((s, i) => s + i.taxAmount, 0));
  return { items: computedItems, subtotal, taxAmount, grandTotal: round2(subtotal + taxAmount) };
}

// A vendor that may be ordered from: verified, or pending / on hold (the order then stays a draft until an
// administrator verifies the vendor). Rejected or inactive vendors cannot be used.
async function purchasableVendor(vendorId) {
  requireId(vendorId, 'Vendor');
  const v = await Vendor.findById(vendorId).select('name verificationStatus status').lean();
  if (!v) throw new ApiError(400, 'Selected vendor was not found.');
  if (v.status === 'inactive') throw new ApiError(400, `Vendor "${v.name}" is inactive.`);
  if (v.verificationStatus === 'rejected') throw new ApiError(400, `Vendor "${v.name}" was rejected in verification and cannot be ordered from.`);
  return v;
}

export const createPurchase = catchAsync(async (req, res) => {
  const { vendor, items = [], notes, approve = true } = req.body;
  const store = await mainStoreId(); // single department store receives every purchase
  const distributionCenter = undefined;
  const v = await purchasableVendor(vendor);
  await requireFields('purchaseOrder', { notes });
  const built = await buildPurchaseItems(items);
  // New / unverified suppliers: the order is saved as a draft and is approved once the vendor is verified.
  const canApprove = approve !== false && v.verificationStatus === 'verified';

  const poNumber = await generateDocNumber('purchase');
  const purchase = await Purchase.create({
    poNumber, vendor, store, distributionCenter, ...built,
    invoicedAmount: 0, // nothing is payable until a Purchase Invoice is raised
    status: canApprove ? 'approved' : 'draft', orderedBy: req.user._id, notes: notes ? String(notes).slice(0, 500) : undefined,
    ...(canApprove ? { approvedBy: req.user._id, approvedAt: new Date() } : {}),
  });
  await rememberBrands(built.items);

  await recordAudit({ req, action: 'purchase.create', entity: 'Purchase', entityId: purchase._id, newValue: { poNumber, grandTotal: built.grandTotal, status: purchase.status } });
  const notice = approve !== false && !canApprove
    ? `Saved as draft: vendor "${v.name}" is waiting for verification. It can be approved after an administrator verifies the vendor.`
    : undefined;
  res.status(201).json({ success: true, data: purchase, notice });
});

// An order can be edited or cancelled (administrators only) while nothing has been invoiced against it.
async function editablePurchase(id) {
  requireId(id, 'Purchase order');
  const po = await Purchase.findById(id);
  if (!po) throw new ApiError(404, 'Purchase order not found.');
  if (po.status === 'cancelled') throw new ApiError(400, 'This purchase order is cancelled.');
  const touched = (po.invoicedAmount || 0) > 0 || po.items.some((l) => (l.invoicedQuantity || 0) > 0 || (l.receivedQuantity || 0) > 0);
  if (touched || !['draft', 'approved', 'ordered'].includes(po.status)
    || await PurchaseInvoice.exists({ purchase: po._id, status: { $ne: 'cancelled' } })) {
    throw new ApiError(400, 'This purchase order already has purchase invoices against it, so it can no longer be changed.');
  }
  return po;
}

const poSnapshot = (po) => ({
  vendor: po.vendor, notes: po.notes, grandTotal: po.grandTotal, status: po.status,
  items: po.items.map((l) => ({ product: l.product, brand: l.brand, quantity: l.quantity, unitPrice: l.unitPrice, gstRate: l.gstRate, totalAmount: l.totalAmount })),
});

// Administrator edit: vendor, lines (quantity x rate recalculated) and notes.
export const updatePurchase = catchAsync(async (req, res) => {
  const po = await editablePurchase(req.params.id);
  const before = poSnapshot(po);
  const { vendor, items, notes } = req.body;
  if (vendor && String(vendor) !== String(po.vendor)) {
    const v = await purchasableVendor(vendor);
    po.vendor = vendor;
    if (po.status !== 'draft' && v.verificationStatus !== 'verified') { po.status = 'draft'; po.approvedBy = undefined; po.approvedAt = undefined; }
  }
  if (items !== undefined) {
    const built = await buildPurchaseItems(items);
    Object.assign(po, built);
    await rememberBrands(built.items);
  }
  if (notes !== undefined) po.notes = notes ? String(notes).slice(0, 500) : undefined;
  await po.save();
  await recordAudit({ req, action: 'purchase.update', entity: 'Purchase', entityId: po._id, oldValue: before, newValue: poSnapshot(po) });
  res.json({ success: true, data: po });
});

// Administrator cancel (the record stays for history; it is never deleted).
export const cancelPurchase = catchAsync(async (req, res) => {
  const po = await editablePurchase(req.params.id);
  const before = po.status;
  po.status = 'cancelled';
  await po.save();
  await recordAudit({ req, action: 'purchase.cancel', entity: 'Purchase', entityId: po._id, oldValue: { status: before }, newValue: { status: 'cancelled', reason: req.body?.reason } });
  res.json({ success: true, data: po, message: 'Purchase order cancelled.' });
});

// Product entry from the purchase screen: an existing product with the same name is re-used.
export const quickProduct = catchAsync(async (req, res) => {
  const { doc, created } = await findOrCreateProduct(req.body?.name, req.user._id);
  if (created) await recordAudit({ req, action: 'product.create', entity: 'Product', entityId: doc._id, newValue: { name: doc.name, sku: doc.sku, via: 'purchase entry' } });
  res.status(created ? 201 : 200).json({ success: true, data: doc, existing: !created });
});

// Brand entry from the purchase screen (find-or-create, case-insensitive). Optionally links it to a product.
export const quickBrand = catchAsync(async (req, res) => {
  const { doc, created } = await findOrCreateBrand(req.body?.name);
  if (req.body?.product && mongoose.isValidObjectId(req.body.product)) {
    await Product.updateOne({ _id: req.body.product }, { $addToSet: { brands: doc._id } });
  }
  if (created) await recordAudit({ req, action: 'brand.create', entity: 'Brand', entityId: doc._id, newValue: { name: doc.name, via: 'purchase entry' } });
  res.status(created ? 201 : 200).json({ success: true, data: doc, existing: !created });
});

const PO_SORTS = { date: 'createdAt', createdAt: 'createdAt', total: 'grandTotal', grandTotal: 'grandTotal', paid: 'amountPaid', poNumber: 'poNumber', status: 'status' };

const istStart = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00.000+05:30`);
const istEnd = (d) => new Date(`${String(d).slice(0, 10)}T23:59:59.999+05:30`);
const numOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// paid / partial / unpaid / not_billed - on what is billed (invoiced value, or the order value for old orders).
export function paymentStatusExpr(status) {
  const billed = BILLED_EXPR;
  const paid = { $ifNull: ['$amountPaid', 0] };
  switch (status) {
    case 'not_billed': return { $lte: [billed, 0] };
    case 'paid': return { $and: [{ $gt: [billed, 0] }, { $gte: [paid, { $subtract: [billed, 0.005] }] }] };
    case 'partial': return { $and: [{ $gt: [paid, 0] }, { $lt: [paid, { $subtract: [billed, 0.005] }] }] };
    case 'unpaid': return { $and: [{ $gt: [billed, 0] }, { $lte: [paid, 0] }] };
    default: throw new ApiError(400, 'Payment status must be paid, partial, unpaid or not_billed.');
  }
}

// Purchase Order filter from query parameters (shared with Purchase Analysis reports). All filters combine.
export async function purchaseListFilter(q = {}) {
  const filter = {};
  const and = [];
  if (q.status) filter.status = { $in: String(q.status).split(',').filter(Boolean) };
  // Real ObjectIds (not strings): this filter is also used in aggregations, which do not cast.
  const asId = (v, label) => new mongoose.Types.ObjectId(requireId(v, label));
  if (q.vendor) filter.vendor = asId(q.vendor, 'Vendor');
  if (q.user) filter.orderedBy = asId(q.user, 'User');
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = istStart(q.from);
    if (q.to) filter.createdAt.$lte = istEnd(q.to);
  }
  const minA = numOrNull(q.minAmount); const maxA = numOrNull(q.maxAmount);
  if (minA !== null || maxA !== null) {
    filter.grandTotal = {};
    if (minA !== null) filter.grandTotal.$gte = minA;
    if (maxA !== null) filter.grandTotal.$lte = maxA;
  }
  if (q.product) filter['items.product'] = asId(q.product, 'Product');
  if (q.brand) filter['items.brand'] = asId(q.brand, 'Brand');
  if (q.category) {
    const ids = await Product.find({ category: asId(q.category, 'Category') }).distinct('_id');
    and.push({ 'items.product': { $in: ids } });
  }
  if (q.paymentStatus) and.push({ $expr: paymentStatusExpr(String(q.paymentStatus)) });
  if (q.search) {
    const rx = literalRegex(q.search);
    const [vendorIds, productIds] = await Promise.all([
      Vendor.find({ name: rx }).distinct('_id'),
      Product.find({ name: rx }).distinct('_id'),
    ]);
    and.push({ $or: [{ poNumber: rx }, { invoiceNumber: rx }, { vendor: { $in: vendorIds } }, { 'items.product': { $in: productIds } }] });
  }
  if (and.length) filter.$and = and;
  return filter;
}

export const listPurchases = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = await purchaseListFilter(req.query);
  const sortKey = PO_SORTS[req.query.sort] || 'createdAt';
  const dir = req.query.order === 'asc' ? 1 : -1;
  const [docs, total, sums] = await Promise.all([
    Purchase.find(filter).populate('vendor', 'name verificationStatus').populate('orderedBy', 'name')
      .sort({ [sortKey]: dir, _id: dir }).skip(skip).limit(limit),
    Purchase.countDocuments(filter),
    Purchase.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$grandTotal' }, paid: { $sum: '$amountPaid' }, billed: { $sum: BILLED_EXPR } } }]),
  ]);
  const s = sums[0] || {};
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }), summary: { total: round2(s.total || 0), paid: round2(s.paid || 0), billed: round2(s.billed || 0) } });
});

export const getPurchase = catchAsync(async (req, res) => {
  const purchase = await Purchase.findById(req.params.id).populate('vendor store distributionCenter items.product')
    .populate('items.brand', 'name').populate('orderedBy', 'name').populate('approvedBy', 'name');
  if (!purchase) throw new ApiError(404, 'Purchase order not found.');
  const invoices = await PurchaseInvoice.find({ purchase: purchase._id })
    .select('invoiceNumber vendorInvoiceNumber invoiceDate grandTotal status createdAt').sort({ createdAt: 1 }).lean();
  res.json({ success: true, data: { ...purchase.toJSON(), invoices } });
});

// Goods are no longer received on the Purchase Order: PO -> Purchase Invoice -> Inward DC (stock comes in
// only when the Inward DC is submitted). The old endpoint stays so older screens get a clear message.
export const receiveGoods = catchAsync(async () => {
  throw new ApiError(400, 'Goods are received through DC Management > Inward DC, against a Purchase Invoice. Create the Purchase Invoice for this order first.');
});

// Approve a draft Purchase Order. Approval does not touch stock.
export const approvePurchase = catchAsync(async (req, res) => {
  const po = await Purchase.findById(req.params.id).select('vendor').lean();
  if (po) await assertVerifiedVendor(po.vendor, 'approve this purchase order');
  const updated = await Purchase.findOneAndUpdate(
    { _id: req.params.id, status: 'draft' },
    { $set: { status: 'approved', approvedBy: req.user._id, approvedAt: new Date() } },
    { new: true },
  );
  if (!updated) {
    const exists = await Purchase.exists({ _id: req.params.id });
    if (!exists) throw new ApiError(404, 'Purchase order not found.');
    throw new ApiError(400, 'Only a draft purchase order can be approved.');
  }
  await recordAudit({ req, action: 'purchase.approve', entity: 'Purchase', entityId: updated._id, newValue: { status: 'approved' } });
  res.json({ success: true, data: updated });
});

const VENDOR_PAY_METHODS = ['cash', 'bank_transfer', 'upi', 'card'];
// Unit fields copied from one document line to the next (PO -> invoice -> DC, invoice -> return -> DC).
export const lineUom = (l) => ({ unit: l.unit, baseUnit: l.baseUnit, baseFactor: l.baseFactor || 1, decimal: !!l.decimal });

// One supplier payment: a payment voucher (cash / bank book), the ledger pair (Payable Dr / Cash-Bank Cr).
async function vendorPaymentVoucher({ req, vendor, amount, method, referenceType, referenceId, referenceNumber }) {
  const voucherNumber = await generateDocNumber('paymentVoucher');
  const payment = await Payment.create({
    voucherNumber, direction: 'outgoing', purpose: 'vendor_payment', party: vendor, partyModel: 'Vendor',
    referenceType, referenceId, referenceNumber, method, amount, recordedBy: req.user._id,
  });
  await postLedgerPair({
    debitKey: 'payable', creditKey: methodToAccountKey(method), amount,
    narration: `Payment ${voucherNumber} for ${referenceNumber}`, referenceType, referenceId, userId: req.user._id,
  });
  return payment;
}

// Pays one Purchase Invoice (several part-payments allowed). Supplier outstanding on the bill =
// total - returns - paid; a payment can never exceed it. Keeps the order's paid amount in step.
export async function payInvoice(req, invoiceId, { amount, method, atEntry = false }) {
  oneOf(method, VENDOR_PAY_METHODS, 'Payment method');
  const value = round2(positive(amount, 'Payment amount'));
  const inv = await PurchaseInvoice.findById(invoiceId);
  if (!inv) throw new ApiError(404, 'Purchase invoice not found.');
  if (inv.status === 'cancelled') throw new ApiError(400, 'A cancelled purchase invoice cannot be paid.');
  await assertVerifiedVendor(inv.vendor, 'pay this vendor');
  const due = invoiceDue(inv);
  if (value > due + 0.001) throw new ApiError(400, `Payment of ₹${value} is more than the balance due of ₹${Math.max(0, due)} on ${inv.invoiceNumber}.`);
  const updated = await PurchaseInvoice.findOneAndUpdate(
    { _id: inv._id, amountPaid: inv.amountPaid || 0 },
    { $set: { amountPaid: round2((inv.amountPaid || 0) + value) } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'This bill was just updated by someone else. Refresh and try again.');
  await Purchase.updateOne({ _id: inv.purchase }, { $inc: { amountPaid: value } });
  const payment = await vendorPaymentVoucher({
    req, vendor: inv.vendor, amount: value, method, referenceType: 'PurchaseInvoice', referenceId: inv._id, referenceNumber: inv.invoiceNumber,
  });
  const done = await PurchaseInvoice.findByIdAndUpdate(inv._id, {
    $push: { payments: { amount: value, method, voucherNumber: payment.voucherNumber, payment: payment._id, paidBy: req.user._id, atEntry } },
  }, { new: true });
  await recordAudit({ req, action: 'purchase_invoice.pay', entity: 'PurchaseInvoice', entityId: inv._id, newValue: { amount: value, method, voucher: payment.voucherNumber, atEntry } });
  return done;
}

export const payPurchaseInvoice = catchAsync(async (req, res) => {
  requireId(req.params.id, 'Purchase invoice');
  const data = await payInvoice(req, req.params.id, { amount: req.body?.amount, method: req.body?.method || 'bank_transfer' });
  res.json({ success: true, data, due: invoiceDue(data) });
});

// Payment against a whole Purchase Order (Finance > Payables): spread over the order's invoices, oldest first.
export const payVendor = catchAsync(async (req, res) => {
  const { method = 'bank_transfer' } = req.body;
  oneOf(method, VENDOR_PAY_METHODS, 'Payment method');
  const amount = round2(positive(req.body.amount, 'Payment amount'));
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) throw new ApiError(404, 'Purchase order not found.');
  if (['draft', 'cancelled'].includes(purchase.status)) throw new ApiError(400, `A ${purchase.status} purchase order cannot be paid.`);
  await assertVerifiedVendor(purchase.vendor, 'pay this vendor');
  const balance = round2(billedAmount(purchase) - (purchase.amountPaid || 0));
  if (balance <= 0 && purchase.invoicedAmount === 0) throw new ApiError(400, 'Nothing has been invoiced on this purchase order yet. Create the Purchase Invoice first.');
  if (amount > balance + 0.001) throw new ApiError(400, `Payment of ₹${amount} is more than the balance due of ₹${Math.max(0, balance)}.`);

  // Conditional update so two simultaneous payments cannot together overpay the bill.
  const updated = await Purchase.findOneAndUpdate(
    { _id: purchase._id, amountPaid: purchase.amountPaid || 0 },
    { $set: { amountPaid: round2((purchase.amountPaid || 0) + amount) } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'This bill was just updated by someone else. Refresh and try again.');

  const payment = await vendorPaymentVoucher({
    req, vendor: purchase.vendor, amount, method, referenceType: 'Purchase', referenceId: purchase._id, referenceNumber: purchase.poNumber,
  });
  let left = amount;
  const invoices = await PurchaseInvoice.find({ purchase: purchase._id, status: { $ne: 'cancelled' } }).sort({ invoiceDate: 1, createdAt: 1 });
  for (const inv of invoices) {
    if (left <= 0.001) break;
    const take = round2(Math.min(left, Math.max(0, invoiceDue(inv))));
    if (take <= 0) continue;
    await PurchaseInvoice.updateOne({ _id: inv._id }, {
      $inc: { amountPaid: take },
      $push: { payments: { amount: take, method, voucherNumber: payment.voucherNumber, payment: payment._id, paidBy: req.user._id } },
    });
    left = round2(left - take);
  }
  await recordAudit({ req, action: 'purchase.pay', entity: 'Purchase', entityId: purchase._id, newValue: { amount, method, voucher: payment.voucherNumber } });
  res.json({ success: true, data: updated });
});

// ---------- Purchase Invoices ----------
// Raised against an approved Purchase Order; lines, quantities and rates come from the order. Partial
// invoicing is allowed. Billing more than was ordered needs `allowOverInvoice: true`. No stock moves here.

const INVOICEABLE = ['approved', 'ordered', 'partially_invoiced'];
const INVOICE_SORTS = { date: 'invoiceDate', total: 'grandTotal', invoiceNumber: 'invoiceNumber', status: 'status' };

export const createPurchaseInvoice = catchAsync(async (req, res) => {
  const { purchaseId, items, notes } = req.body;
  // Optional: paid now (cash purchase = paid in full; less = partly paid; nothing = credit purchase).
  const payNow = req.body.payNow && Number(req.body.payNow.amount) > 0 ? { amount: Number(req.body.payNow.amount), method: req.body.payNow.method || 'cash' } : null;
  if (payNow) oneOf(payNow.method, VENDOR_PAY_METHODS, 'Payment method');
  const allowOverInvoice = req.body.allowOverInvoice === true;
  const vendorInvoiceNumber = req.body.vendorInvoiceNumber ? String(req.body.vendorInvoiceNumber).trim().slice(0, 60) : undefined;
  const invoiceDate = req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date();
  if (Number.isNaN(invoiceDate.getTime())) throw new ApiError(400, 'Invoice date is not a valid date.');
  requireId(purchaseId, 'Purchase order');
  const po = await Purchase.findById(purchaseId);
  if (!po) throw new ApiError(404, 'Purchase order not found.');
  if (po.status === 'draft') throw new ApiError(400, 'Approve the purchase order before invoicing it.');
  await assertVerifiedVendor(po.vendor, 'enter a purchase invoice');
  if (po.status === 'cancelled') throw new ApiError(400, 'A cancelled purchase order cannot be invoiced.');
  if (!(INVOICEABLE.includes(po.status) || (po.status === 'invoiced' && allowOverInvoice && po.invoicedAmount !== undefined))) {
    throw new ApiError(400, po.status === 'invoiced' && po.invoicedAmount !== undefined
      ? 'This purchase order is fully invoiced. Tick "Allow invoicing beyond ordered quantity" to bill more.'
      : 'This purchase order was received or billed before purchase invoices were introduced and cannot be invoiced again.');
  }
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Enter the quantity to invoice for at least one item.');
  await requireFields('purchaseInvoice', { vendorInvoiceNumber, notes });
  if (vendorInvoiceNumber && await PurchaseInvoice.exists({ vendor: po.vendor, vendorInvoiceNumber, status: { $ne: 'cancelled' } })) {
    throw new ApiError(400, `Vendor invoice ${vendorInvoiceNumber} has already been entered for this vendor.`);
  }

  // Validate every line before writing anything.
  const seen = new Set();
  const lines = [];
  for (const it of items) {
    const line = findLine(po.items, it);
    if (!line) throw new ApiError(400, 'An invoiced item is not on this purchase order.');
    if (seen.has(lineKey(line))) throw new ApiError(400, 'An item appears twice on the invoice.');
    seen.add(lineKey(line));
    const quantity = round(positive(it.quantity, 'Invoice quantity', { integer: !line.decimal, max: 1000000 }), 3);
    const left = line.quantity - (line.invoicedQuantity || 0);
    if (quantity > left && !allowOverInvoice) {
      throw new ApiError(400, `Only ${Math.max(0, left)} more can be invoiced for this item (ordered ${line.quantity}, invoiced ${line.invoicedQuantity || 0}).`);
    }
    const clean = { product: line.product, brand: line.brand, quantity, unitPrice: line.unitPrice, gstRate: line.gstRate || 0, ...lineUom(line) };
    lines.push({
      ...clean, ...computeItemTotals(clean),
      batchNumber: line.batchNumber, manufacturingDate: line.manufacturingDate, expiryDate: line.expiryDate,
      receivedQuantity: 0, returnedQuantity: 0,
    });
  }
  const subtotal = round2(lines.reduce((s, i) => s + i.taxableAmount, 0));
  const taxAmount = round2(lines.reduce((s, i) => s + i.taxAmount, 0));
  const grandTotal = round2(subtotal + taxAmount);

  // Update the order's invoiced quantities only if nobody changed it since we read it (no double billing).
  const nextItems = po.items.map((l) => {
    const inv = lines.find((x) => lineKey(x) === lineKey(l));
    const o = l.toObject();
    return inv ? { ...o, invoicedQuantity: (o.invoicedQuantity || 0) + inv.quantity } : o;
  });
  const fully = nextItems.every((l) => (l.invoicedQuantity || 0) >= l.quantity);
  if (payNow && payNow.amount > grandTotal + 0.001) throw new ApiError(400, `Paid amount (₹${payNow.amount}) cannot be more than the invoice total (₹${grandTotal}).`);
  const invoiceNumber = await generateDocNumber('purchaseInvoice');
  const prev = { items: po.items.map((l) => l.toObject()), status: po.status, invoicedAmount: po.invoicedAmount || 0, invoiceNumber: po.invoiceNumber || '' };
  const claimed = await Purchase.findOneAndUpdate(
    { _id: po._id, __v: po.__v },
    {
      $set: {
        items: nextItems,
        status: fully ? 'invoiced' : 'partially_invoiced',
        invoicedAmount: round2((po.invoicedAmount || 0) + grandTotal),
        invoiceNumber: [po.invoiceNumber, vendorInvoiceNumber || invoiceNumber].filter(Boolean).join(', ').slice(0, 300),
      },
      $inc: { __v: 1 },
    },
    { new: true },
  );
  if (!claimed) throw new ApiError(409, 'This purchase order was just updated by someone else. Refresh and try again.');

  let invoice;
  try {
    invoice = await PurchaseInvoice.create({
      invoiceNumber, vendorInvoiceNumber, invoiceDate, purchase: po._id, poNumber: po.poNumber, vendor: po.vendor,
      items: lines, subtotal, taxAmount, grandTotal, allowOverInvoice, status: 'pending_receipt',
      notes: notes ? String(notes).slice(0, 500) : undefined, createdBy: req.user._id,
    });
  } catch (err) {
    await Purchase.updateOne({ _id: po._id }, { $set: prev, $inc: { __v: 1 } }); // put the order back
    throw err;
  }

  await postLedgerPair({
    debitKey: 'purchases', creditKey: 'payable', amount: grandTotal,
    narration: `Purchase invoice ${invoiceNumber} against ${po.poNumber}`, referenceType: 'PurchaseInvoice', referenceId: invoice._id, userId: req.user._id,
  });
  await recordAudit({ req, action: 'purchase_invoice.create', entity: 'PurchaseInvoice', entityId: invoice._id, newValue: { invoiceNumber, poNumber: po.poNumber, grandTotal, allowOverInvoice } });
  if (payNow) {
    invoice = await payInvoice(req, invoice._id, { ...payNow, atEntry: true });
  }
  res.status(201).json({ success: true, data: invoice, due: invoiceDue(invoice) });
});

export const listPurchaseInvoices = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.purchase) filter.purchase = requireId(req.query.purchase, 'Purchase order');
  // receivable: still has goods to come in on an Inward DC
  if (req.query.receivable === 'true') filter.status = { $in: ['pending_receipt', 'partially_received'] };
  // returnable: has received goods that are not yet returned
  if (req.query.returnable === 'true') {
    filter.status = { $ne: 'cancelled' };
    filter.$expr = { $gt: [{ $sum: '$items.receivedQuantity' }, { $sum: '$items.returnedQuantity' }] };
  }
  if (req.query.vendor) filter.vendor = requireId(req.query.vendor, 'Vendor');
  // Payment status on the bill: due = total - returns - paid.
  if (req.query.paymentStatus) {
    const due = { $subtract: [{ $subtract: ['$grandTotal', { $ifNull: ['$returnedAmount', 0] }] }, { $ifNull: ['$amountPaid', 0] }] };
    const paid = { $ifNull: ['$amountPaid', 0] };
    const expr = {
      paid: { $lte: [due, 0.005] },
      partial: { $and: [{ $gt: [due, 0.005] }, { $gt: [paid, 0] }] },
      unpaid: { $and: [{ $gt: [due, 0.005] }, { $lte: [paid, 0] }] },
    }[String(req.query.paymentStatus)];
    if (!expr) throw new ApiError(400, 'Payment status must be paid, partial or unpaid.');
    filter.$expr = filter.$expr ? { $and: [filter.$expr, expr] } : expr;
  }
  if (req.query.method) filter['payments.method'] = oneOf(req.query.method, VENDOR_PAY_METHODS, 'Payment method');
  if (req.query.product) filter['items.product'] = requireId(req.query.product, 'Product');
  if (req.query.brand) filter['items.brand'] = requireId(req.query.brand, 'Brand');
  if (req.query.user) filter.createdBy = requireId(req.query.user, 'User');
  if (req.query.from || req.query.to) {
    filter.invoiceDate = {};
    if (req.query.from) filter.invoiceDate.$gte = new Date(`${String(req.query.from).slice(0, 10)}T00:00:00.000+05:30`);
    if (req.query.to) filter.invoiceDate.$lte = new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999+05:30`);
  }
  if (req.query.minAmount || req.query.maxAmount) {
    filter.grandTotal = {};
    if (req.query.minAmount) filter.grandTotal.$gte = Number(req.query.minAmount);
    if (req.query.maxAmount) filter.grandTotal.$lte = Number(req.query.maxAmount);
  }
  if (req.query.search) {
    const rx = literalRegex(req.query.search);
    const vendorIds = await Vendor.find({ name: rx }).distinct('_id');
    filter.$or = [{ invoiceNumber: rx }, { vendorInvoiceNumber: rx }, { poNumber: rx }, { vendor: { $in: vendorIds } }];
  }
  const [docs, total] = await Promise.all([
    PurchaseInvoice.find(filter).populate('vendor', 'name verificationStatus').populate('items.product', 'name sku').populate('items.brand', 'name').sort({ [INVOICE_SORTS[req.query.sort] || 'createdAt']: req.query.order === 'asc' ? 1 : -1 }).skip(skip).limit(limit),
    PurchaseInvoice.countDocuments(filter),
  ]);
  const rows = docs.map((d) => ({ ...d.toJSON(), due: invoiceDue(d) }));
  res.json({ success: true, ...buildPaginatedResponse({ docs: rows, total, page, limit }) });
});

// One invoice with its document trail: order, inward DCs and returns.
export const getPurchaseInvoice = catchAsync(async (req, res) => {
  const invoice = await PurchaseInvoice.findById(req.params.id).populate('vendor', 'name gstin verificationStatus').populate('items.product', 'name sku unit').populate('items.brand', 'name').populate('purchase', 'poNumber status grandTotal').populate('createdBy', 'name');
  if (!invoice) throw new ApiError(404, 'Purchase invoice not found.');
  const [inwardDCs, returns] = await Promise.all([
    InwardDC.find({ purchaseInvoice: invoice._id }).select('docNumber status items createdAt submittedAt').sort({ createdAt: 1 }).lean(),
    PurchaseReturn.find({ purchaseInvoice: invoice._id }).select('returnNumber status totalAmount items createdAt').sort({ createdAt: 1 }).lean(),
  ]);
  res.json({ success: true, data: { ...invoice.toJSON(), due: invoiceDue(invoice), inwardDCs, returns } });
});

// ---------- Purchase Returns ----------
// Raised against the original Purchase Invoice, for goods that came in on its Inward DCs. A return is a
// debit note only: stock leaves when an Outward DC against the return is submitted.

export const createPurchaseReturn = catchAsync(async (req, res) => {
  const { purchaseInvoiceId, items } = req.body;
  if (!purchaseInvoiceId) throw new ApiError(400, 'Select the purchase invoice the goods are being returned against.');
  requireId(purchaseInvoiceId, 'Purchase invoice');
  const invoice = await PurchaseInvoice.findById(purchaseInvoiceId);
  if (!invoice) throw new ApiError(404, 'Purchase invoice not found.');
  if (invoice.status === 'cancelled') throw new ApiError(400, 'A cancelled purchase invoice cannot be returned against.');
  await assertVerifiedVendor(invoice.vendor, 'create a purchase return');
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Select at least one item to return.');

  const seen = new Set();
  const clean = [];
  for (const item of items) {
    const line = findLine(invoice.items, item);
    if (!line) throw new ApiError(400, 'A returned item is not on this purchase invoice.');
    if (seen.has(lineKey(line))) throw new ApiError(400, 'An item appears twice on the return.');
    seen.add(lineKey(line));
    const quantity = round(positive(item.quantity, 'Return quantity', { integer: !line.decimal }), 3);
    const left = (line.receivedQuantity || 0) - (line.returnedQuantity || 0);
    if (quantity > left) throw new ApiError(400, `Only ${left} of this item can be returned (received on Inward DC minus earlier returns).`);
    await requireFields('purchaseReturn', { reason: item.reason });
    clean.push({ line, quantity, reason: item.reason ? String(item.reason).slice(0, 200) : undefined });
  }

  // Book the returned quantities on the invoice only if it is unchanged since we read it.
  const nextItems = invoice.items.map((l) => {
    const r = clean.find((c) => lineKey(c.line) === lineKey(l));
    const o = l.toObject();
    return r ? { ...o, returnedQuantity: (o.returnedQuantity || 0) + r.quantity } : o;
  });
  const claimed = await PurchaseInvoice.findOneAndUpdate(
    { _id: invoice._id, __v: invoice.__v },
    { $set: { items: nextItems }, $inc: { __v: 1 } },
    { new: true },
  );
  if (!claimed) throw new ApiError(409, 'This purchase invoice was just updated by someone else. Refresh and try again.');

  // Returned value includes the GST charged on the bill.
  const totalAmount = round2(clean.reduce((s, c) => s + c.line.unitPrice * c.quantity * (1 + (c.line.gstRate || 0) / 100), 0));
  let purchaseReturn;
  try {
    const returnNumber = await generateDocNumber('purchaseReturn');
    purchaseReturn = await PurchaseReturn.create({
      returnNumber, purchase: invoice.purchase, purchaseInvoice: invoice._id, invoiceNumber: invoice.invoiceNumber, vendor: invoice.vendor,
      items: clean.map((c) => ({ product: c.line.product, brand: c.line.brand, ...lineUom(c.line), quantity: c.quantity, unitPrice: c.line.unitPrice, reason: c.reason, dispatchedQuantity: 0 })),
      totalAmount, processedBy: req.user._id, status: 'pending_dispatch',
    });
  } catch (err) {
    await PurchaseInvoice.updateOne({ _id: invoice._id }, { $set: { items: invoice.items.map((l) => l.toObject()) }, $inc: { __v: 1 } });
    throw err;
  }

  await postLedgerPair({
    debitKey: 'payable', creditKey: 'purchases', amount: totalAmount,
    narration: `Return against ${invoice.invoiceNumber} (${invoice.poNumber})`, referenceType: 'PurchaseReturn', referenceId: purchaseReturn._id, userId: req.user._id,
  });
  await recordAudit({ req, action: 'purchase_return.create', entity: 'PurchaseReturn', entityId: purchaseReturn._id, newValue: { returnNumber: purchaseReturn.returnNumber, invoiceNumber: invoice.invoiceNumber, totalAmount } });
  await Promise.all([
    Purchase.updateOne({ _id: invoice.purchase }, { $inc: { returnedAmount: totalAmount } }),
    PurchaseInvoice.updateOne({ _id: invoice._id }, { $inc: { returnedAmount: totalAmount } }),
  ]);
  res.status(201).json({ success: true, data: purchaseReturn });
});

export const listPurchaseReturns = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  // dispatchable: still has goods to send back on an Outward DC
  if (req.query.dispatchable === 'true') filter.status = { $in: ['pending_dispatch', 'partially_dispatched'] };
  if (req.query.search) {
    const rx = literalRegex(req.query.search);
    filter.$or = [{ returnNumber: rx }, { invoiceNumber: rx }];
  }
  const [docs, total] = await Promise.all([
    PurchaseReturn.find(filter).populate('purchase', 'poNumber').populate('purchaseInvoice', 'invoiceNumber vendorInvoiceNumber').populate('vendor', 'name verificationStatus').populate('items.product', 'name sku').populate('items.brand', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    PurchaseReturn.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getPurchaseReturn = catchAsync(async (req, res) => {
  const doc = await PurchaseReturn.findById(req.params.id).populate('purchase', 'poNumber').populate('purchaseInvoice', 'invoiceNumber vendorInvoiceNumber').populate('vendor', 'name verificationStatus').populate('items.product', 'name sku').populate('items.brand', 'name');
  if (!doc) throw new ApiError(404, 'Purchase return not found.');
  const outwardDCs = await OutwardDC.find({ purchaseReturn: doc._id }).select('docNumber status items createdAt dispatchedAt').sort({ createdAt: 1 }).lean();
  res.json({ success: true, data: { ...doc.toJSON(), outwardDCs } });
});

export default {
  createPurchase, listPurchases, getPurchase, approvePurchase, receiveGoods, payVendor,
  updatePurchase, cancelPurchase, quickProduct, quickBrand,
  createPurchaseInvoice, listPurchaseInvoices, getPurchaseInvoice, payPurchaseInvoice,
  createPurchaseReturn, listPurchaseReturns, getPurchaseReturn,
};
