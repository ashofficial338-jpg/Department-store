import InwardDC from '../models/InwardDC.js';
import OutwardDC from '../models/OutwardDC.js';
import Inventory from '../models/Inventory.js';
import Purchase from '../models/Purchase.js';
import PurchaseInvoice from '../models/PurchaseInvoice.js';
import PurchaseReturn from '../models/PurchaseReturn.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { requireId, number } from '../utils/validate.js';
import { applyStockDelta, recordInventoryTransaction } from './inventoryController.js';
import { assertActiveStore, assertActiveDC, mainStoreId } from '../utils/storeGuard.js';
import { assertVerifiedVendor } from '../utils/vendorGuard.js';

// Stock rule: Purchase Orders, Purchase Invoices and Purchase Returns never move stock. Stock goes UP only
// when an Inward DC (against a Purchase Invoice) is submitted, and DOWN only when an Outward DC (against a
// Purchase Return) is submitted. Each DC books its stock once: `stockPosted` is claimed atomically first.

const optionalDate = (v, label) => {
  if (v === undefined || v === null || v === '') return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `${label} is not a valid date.`);
  return d;
};

// ---------- Inward DC ----------

export const createInwardDC = catchAsync(async (req, res) => {
  const { purchaseInvoice: invoiceId, distributionCenter, items, notes } = req.body;
  if (!invoiceId) throw new ApiError(400, 'Select the Purchase Invoice this delivery is against.');
  requireId(invoiceId, 'Purchase invoice');
  if (distributionCenter) await assertActiveDC(distributionCenter); // optional: single department store
  const invoice = await PurchaseInvoice.findById(invoiceId);
  if (!invoice) throw new ApiError(404, 'Purchase invoice not found.');
  if (invoice.status === 'cancelled') throw new ApiError(400, 'This purchase invoice is cancelled.');
  if (invoice.status === 'received') throw new ApiError(400, 'All goods on this purchase invoice have already been received.');
  await assertVerifiedVendor(invoice.vendor, 'receive goods (Inward DC)');

  // Default: every invoice line still to come in. A partial delivery can name the lines and quantities.
  const wanted = Array.isArray(items) && items.length
    ? items
    : invoice.items.map((l) => ({ product: l.product, expectedQuantity: l.quantity - (l.receivedQuantity || 0) })).filter((l) => l.expectedQuantity > 0);
  const seen = new Set();
  const lines = [];
  for (const it of wanted) {
    const line = invoice.items.find((l) => String(l.product) === String(it?.product));
    if (!line) throw new ApiError(400, 'An item on this DC is not on the purchase invoice.');
    if (seen.has(String(line.product))) throw new ApiError(400, 'An item appears twice on the DC.');
    seen.add(String(line.product));
    const left = line.quantity - (line.receivedQuantity || 0);
    const expectedQuantity = number(it.expectedQuantity, 'Expected quantity', { min: 0, integer: true, exclusiveMin: true });
    if (expectedQuantity > left) throw new ApiError(400, `Only ${left} of this item is still to be received on the invoice (invoiced ${line.quantity}).`);
    lines.push({
      product: line.product, expectedQuantity, receivedQuantity: 0, unitPrice: line.unitPrice,
      batchNumber: it.batchNumber || line.batchNumber, manufacturingDate: line.manufacturingDate,
      expiryDate: optionalDate(it.expiryDate, 'Expiry date') || line.expiryDate,
    });
  }
  if (!lines.length) throw new ApiError(400, 'Nothing is left to receive on this purchase invoice.');

  const docNumber = await generateDocNumber('inwardDC');
  const doc = await InwardDC.create({
    docNumber, distributionCenter, sourceType: 'PurchaseInvoice', sourceReference: invoice._id,
    purchaseInvoice: invoice._id, invoiceNumber: invoice.invoiceNumber, purchase: invoice.purchase, poNumber: invoice.poNumber,
    vendor: invoice.vendor, items: lines, notes: notes ? String(notes).slice(0, 500) : undefined, status: 'pending',
  });
  await recordAudit({ req, action: 'dc.inward_create', entity: 'InwardDC', entityId: doc._id, newValue: { docNumber, invoiceNumber: invoice.invoiceNumber } });
  res.status(201).json({ success: true, data: doc });
});

export const listInwardDC = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.distributionCenter) filter.distributionCenter = req.query.distributionCenter;
  if (req.query.purchaseInvoice) filter.purchaseInvoice = requireId(req.query.purchaseInvoice, 'Purchase invoice');
  const [docs, total] = await Promise.all([
    InwardDC.find(filter).populate('distributionCenter', 'name code').populate('vendor', 'name verificationStatus').populate('items.product', 'name sku').sort({ createdAt: -1 }).skip(skip).limit(limit),
    InwardDC.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getInwardDC = catchAsync(async (req, res) => {
  const doc = await InwardDC.findById(req.params.id).populate('distributionCenter vendor items.product items.batch');
  if (!doc) throw new ApiError(404, 'Inward DC document not found.');
  res.json({ success: true, data: doc });
});

// Submit the Inward DC: record what actually arrived (and passed checks). This is the ONLY step that adds
// purchased stock, and it can run once per document.
export const processInwardDC = catchAsync(async (req, res) => {
  const { items = [], decision } = req.body; // items: [{ product, receivedQuantity, qualityCheckPassed, rejectReason, batchNumber, expiryDate }]
  const doc = await InwardDC.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Inward DC document not found.');
  if (doc.stockPosted || !['draft', 'pending'].includes(doc.status)) throw new ApiError(400, 'This inward DC has already been submitted.');
  if (!Array.isArray(items)) throw new ApiError(400, 'Enter the received quantities.');
  const reject = decision === 'reject';

  // Validate every line first.
  const accepted = []; // { line, qty }
  for (const incoming of items) {
    const line = doc.items.find((l) => String(l.product) === String(incoming?.product));
    if (!line) throw new ApiError(400, 'A received item is not on this inward DC.');
    const qty = number(incoming.receivedQuantity ?? 0, 'Received quantity', { min: 0, integer: true });
    if (qty > line.expectedQuantity) throw new ApiError(400, `Received quantity (${qty}) cannot be more than expected (${line.expectedQuantity}).`);
    line.receivedQuantity = qty;
    line.qualityCheckPassed = incoming.qualityCheckPassed !== false;
    line.rejectReason = incoming.rejectReason ? String(incoming.rejectReason).slice(0, 200) : '';
    if (incoming.batchNumber) line.batchNumber = String(incoming.batchNumber).trim().slice(0, 60);
    const exp = optionalDate(incoming.expiryDate, 'Expiry date');
    if (exp) line.expiryDate = exp;
    if (!reject && line.qualityCheckPassed && qty > 0) accepted.push({ line, qty });
  }

  let invoice = null;
  if (doc.purchaseInvoice && accepted.length) {
    invoice = await PurchaseInvoice.findById(doc.purchaseInvoice);
    if (!invoice || invoice.status === 'cancelled') throw new ApiError(400, 'The purchase invoice for this DC is missing or cancelled.');
    for (const { line, qty } of accepted) {
      const il = invoice.items.find((l) => String(l.product) === String(line.product));
      const left = il ? il.quantity - (il.receivedQuantity || 0) : 0;
      if (qty > left) throw new ApiError(400, `Only ${left} of an item is still due on invoice ${invoice.invoiceNumber} - another DC has already received the rest.`);
    }
  }

  // Claim the document: from here on no second submit can book this stock again.
  const claimed = await InwardDC.findOneAndUpdate(
    { _id: doc._id, stockPosted: { $ne: true }, status: { $in: ['draft', 'pending'] } },
    { $set: { stockPosted: true } },
    { new: true },
  );
  if (!claimed) throw new ApiError(409, 'This inward DC has just been submitted by someone else.');

  // Book the received quantities on the invoice (only if it is unchanged since we checked it).
  if (invoice) {
    const nextItems = invoice.items.map((l) => {
      const a = accepted.find((x) => String(x.line.product) === String(l.product));
      const o = l.toObject();
      return a ? { ...o, receivedQuantity: (o.receivedQuantity || 0) + a.qty } : o;
    });
    const all = nextItems.every((l) => (l.receivedQuantity || 0) >= l.quantity);
    const any = nextItems.some((l) => (l.receivedQuantity || 0) > 0);
    const ok = await PurchaseInvoice.findOneAndUpdate(
      { _id: invoice._id, __v: invoice.__v },
      { $set: { items: nextItems, status: all ? 'received' : (any ? 'partially_received' : 'pending_receipt') }, $inc: { __v: 1 } },
    );
    if (!ok) {
      await InwardDC.updateOne({ _id: doc._id }, { $set: { stockPosted: false } });
      throw new ApiError(409, 'The purchase invoice was just updated by someone else. Refresh and submit again.');
    }
  }

  const central = await mainStoreId();
  for (const { line, qty } of accepted) {
    let batchId;
    if (doc.purchaseInvoice) {
      const product = await Product.findById(line.product).select('sku sellingPrice purchasePrice').lean();
      const batch = await Batch.create({
        batchNumber: line.batchNumber || `${doc.docNumber}-${product?.sku || ''}`,
        product: line.product, supplier: doc.vendor, purchaseInvoice: doc.purchase,
        manufacturingDate: line.manufacturingDate, expiryDate: line.expiryDate,
        purchasePrice: line.unitPrice ?? product?.purchasePrice ?? 0, sellingPrice: product?.sellingPrice ?? 0,
        quantity: qty, availableQuantity: qty, store: central,
      });
      batchId = batch._id;
      line.batch = batch._id;
      if (doc.purchase) await Purchase.updateOne({ _id: doc.purchase, 'items.product': line.product }, { $inc: { 'items.$.receivedQuantity': qty } });
    }
    await applyStockDelta({ product: line.product, delta: qty });
    await recordInventoryTransaction({
      product: line.product, batch: batchId, quantity: qty, type: 'inward_dc',
      destination: central, destinationModel: 'Store',
      referenceType: 'InwardDC', referenceId: doc._id, referenceNumber: doc.docNumber,
      notes: doc.invoiceNumber ? `Against ${doc.invoiceNumber} / ${doc.poNumber}` : undefined, user: req.user._id,
    });
  }

  const allReceived = doc.items.every((l) => l.qualityCheckPassed !== false && (l.receivedQuantity || 0) >= l.expectedQuantity);
  doc.status = reject || !accepted.length ? 'rejected' : (allReceived ? 'completed' : 'partially_received');
  doc.stockPosted = true;
  doc.submittedAt = new Date();
  doc.receivedBy = req.user._id;
  await doc.save();

  await recordAudit({ req, action: 'dc.inward_process', entity: 'InwardDC', entityId: doc._id, newValue: { status: doc.status, units: accepted.reduce((s, a) => s + a.qty, 0) } });
  res.json({ success: true, data: doc });
});

// ---------- Outward DC ----------

export const createOutwardDC = catchAsync(async (req, res) => {
  const { purchaseReturn: returnId, sourceDC, destinationType, destination, items, transportDetails, responsibleEmployee, notes } = req.body;
  if (!returnId) throw new ApiError(400, 'Select the Purchase Return these goods are being sent back against.');
  requireId(returnId, 'Purchase return');
  if (sourceDC) await assertActiveDC(sourceDC, 'Source distribution center');
  if (destination && destinationType === 'Store') await assertActiveStore(destination, 'Destination store');
  if (destination && destinationType === 'DistributionCenter') await assertActiveDC(destination, 'Destination distribution center');
  const ret = await PurchaseReturn.findById(returnId);
  if (!ret) throw new ApiError(404, 'Purchase return not found.');
  if (!['pending_dispatch', 'partially_dispatched'].includes(ret.status)) {
    throw new ApiError(400, ret.status === 'dispatched' ? 'Everything on this purchase return has already been dispatched.' : 'This purchase return was completed before Outward DCs were introduced.');
  }

  const wanted = Array.isArray(items) && items.length
    ? items
    : ret.items.map((l) => ({ product: l.product, quantity: l.quantity - (l.dispatchedQuantity || 0) })).filter((l) => l.quantity > 0);
  const seen = new Set();
  const lines = [];
  for (const it of wanted) {
    const line = ret.items.find((l) => String(l.product) === String(it?.product));
    if (!line) throw new ApiError(400, 'An item on this DC is not on the purchase return.');
    if (seen.has(String(line.product))) throw new ApiError(400, 'An item appears twice on the DC.');
    seen.add(String(line.product));
    const left = line.quantity - (line.dispatchedQuantity || 0);
    const quantity = number(it.quantity, 'Quantity', { min: 0, integer: true, exclusiveMin: true });
    if (quantity > left) throw new ApiError(400, `Only ${left} of this item is still to be sent back on the return (returned ${line.quantity}).`);
    lines.push({ product: line.product, quantity });
  }
  if (!lines.length) throw new ApiError(400, 'Nothing is left to dispatch on this purchase return.');

  const docNumber = await generateDocNumber('outwardDC');
  const doc = await OutwardDC.create({
    docNumber, sourceType: 'PurchaseReturn', purchaseReturn: ret._id, returnNumber: ret.returnNumber, vendor: ret.vendor,
    sourceDC: sourceDC || undefined, destinationType: destination ? destinationType : undefined, destination: destination || undefined,
    items: lines, transportDetails, responsibleEmployee, notes: notes ? String(notes).slice(0, 500) : undefined, status: 'draft',
  });
  await recordAudit({ req, action: 'dc.outward_create', entity: 'OutwardDC', entityId: doc._id, newValue: { docNumber, returnNumber: ret.returnNumber } });
  res.status(201).json({ success: true, data: doc });
});

export const listOutwardDC = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.sourceDC) filter.sourceDC = req.query.sourceDC;
  if (req.query.purchaseReturn) filter.purchaseReturn = requireId(req.query.purchaseReturn, 'Purchase return');
  const [docs, total] = await Promise.all([
    OutwardDC.find(filter).populate('sourceDC', 'name code').populate('vendor', 'name verificationStatus').populate('items.product', 'name sku').sort({ createdAt: -1 }).skip(skip).limit(limit),
    OutwardDC.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getOutwardDC = catchAsync(async (req, res) => {
  const doc = await OutwardDC.findById(req.params.id).populate('sourceDC destination items.product items.batch approvedBy responsibleEmployee');
  if (!doc) throw new ApiError(404, 'Outward DC document not found.');
  res.json({ success: true, data: doc });
});

// Take `qty` of a product out of central stock, never below zero. Returns false when there is not enough.
async function takeStock(product, qty) {
  const central = await mainStoreId();
  const inv = await Inventory.findOneAndUpdate({ product, store: central, currentStock: { $gte: qty } }, { $inc: { currentStock: -qty } }, { new: true });
  return !!inv;
}

// Reduce the batches this order brought in (oldest expiry first), so expiry tracking stays right.
async function takeFromBatches(product, purchase, qty) {
  let left = qty;
  const batches = await Batch.find({ product, ...(purchase ? { purchaseInvoice: purchase } : {}), availableQuantity: { $gt: 0 } }).sort({ expiryDate: 1, createdAt: 1 }).select('_id availableQuantity').lean();
  let first;
  for (const b of batches) {
    if (left <= 0) break;
    const take = Math.min(left, b.availableQuantity);
    const r = await Batch.updateOne({ _id: b._id, availableQuantity: { $gte: take } }, { $inc: { availableQuantity: -take } });
    if (r.modifiedCount) { left -= take; first = first || b._id; }
  }
  return first;
}

// Submit the Outward DC for a Purchase Return: record what was actually dispatched. This is the ONLY step
// that takes returned stock out, and it can run once per document.
export const submitOutwardDC = catchAsync(async (req, res) => {
  const { items = [] } = req.body; // [{ product, dispatchedQuantity }]
  const doc = await OutwardDC.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Outward DC document not found.');
  if (!doc.purchaseReturn) throw new ApiError(400, 'This outward DC is not linked to a purchase return - use its status buttons.');
  if (doc.stockPosted || ['dispatched', 'received', 'cancelled'].includes(doc.status)) throw new ApiError(400, 'This outward DC has already been submitted or cancelled.');

  const ret = await PurchaseReturn.findById(doc.purchaseReturn);
  if (!ret) throw new ApiError(400, 'The purchase return for this DC was not found.');
  const central = await mainStoreId();
  const qtyFor = new Map(items.map((i) => [String(i?.product), i?.dispatchedQuantity]));
  const moves = [];
  for (const line of doc.items) {
    const raw = qtyFor.has(String(line.product)) ? qtyFor.get(String(line.product)) : line.quantity;
    const qty = number(raw ?? 0, 'Dispatched quantity', { min: 0, integer: true });
    if (qty > line.quantity) throw new ApiError(400, `Dispatched quantity (${qty}) cannot be more than planned (${line.quantity}).`);
    const rl = ret.items.find((l) => String(l.product) === String(line.product));
    const left = rl ? rl.quantity - (rl.dispatchedQuantity || 0) : 0;
    if (qty > left) throw new ApiError(400, `Only ${left} of an item is still to be sent back on return ${ret.returnNumber}.`);
    if (qty > 0) {
      const have = (await Inventory.findOne({ product: line.product, store: central }).select('currentStock').lean())?.currentStock || 0;
      if (have < qty) throw new ApiError(400, `Not enough stock to dispatch ${qty} of an item - only ${have} on hand.`);
    }
    line.dispatchedQuantity = qty;
    if (qty > 0) moves.push({ line, qty });
  }
  if (!moves.length) throw new ApiError(400, 'Enter the quantity dispatched for at least one item.');

  const claimed = await OutwardDC.findOneAndUpdate(
    { _id: doc._id, stockPosted: { $ne: true }, status: { $nin: ['dispatched', 'received', 'cancelled'] } },
    { $set: { stockPosted: true } },
  );
  if (!claimed) throw new ApiError(409, 'This outward DC has just been submitted by someone else.');

  // Book dispatched quantities on the return (only if unchanged since we checked it).
  const nextItems = ret.items.map((l) => {
    const m = moves.find((x) => String(x.line.product) === String(l.product));
    const o = l.toObject();
    return m ? { ...o, dispatchedQuantity: (o.dispatchedQuantity || 0) + m.qty } : o;
  });
  const all = nextItems.every((l) => (l.dispatchedQuantity || 0) >= l.quantity);
  const okRet = await PurchaseReturn.findOneAndUpdate(
    { _id: ret._id, __v: ret.__v },
    { $set: { items: nextItems, status: all ? 'dispatched' : 'partially_dispatched' }, $inc: { __v: 1 } },
  );
  if (!okRet) {
    await OutwardDC.updateOne({ _id: doc._id }, { $set: { stockPosted: false } });
    throw new ApiError(409, 'The purchase return was just updated by someone else. Refresh and submit again.');
  }

  // Take the stock out; if a line runs short (stock sold meanwhile) undo everything done so far.
  const done = [];
  for (const m of moves) {
    if (!(await takeStock(m.line.product, m.qty))) {
      for (const d of done) await applyStockDelta({ product: d.line.product, delta: d.qty });
      await PurchaseReturn.updateOne({ _id: ret._id }, { $set: { items: ret.items.map((l) => l.toObject()), status: ret.status }, $inc: { __v: 1 } });
      await OutwardDC.updateOne({ _id: doc._id }, { $set: { stockPosted: false } });
      throw new ApiError(400, 'Stock changed while dispatching - not enough left for one item. Nothing was dispatched; check the stock and try again.');
    }
    done.push(m);
  }
  for (const m of moves) {
    const batch = await takeFromBatches(m.line.product, ret.purchase, m.qty);
    if (batch) m.line.batch = batch;
    await recordInventoryTransaction({
      product: m.line.product, batch, quantity: -m.qty, type: 'outward_dc',
      source: central, sourceModel: 'Store',
      referenceType: 'OutwardDC', referenceId: doc._id, referenceNumber: doc.docNumber,
      notes: `Purchase return ${ret.returnNumber}${ret.invoiceNumber ? ` (${ret.invoiceNumber})` : ''}`, user: req.user._id,
    });
  }

  doc.status = 'dispatched';
  doc.stockPosted = true;
  doc.dispatchedAt = new Date();
  doc.approvedBy = doc.approvedBy || req.user._id;
  await doc.save();
  await recordAudit({ req, action: 'dc.outward_submit', entity: 'OutwardDC', entityId: doc._id, newValue: { status: doc.status, units: moves.reduce((s, m) => s + m.qty, 0) } });
  res.json({ success: true, data: doc });
});

const OUTWARD_TRANSITIONS = {
  draft: 'approved',
  approved: 'picking',
  picking: 'packed',
  packed: 'dispatched',
  dispatched: 'received',
};

// Status steps for outward DCs. A purchase-return DC moves stock only through submitOutwardDC; it can still
// be approved / picked / packed before that. Older manual DCs keep their dispatch step, booked once.
export const advanceOutwardDC = catchAsync(async (req, res) => {
  const doc = await OutwardDC.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Outward DC document not found.');

  const next = OUTWARD_TRANSITIONS[doc.status];
  if (!next) throw new ApiError(400, `Outward DC in status "${doc.status}" cannot be advanced further.`);
  if (doc.purchaseReturn && (next === 'dispatched' || next === 'received')) {
    throw new ApiError(400, next === 'dispatched' ? 'Submit the dispatch with the quantities actually sent.' : 'Goods returned to the vendor are not received back.');
  }

  // Claim the transition so two clicks cannot both run it (and dispatch stock twice).
  const claim = { $set: { status: next } };
  if (next === 'dispatched') claim.$set.stockPosted = true;
  const claimed = await OutwardDC.findOneAndUpdate({ _id: doc._id, status: doc.status, ...(next === 'dispatched' ? { stockPosted: { $ne: true } } : {}) }, claim);
  if (!claimed) throw new ApiError(409, 'This outward DC was just updated by someone else. Refresh and try again.');

  if (next === 'approved') doc.approvedBy = req.user._id;
  if (next === 'dispatched') {
    doc.dispatchedAt = new Date();
    doc.stockPosted = true;
    for (const item of doc.items) {
      await applyStockDelta({ product: item.product, distributionCenter: doc.sourceDC, delta: -item.quantity });
      await recordInventoryTransaction({
        product: item.product, batch: item.batch, quantity: -item.quantity, type: 'outward_dc',
        source: doc.sourceDC, sourceModel: 'DistributionCenter',
        destination: doc.destination, destinationModel: doc.destinationType,
        referenceType: 'OutwardDC', referenceId: doc._id, referenceNumber: doc.docNumber, user: req.user._id,
      });
    }
  }
  if (next === 'received') {
    doc.receivedAt = new Date();
    // Without a destination the goods have left the store for good; only a named destination gets them back.
    if (doc.destination) for (const item of doc.items) {
      await applyStockDelta({ product: item.product, delta: item.quantity });
    }
  }

  doc.status = next;
  await doc.save();
  await recordAudit({ req, action: 'dc.outward_advance', entity: 'OutwardDC', entityId: doc._id, newValue: { status: doc.status } });
  res.json({ success: true, data: doc });
});

export const cancelOutwardDC = catchAsync(async (req, res) => {
  const doc = await OutwardDC.findOneAndUpdate(
    { _id: req.params.id, stockPosted: { $ne: true }, status: { $nin: ['dispatched', 'received', 'cancelled'] } },
    { $set: { status: 'cancelled' } },
    { new: true },
  );
  if (!doc) {
    if (!(await OutwardDC.exists({ _id: req.params.id }))) throw new ApiError(404, 'Outward DC document not found.');
    throw new ApiError(400, 'Cannot cancel an outward DC that has already dispatched.');
  }
  res.json({ success: true, data: doc });
});

// DC-wise stock + performance summary
export const dcWiseStock = catchAsync(async (req, res) => {
  const { id } = req.params;
  const filter = id ? { distributionCenter: id } : { distributionCenter: { $ne: null } };
  const rows = await Inventory.find(filter).populate('product', 'name sku unit sellingPrice').populate('distributionCenter', 'name code');
  res.json({ success: true, data: rows });
});

export default {
  createInwardDC, listInwardDC, getInwardDC, processInwardDC,
  createOutwardDC, listOutwardDC, getOutwardDC, submitOutwardDC, advanceOutwardDC, cancelOutwardDC,
  dcWiseStock,
};
