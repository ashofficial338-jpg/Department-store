import Purchase from '../models/Purchase.js';
import PurchaseReturn from '../models/PurchaseReturn.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { round2 } from '../utils/gstCalculator.js';
import { postLedgerPair } from '../utils/ledger.js';
import { literalRegex, requireId, positive, number, oneOf } from '../utils/validate.js';
import Vendor from '../models/Vendor.js';
import PurchaseInvoice from '../models/PurchaseInvoice.js';
import InwardDC from '../models/InwardDC.js';
import OutwardDC from '../models/OutwardDC.js';
import { billedAmount } from '../utils/payables.js';
import { assertVerifiedVendor } from '../utils/vendorGuard.js';
import { mainStoreId } from '../utils/storeGuard.js';

function computeItemTotals(item) {
  const taxableAmount = round2(item.quantity * item.unitPrice);
  const taxAmount = round2((taxableAmount * (item.gstRate || 0)) / 100);
  return { taxableAmount, taxAmount, totalAmount: round2(taxableAmount + taxAmount) };
}

export const createPurchase = catchAsync(async (req, res) => {
  const { vendor, items = [], notes, approve = true } = req.body;
  const store = await mainStoreId(); // single department store receives every purchase
  const distributionCenter = undefined;
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Add at least one item to the purchase order.');
  requireId(vendor, 'Vendor');
  await assertVerifiedVendor(vendor, 'create a purchase order');

  const computedItems = [];
  const seen = new Set();
  for (const i of items) {
    requireId(i?.product, 'Product');
    // One line per product, so invoices and inward DCs can match lines unambiguously.
    if (seen.has(String(i.product))) throw new ApiError(400, 'A product appears twice on the order - combine the quantities into one line.');
    seen.add(String(i.product));
    if (!(await Product.exists({ _id: i.product }))) throw new ApiError(400, 'A product on this order was not found.');
    const clean = {
      product: i.product, batchNumber: i.batchNumber, manufacturingDate: i.manufacturingDate, expiryDate: i.expiryDate,
      quantity: positive(i.quantity, 'Order quantity', { integer: true, max: 1000000 }),
      unitPrice: number(i.unitPrice, 'Unit price', { min: 0, max: 10000000 }),
      gstRate: number(i.gstRate ?? 0, 'GST rate', { min: 0, max: 100 }),
    };
    computedItems.push({ ...clean, ...computeItemTotals(clean) });
  }
  const subtotal = computedItems.reduce((s, i) => s + i.taxableAmount, 0);
  const taxAmount = computedItems.reduce((s, i) => s + i.taxAmount, 0);
  const grandTotal = round2(subtotal + taxAmount);

  const poNumber = await generateDocNumber('purchase');
  const purchase = await Purchase.create({
    poNumber, vendor, store, distributionCenter, items: computedItems,
    subtotal: round2(subtotal), taxAmount: round2(taxAmount), grandTotal,
    invoicedAmount: 0, // nothing is payable until a Purchase Invoice is raised
    status: approve === false ? 'draft' : 'approved', orderedBy: req.user._id, notes,
    ...(approve === false ? {} : { approvedBy: req.user._id, approvedAt: new Date() }),
  });

  await recordAudit({ req, action: 'purchase.create', entity: 'Purchase', entityId: purchase._id, newValue: { poNumber, grandTotal } });
  res.status(201).json({ success: true, data: purchase });
});

export const listPurchases = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.vendor) filter.vendor = req.query.vendor;
  if (req.query.search) filter.poNumber = literalRegex(req.query.search);
  const [docs, total] = await Promise.all([
    Purchase.find(filter).populate('vendor', 'name verificationStatus').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Purchase.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getPurchase = catchAsync(async (req, res) => {
  const purchase = await Purchase.findById(req.params.id).populate('vendor store distributionCenter items.product');
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

export const payVendor = catchAsync(async (req, res) => {
  const { method = 'bank_transfer' } = req.body;
  oneOf(method, ['cash', 'bank_transfer', 'upi', 'card'], 'Payment method');
  const amount = round2(positive(req.body.amount, 'Payment amount'));
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) throw new ApiError(404, 'Purchase order not found.');
  if (['draft', 'cancelled'].includes(purchase.status)) throw new ApiError(400, `A ${purchase.status} purchase order cannot be paid.`);
  await assertVerifiedVendor(purchase.vendor, 'pay this vendor');
  const balance = round2(billedAmount(purchase) - (purchase.amountPaid || 0));
  if (balance <= 0 && purchase.invoicedAmount === 0) throw new ApiError(400, 'Nothing has been invoiced on this purchase order yet. Create the Purchase Invoice first.');
  if (amount > balance + 0.001) throw new ApiError(400, `Payment of ₹${amount} is more than the balance due of ₹${balance}.`);

  // Conditional update so two simultaneous payments cannot together overpay the bill.
  const updated = await Purchase.findOneAndUpdate(
    { _id: purchase._id, amountPaid: purchase.amountPaid || 0 },
    { $set: { amountPaid: round2((purchase.amountPaid || 0) + amount) } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'This bill was just updated by someone else. Refresh and try again.');

  await postLedgerPair({
    debitKey: 'payable', creditKey: method === 'cash' ? 'cash' : 'bank',
    amount, narration: `Payment for ${purchase.poNumber}`,
    referenceType: 'Purchase', referenceId: purchase._id, userId: req.user._id,
  });
  await recordAudit({ req, action: 'purchase.pay', entity: 'Purchase', entityId: purchase._id, newValue: { amount, method } });
  res.json({ success: true, data: updated });
});

// ---------- Purchase Invoices ----------
// Raised against an approved Purchase Order; lines, quantities and rates come from the order. Partial
// invoicing is allowed. Billing more than was ordered needs `allowOverInvoice: true`. No stock moves here.

const INVOICEABLE = ['approved', 'ordered', 'partially_invoiced'];

export const createPurchaseInvoice = catchAsync(async (req, res) => {
  const { purchaseId, items, notes } = req.body;
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
  if (vendorInvoiceNumber && await PurchaseInvoice.exists({ vendor: po.vendor, vendorInvoiceNumber, status: { $ne: 'cancelled' } })) {
    throw new ApiError(400, `Vendor invoice ${vendorInvoiceNumber} has already been entered for this vendor.`);
  }

  // Validate every line before writing anything.
  const seen = new Set();
  const lines = [];
  for (const it of items) {
    const line = po.items.find((l) => String(l.product) === String(it?.product));
    if (!line) throw new ApiError(400, 'An invoiced item is not on this purchase order.');
    if (seen.has(String(line.product))) throw new ApiError(400, 'An item appears twice on the invoice.');
    seen.add(String(line.product));
    const quantity = positive(it.quantity, 'Invoice quantity', { integer: true, max: 1000000 });
    const left = line.quantity - (line.invoicedQuantity || 0);
    if (quantity > left && !allowOverInvoice) {
      throw new ApiError(400, `Only ${Math.max(0, left)} more can be invoiced for this item (ordered ${line.quantity}, invoiced ${line.invoicedQuantity || 0}).`);
    }
    const clean = { product: line.product, quantity, unitPrice: line.unitPrice, gstRate: line.gstRate || 0 };
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
    const inv = lines.find((x) => String(x.product) === String(l.product));
    const o = l.toObject();
    return inv ? { ...o, invoicedQuantity: (o.invoicedQuantity || 0) + inv.quantity } : o;
  });
  const fully = nextItems.every((l) => (l.invoicedQuantity || 0) >= l.quantity);
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
  res.status(201).json({ success: true, data: invoice });
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
  if (req.query.search) {
    const rx = literalRegex(req.query.search);
    filter.$or = [{ invoiceNumber: rx }, { vendorInvoiceNumber: rx }, { poNumber: rx }];
  }
  const [docs, total] = await Promise.all([
    PurchaseInvoice.find(filter).populate('vendor', 'name verificationStatus').populate('items.product', 'name sku').sort({ createdAt: -1 }).skip(skip).limit(limit),
    PurchaseInvoice.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

// One invoice with its document trail: order, inward DCs and returns.
export const getPurchaseInvoice = catchAsync(async (req, res) => {
  const invoice = await PurchaseInvoice.findById(req.params.id).populate('vendor', 'name gstin verificationStatus').populate('items.product', 'name sku unit').populate('purchase', 'poNumber status grandTotal');
  if (!invoice) throw new ApiError(404, 'Purchase invoice not found.');
  const [inwardDCs, returns] = await Promise.all([
    InwardDC.find({ purchaseInvoice: invoice._id }).select('docNumber status items createdAt submittedAt').sort({ createdAt: 1 }).lean(),
    PurchaseReturn.find({ purchaseInvoice: invoice._id }).select('returnNumber status totalAmount items createdAt').sort({ createdAt: 1 }).lean(),
  ]);
  res.json({ success: true, data: { ...invoice.toJSON(), inwardDCs, returns } });
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
    const line = invoice.items.find((l) => String(l.product) === String(item?.product));
    if (!line) throw new ApiError(400, 'A returned item is not on this purchase invoice.');
    if (seen.has(String(line.product))) throw new ApiError(400, 'An item appears twice on the return.');
    seen.add(String(line.product));
    const quantity = positive(item.quantity, 'Return quantity', { integer: true });
    const left = (line.receivedQuantity || 0) - (line.returnedQuantity || 0);
    if (quantity > left) throw new ApiError(400, `Only ${left} of this item can be returned (received on Inward DC minus earlier returns).`);
    clean.push({ line, quantity, reason: item.reason ? String(item.reason).slice(0, 200) : undefined });
  }

  // Book the returned quantities on the invoice only if it is unchanged since we read it.
  const nextItems = invoice.items.map((l) => {
    const r = clean.find((c) => String(c.line.product) === String(l.product));
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
      items: clean.map((c) => ({ product: c.line.product, quantity: c.quantity, unitPrice: c.line.unitPrice, reason: c.reason, dispatchedQuantity: 0 })),
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
    PurchaseReturn.find(filter).populate('purchase', 'poNumber').populate('purchaseInvoice', 'invoiceNumber vendorInvoiceNumber').populate('vendor', 'name verificationStatus').populate('items.product', 'name sku').sort({ createdAt: -1 }).skip(skip).limit(limit),
    PurchaseReturn.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getPurchaseReturn = catchAsync(async (req, res) => {
  const doc = await PurchaseReturn.findById(req.params.id).populate('purchase', 'poNumber').populate('purchaseInvoice', 'invoiceNumber vendorInvoiceNumber').populate('vendor', 'name verificationStatus').populate('items.product', 'name sku');
  if (!doc) throw new ApiError(404, 'Purchase return not found.');
  const outwardDCs = await OutwardDC.find({ purchaseReturn: doc._id }).select('docNumber status items createdAt dispatchedAt').sort({ createdAt: 1 }).lean();
  res.json({ success: true, data: { ...doc.toJSON(), outwardDCs } });
});

export default {
  createPurchase, listPurchases, getPurchase, approvePurchase, receiveGoods, payVendor,
  createPurchaseInvoice, listPurchaseInvoices, getPurchaseInvoice,
  createPurchaseReturn, listPurchaseReturns, getPurchaseReturn,
};
