import Batch from '../models/Batch.js';
import Sale from '../models/Sale.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';

export const listBatches = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.product) filter.product = req.query.product;
  if (req.query.store) filter.store = req.query.store;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.expiringInDays) {
    const cutoff = new Date(Date.now() + Number(req.query.expiringInDays) * 24 * 60 * 60 * 1000);
    filter.expiryDate = { $lte: cutoff };
    filter.availableQuantity = { $gt: 0 };
  }
  if (req.query.search) filter.batchNumber = new RegExp(req.query.search, 'i');

  const [docs, total] = await Promise.all([
    Batch.find(filter).populate('product', 'name sku').populate('supplier', 'name').populate('store', 'name').sort({ expiryDate: 1 }).skip(skip).limit(limit),
    Batch.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getBatch = catchAsync(async (req, res) => {
  const batch = await Batch.findById(req.params.id).populate('product supplier store distributionCenter purchaseInvoice');
  if (!batch) throw new ApiError(404, 'Batch not found.');
  res.json({ success: true, data: batch });
});

export const createBatch = catchAsync(async (req, res) => {
  const existing = await Batch.findOne({ batchNumber: req.body.batchNumber, product: req.body.product });
  if (existing) throw new ApiError(409, 'Batch number already exists for this product.');
  const batch = await Batch.create({ ...req.body, availableQuantity: req.body.quantity });
  res.status(201).json({ success: true, data: batch });
});

export const updateBatch = catchAsync(async (req, res) => {
  const batch = await Batch.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!batch) throw new ApiError(404, 'Batch not found.');
  res.json({ success: true, data: batch });
});

// Batch-wise profitability: purchase cost vs realised sale revenue for this batch's units.
export const batchProfitability = catchAsync(async (req, res) => {
  const batch = await Batch.findById(req.params.id);
  if (!batch) throw new ApiError(404, 'Batch not found.');

  const sales = await Sale.aggregate([
    { $unwind: '$items' },
    { $match: { 'items.batch': batch._id, status: { $in: ['completed', 'partially_returned'] } } },
    { $group: { _id: null, unitsSold: { $sum: '$items.quantity' }, revenue: { $sum: '$items.totalAmount' } } },
  ]);

  const unitsSold = sales[0]?.unitsSold || 0;
  const revenue = sales[0]?.revenue || 0;
  const cost = unitsSold * batch.purchasePrice;

  res.json({
    success: true,
    data: {
      batch,
      unitsSold,
      revenue,
      cost,
      profit: revenue - cost,
      remainingUnits: batch.availableQuantity,
      remainingValue: batch.availableQuantity * batch.purchasePrice,
    },
  });
});

export default { listBatches, getBatch, createBatch, updateBatch, batchProfitability };
