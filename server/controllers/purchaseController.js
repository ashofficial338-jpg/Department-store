import Purchase from '../models/Purchase.js';
import PurchaseReturn from '../models/PurchaseReturn.js';
import Batch from '../models/Batch.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { round2 } from '../utils/gstCalculator.js';
import { applyStockDelta, recordInventoryTransaction } from './inventoryController.js';
import { postLedgerPair } from '../utils/ledger.js';
import { literalRegex, requireId, positive, number, oneOf } from '../utils/validate.js';
import Vendor from '../models/Vendor.js';
import Inventory from '../models/Inventory.js';

function computeItemTotals(item) {
  const taxableAmount = round2(item.quantity * item.unitPrice);
  const taxAmount = round2((taxableAmount * (item.gstRate || 0)) / 100);
  return { taxableAmount, taxAmount, totalAmount: round2(taxableAmount + taxAmount) };
}

export const createPurchase = catchAsync(async (req, res) => {
  const { vendor, store, distributionCenter, items = [], notes } = req.body;
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Add at least one item to the purchase order.');
  requireId(vendor, 'Vendor');
  if (!(await Vendor.exists({ _id: vendor }))) throw new ApiError(400, 'Selected vendor was not found.');
  if (!store && !distributionCenter) throw new ApiError(400, 'Choose the store or distribution centre receiving the goods.');

  const computedItems = [];
  for (const i of items) {
    requireId(i?.product, 'Product');
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
    status: 'ordered', orderedBy: req.user._id, notes,
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
    Purchase.find(filter).populate('vendor', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Purchase.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getPurchase = catchAsync(async (req, res) => {
  const purchase = await Purchase.findById(req.params.id).populate('vendor store distributionCenter items.product');
  if (!purchase) throw new ApiError(404, 'Purchase order not found.');
  res.json({ success: true, data: purchase });
});

// Goods Receipt: verify quantities, create/replenish batches, increase stock, post payable.
export const receiveGoods = catchAsync(async (req, res) => {
  const { items, invoiceNumber } = req.body; // items: [{ product, receivedQuantity, batchNumber, manufacturingDate, expiryDate }]
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) throw new ApiError(404, 'Purchase order not found.');
  if (['received', 'invoiced', 'cancelled'].includes(purchase.status)) {
    throw new ApiError(400, 'This purchase has already been fully received.');
  }

  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Enter the quantities received.');
  // Validate every line before touching stock, so a bad line can't leave a half-received order.
  for (const incoming of items) {
    const line = purchase.items.find((l) => String(l.product) === String(incoming?.product));
    if (!line) throw new ApiError(400, 'A received item is not on this purchase order.');
    const qty = positive(incoming.receivedQuantity, 'Received quantity', { integer: true });
    const left = line.quantity - (line.receivedQuantity || 0);
    if (qty > left) throw new ApiError(400, `Only ${left} more can be received for this item (ordered ${line.quantity}).`);
    incoming.receivedQuantity = qty;
  }

  for (const incoming of items) {
    const line = purchase.items.find((l) => String(l.product) === String(incoming.product));
    line.receivedQuantity = (line.receivedQuantity || 0) + incoming.receivedQuantity;

    const product = await Product.findById(incoming.product);
    const batch = await Batch.create({
      batchNumber: incoming.batchNumber || `${purchase.poNumber}-${product.sku}`,
      product: incoming.product,
      supplier: purchase.vendor,
      purchaseInvoice: purchase._id,
      manufacturingDate: incoming.manufacturingDate,
      expiryDate: incoming.expiryDate,
      purchasePrice: line.unitPrice,
      sellingPrice: product.sellingPrice,
      quantity: incoming.receivedQuantity,
      availableQuantity: incoming.receivedQuantity,
      store: purchase.store,
      distributionCenter: purchase.distributionCenter,
    });

    await applyStockDelta({ product: incoming.product, store: purchase.store, distributionCenter: purchase.distributionCenter, delta: incoming.receivedQuantity });
    await recordInventoryTransaction({
      product: incoming.product, batch: batch._id, quantity: incoming.receivedQuantity, type: 'purchase_receipt',
      destination: purchase.store || purchase.distributionCenter, destinationModel: purchase.store ? 'Store' : 'DistributionCenter',
      referenceType: 'Purchase', referenceId: purchase._id, referenceNumber: purchase.poNumber, user: req.user._id,
    });
  }

  const allReceived = purchase.items.every((l) => (l.receivedQuantity || 0) >= l.quantity);
  purchase.status = allReceived ? 'received' : 'partially_received';
  if (invoiceNumber) {
    purchase.invoiceNumber = invoiceNumber;
    purchase.status = 'invoiced';
    await postLedgerPair({
      debitKey: 'purchases', creditKey: 'payable', amount: purchase.grandTotal,
      narration: `Purchase ${purchase.poNumber}`, referenceType: 'Purchase', referenceId: purchase._id, userId: req.user._id,
    });
  }
  await purchase.save();

  await recordAudit({ req, action: 'purchase.receive', entity: 'Purchase', entityId: purchase._id, newValue: { status: purchase.status } });
  res.json({ success: true, data: purchase });
});

export const payVendor = catchAsync(async (req, res) => {
  const { method = 'bank_transfer' } = req.body;
  oneOf(method, ['cash', 'bank_transfer', 'upi', 'card'], 'Payment method');
  const amount = round2(positive(req.body.amount, 'Payment amount'));
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) throw new ApiError(404, 'Purchase order not found.');
  if (['draft', 'cancelled'].includes(purchase.status)) throw new ApiError(400, `A ${purchase.status} purchase order cannot be paid.`);
  const balance = round2((purchase.grandTotal || 0) - (purchase.amountPaid || 0));
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

// ---------- Purchase Returns ----------

export const createPurchaseReturn = catchAsync(async (req, res) => {
  const { purchaseId, items } = req.body;
  requireId(purchaseId, 'Purchase');
  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) throw new ApiError(404, 'Original purchase not found.');
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Select at least one item to return.');

  // Validate first: items must be on the order, within what was received minus earlier returns,
  // and in stock at the receiving location.
  const already = new Map();
  for (const r of await PurchaseReturn.find({ purchase: purchase._id }).lean()) {
    for (const i of r.items) already.set(String(i.product), (already.get(String(i.product)) || 0) + i.quantity);
  }
  for (const item of items) {
    const line = purchase.items.find((l) => String(l.product) === String(item?.product));
    if (!line) throw new ApiError(400, 'A returned item is not on this purchase order.');
    item.quantity = positive(item.quantity, 'Return quantity', { integer: true });
    const left = (line.receivedQuantity || 0) - (already.get(String(line.product)) || 0);
    if (item.quantity > left) throw new ApiError(400, `Only ${left} of this item can be returned (received minus earlier returns).`);
    already.set(String(line.product), (already.get(String(line.product)) || 0) + item.quantity);
    const loc = purchase.store ? { store: purchase.store } : { distributionCenter: purchase.distributionCenter };
    const inv = await Inventory.findOne({ product: line.product, ...loc }).select('currentStock').lean();
    if ((inv?.currentStock || 0) < item.quantity) throw new ApiError(400, 'Not enough stock on hand to return this quantity.');
  }

  let totalAmount = 0;
  for (const item of items) {
    const line = purchase.items.find((l) => String(l.product) === String(item.product));
    // Returned value includes the GST charged on the bill.
    totalAmount += line.unitPrice * item.quantity * (1 + (line.gstRate || 0) / 100);

    await applyStockDelta({ product: item.product, store: purchase.store, distributionCenter: purchase.distributionCenter, delta: -item.quantity });
    if (item.batch) await Batch.findByIdAndUpdate(item.batch, { $inc: { availableQuantity: -item.quantity } });
    await recordInventoryTransaction({
      product: item.product, batch: item.batch, quantity: -item.quantity, type: 'purchase_return',
      source: purchase.store || purchase.distributionCenter, sourceModel: purchase.store ? 'Store' : 'DistributionCenter',
      referenceType: 'PurchaseReturn', referenceNumber: purchase.poNumber, notes: item.reason, user: req.user._id,
    });
  }

  const returnNumber = await generateDocNumber('purchaseReturn');
  const purchaseReturn = await PurchaseReturn.create({
    returnNumber, purchase: purchase._id, vendor: purchase.vendor,
    items: items.map((i) => ({ product: i.product, batch: i.batch, quantity: i.quantity, unitPrice: purchase.items.find((l) => String(l.product) === String(i.product)).unitPrice, reason: i.reason ? String(i.reason).slice(0, 200) : undefined })),
    totalAmount: round2(totalAmount), processedBy: req.user._id,
  });

  await postLedgerPair({
    debitKey: 'payable', creditKey: 'purchases', amount: round2(totalAmount),
    narration: `Return against ${purchase.poNumber}`, referenceType: 'PurchaseReturn', referenceId: purchaseReturn._id, userId: req.user._id,
  });

  res.status(201).json({ success: true, data: purchaseReturn });
});

export const listPurchaseReturns = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [docs, total] = await Promise.all([
    PurchaseReturn.find().populate('purchase', 'poNumber').populate('vendor', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    PurchaseReturn.countDocuments(),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export default {
  createPurchase, listPurchases, getPurchase, receiveGoods, payVendor,
  createPurchaseReturn, listPurchaseReturns,
};
