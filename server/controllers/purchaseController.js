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

function computeItemTotals(item) {
  const taxableAmount = round2(item.quantity * item.unitPrice);
  const taxAmount = round2((taxableAmount * (item.gstRate || 0)) / 100);
  return { taxableAmount, taxAmount, totalAmount: round2(taxableAmount + taxAmount) };
}

export const createPurchase = catchAsync(async (req, res) => {
  const { vendor, store, distributionCenter, items = [], notes } = req.body;
  if (!items.length) throw new ApiError(400, 'Add at least one item to the purchase order.');

  const computedItems = items.map((i) => ({ ...i, ...computeItemTotals(i) }));
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
  if (req.query.search) filter.poNumber = new RegExp(req.query.search, 'i');
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

  let allReceived = true;

  for (const incoming of items) {
    const line = purchase.items.find((l) => String(l.product) === String(incoming.product));
    if (!line) continue;
    line.receivedQuantity = (line.receivedQuantity || 0) + incoming.receivedQuantity;
    if (line.receivedQuantity < line.quantity) allReceived = false;

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
  const { amount, method = 'bank_transfer' } = req.body;
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) throw new ApiError(404, 'Purchase order not found.');

  purchase.amountPaid = round2((purchase.amountPaid || 0) + Number(amount));
  await purchase.save();

  await postLedgerPair({
    debitKey: 'payable', creditKey: method === 'cash' ? 'cash' : 'bank',
    amount: Number(amount), narration: `Payment for ${purchase.poNumber}`,
    referenceType: 'Purchase', referenceId: purchase._id, userId: req.user._id,
  });

  res.json({ success: true, data: purchase });
});

// ---------- Purchase Returns ----------

export const createPurchaseReturn = catchAsync(async (req, res) => {
  const { purchaseId, items } = req.body;
  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) throw new ApiError(404, 'Original purchase not found.');
  if (!items?.length) throw new ApiError(400, 'Select at least one item to return.');

  let totalAmount = 0;
  for (const item of items) {
    const line = purchase.items.find((l) => String(l.product) === String(item.product));
    const unitPrice = line?.unitPrice || 0;
    totalAmount += unitPrice * item.quantity;

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
    returnNumber, purchase: purchase._id, vendor: purchase.vendor, items,
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
