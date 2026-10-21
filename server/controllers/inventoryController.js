import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';
import InventoryTransaction from '../models/InventoryTransaction.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';
import StockTransfer from '../models/StockTransfer.js';
import Store from '../models/Store.js';
import DistributionCenter from '../models/DistributionCenter.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { literalRegex, requireId, number, positive, oneOf } from '../utils/validate.js';

// Adjust the aggregated Inventory doc for (product, store|dc) by `delta` units.
export async function applyStockDelta({ product, store, distributionCenter, delta, field = 'currentStock' }) {
  const filter = { product };
  if (store) filter.store = store;
  if (distributionCenter) filter.distributionCenter = distributionCenter;

  const inv = await Inventory.findOneAndUpdate(
    filter,
    { $inc: { [field]: delta }, $setOnInsert: { product, store, distributionCenter } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return inv;
}

export async function recordInventoryTransaction(data) {
  return InventoryTransaction.create(data);
}

export const stockOverview = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.store) filter.store = req.query.store;
  if (req.query.distributionCenter) filter.distributionCenter = req.query.distributionCenter;

  let productFilter = {};
  if (req.query.search) {
    productFilter = { $or: [{ name: literalRegex(req.query.search) }, { sku: literalRegex(req.query.search) }] };
  }
  if (req.query.category) productFilter.category = new mongoose.Types.ObjectId(req.query.category);

  const productIds = Object.keys(productFilter).length ? (await Product.find(productFilter).select('_id')).map((p) => p._id) : null;
  if (productIds) filter.product = { $in: productIds };

  const [docs, total] = await Promise.all([
    Inventory.find(filter).populate('product', 'name sku unit reorderLevel sellingPrice purchasePrice').populate('store', 'name code').populate('distributionCenter', 'name code').sort({ updatedAt: -1 }).skip(skip).limit(limit),
    Inventory.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const lowStock = catchAsync(async (req, res) => {
  const rows = await Inventory.aggregate([
    { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { $expr: { $lte: ['$currentStock', '$product.reorderLevel'] }, 'product.status': 'active' } },
    { $lookup: { from: 'stores', localField: 'store', foreignField: '_id', as: 'store' } },
    { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
    { $sort: { currentStock: 1 } },
    { $limit: 200 },
  ]);
  res.json({ success: true, data: rows });
});

export const expiryManagement = catchAsync(async (req, res) => {
  const days = Number(req.query.days || 60);
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const batches = await Batch.find({ expiryDate: { $lte: cutoff }, availableQuantity: { $gt: 0 }, status: { $ne: 'expired' } })
    .populate('product', 'name sku')
    .populate('store', 'name')
    .sort({ expiryDate: 1 });
  res.json({ success: true, data: batches });
});

export const stockLedger = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.product) filter.product = req.query.product;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  const [docs, total] = await Promise.all([
    InventoryTransaction.find(filter).populate('product', 'name sku').populate('batch', 'batchNumber').populate('user', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    InventoryTransaction.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

// Manual correction of stock quantity (damage found, stock count mismatch, etc.)
export const adjustStock = catchAsync(async (req, res) => {
  const { product, store, distributionCenter, type = 'stock_adjustment', notes } = req.body;
  requireId(product, 'Product');
  if (!store && !distributionCenter) throw new ApiError(400, 'Select a store or distribution center for this adjustment.');
  oneOf(type, ['stock_adjustment', 'damage', 'expiry_writeoff', 'opening_stock'], 'Adjustment type');
  const quantity = number(req.body.quantity, 'Quantity', { min: -1000000, max: 1000000, integer: true });
  if (quantity === 0) throw new ApiError(400, 'Quantity cannot be zero.');
  if (!notes || !String(notes).trim()) throw new ApiError(400, 'Give a reason for the adjustment (it is kept in the stock ledger).');

  const prod = await Product.findById(product);
  if (!prod) throw new ApiError(404, 'Product not found.');

  const field = type === 'damage' ? 'damagedStock' : 'currentStock';
  const loc = store ? { store } : { distributionCenter };
  let inv;
  if (quantity < 0) {
    // Conditional decrement: stock can never go below zero.
    inv = await Inventory.findOneAndUpdate({ product, ...loc, [field]: { $gte: -quantity } }, { $inc: { [field]: quantity } }, { new: true });
    if (!inv) {
      const have = (await Inventory.findOne({ product, ...loc }).lean())?.[field] || 0;
      throw new ApiError(400, `Only ${have} in stock - you cannot remove ${-quantity}.`);
    }
  } else {
    inv = await applyStockDelta({ product, store, distributionCenter, delta: quantity, field });
  }

  await recordInventoryTransaction({
    product, quantity: Number(quantity), type,
    source: store || distributionCenter,
    sourceModel: store ? 'Store' : 'DistributionCenter',
    referenceType: 'StockAdjustment', notes, user: req.user._id,
  });

  await recordAudit({ req, action: 'inventory.adjust', entity: 'Inventory', entityId: inv._id, newValue: { product, quantity, type, notes } });

  res.json({ success: true, data: inv });
});

export const createStockTransfer = catchAsync(async (req, res) => {
  const { sourceType, source, destinationType, destination, items, notes } = req.body;
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Add at least one item to transfer.');
  oneOf(sourceType, ['Store', 'DistributionCenter'], 'Source type');
  oneOf(destinationType, ['Store', 'DistributionCenter'], 'Destination type');
  requireId(source, 'Source'); requireId(destination, 'Destination');
  if (sourceType === destinationType && String(source) === String(destination)) throw new ApiError(400, 'Source and destination must be different locations.');
  const srcKey = sourceType === 'Store' ? 'store' : 'distributionCenter';
  for (const item of items) {
    requireId(item?.product, 'Product');
    item.quantity = positive(item.quantity, 'Transfer quantity', { integer: true, max: 1000000 });
  }

  // Reserve the stock at the source atomically; undo everything if any line is short.
  const taken = [];
  for (const item of items) {
    const inv = await Inventory.findOneAndUpdate({ product: item.product, [srcKey]: source, currentStock: { $gte: item.quantity } }, { $inc: { currentStock: -item.quantity } });
    if (!inv) {
      for (const t of taken) await Inventory.updateOne({ _id: t.id }, { $inc: { currentStock: t.qty } });
      const have = (await Inventory.findOne({ product: item.product, [srcKey]: source }).lean())?.currentStock || 0;
      const name = (await Product.findById(item.product).select('name').lean())?.name || 'an item';
      throw new ApiError(400, `Only ${have} of ${name} at the source - cannot transfer ${item.quantity}.`);
    }
    taken.push({ id: inv._id, qty: item.quantity });
  }

  const transferNumber = await generateDocNumber('stockTransfer');
  const transfer = await StockTransfer.create({
    transferNumber, sourceType, source, destinationType, destination, items, notes,
    requestedBy: req.user._id, status: 'in_transit',
  });

  for (const item of items) {
    await recordInventoryTransaction({
      product: item.product, batch: item.batch, quantity: -item.quantity, type: 'stock_transfer_out',
      source, sourceModel: sourceType, destination, destinationModel: destinationType,
      referenceType: 'StockTransfer', referenceId: transfer._id, referenceNumber: transferNumber, user: req.user._id,
    });
  }

  res.status(201).json({ success: true, data: transfer });
});

export const completeStockTransfer = catchAsync(async (req, res) => {
  const transfer = await StockTransfer.findById(req.params.id);
  if (!transfer) throw new ApiError(404, 'Stock transfer not found.');
  if (transfer.status !== 'in_transit' && transfer.status !== 'pending') throw new ApiError(400, `This transfer is already ${transfer.status.replace('_', ' ')}.`);
  // Claim it first so two clicks cannot both add the stock at the destination.
  const claimed = await StockTransfer.findOneAndUpdate({ _id: transfer._id, status: transfer.status }, { status: 'completed' });
  if (!claimed) throw new ApiError(409, 'This transfer was just updated by someone else. Refresh and try again.');

  for (const item of transfer.items) {
    await applyStockDelta({
      product: item.product,
      store: transfer.destinationType === 'Store' ? transfer.destination : undefined,
      distributionCenter: transfer.destinationType === 'DistributionCenter' ? transfer.destination : undefined,
      delta: item.quantity,
    });
    await recordInventoryTransaction({
      product: item.product, batch: item.batch, quantity: item.quantity, type: 'stock_transfer_in',
      source: transfer.source, sourceModel: transfer.sourceType,
      destination: transfer.destination, destinationModel: transfer.destinationType,
      referenceType: 'StockTransfer', referenceId: transfer._id, referenceNumber: transfer.transferNumber, user: req.user._id,
    });
  }

  transfer.status = 'completed';
  await transfer.save();
  res.json({ success: true, data: transfer });
});

export const listStockTransfers = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const [docs, total] = await Promise.all([
    StockTransfer.find(filter).populate('items.product', 'name sku').sort({ createdAt: -1 }).skip(skip).limit(limit),
    StockTransfer.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const locationsList = catchAsync(async (req, res) => {
  const [stores, dcs] = await Promise.all([Store.find({ isActive: true }), DistributionCenter.find({ status: 'active' })]);
  res.json({ success: true, data: { stores, distributionCenters: dcs } });
});

export default {
  stockOverview, lowStock, expiryManagement, stockLedger, adjustStock,
  createStockTransfer, completeStockTransfer, listStockTransfers, locationsList,
};
