import InwardDC from '../models/InwardDC.js';
import OutwardDC from '../models/OutwardDC.js';
import Inventory from '../models/Inventory.js';
import Purchase from '../models/Purchase.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { applyStockDelta, recordInventoryTransaction } from './inventoryController.js';

// ---------- Inward DC ----------

export const createInwardDC = catchAsync(async (req, res) => {
  const { distributionCenter, sourceType = 'Purchase', sourceReference, vendor, items, notes } = req.body;
  if (!items?.length) throw new ApiError(400, 'Add at least one item to the inward DC.');

  const docNumber = await generateDocNumber('inwardDC');
  const doc = await InwardDC.create({
    docNumber, distributionCenter, sourceType, sourceReference, vendor, items, notes,
    status: 'pending',
  });
  res.status(201).json({ success: true, data: doc });
});

export const listInwardDC = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.distributionCenter) filter.distributionCenter = req.query.distributionCenter;
  const [docs, total] = await Promise.all([
    InwardDC.find(filter).populate('distributionCenter', 'name code').populate('vendor', 'name').populate('items.product', 'name sku').sort({ createdAt: -1 }).skip(skip).limit(limit),
    InwardDC.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getInwardDC = catchAsync(async (req, res) => {
  const doc = await InwardDC.findById(req.params.id).populate('distributionCenter vendor items.product items.batch');
  if (!doc) throw new ApiError(404, 'Inward DC document not found.');
  res.json({ success: true, data: doc });
});

// Verification / quality check step, then stock update on acceptance.
export const processInwardDC = catchAsync(async (req, res) => {
  const { items, decision } = req.body; // items: [{ product, receivedQuantity, qualityCheckPassed, rejectReason }]
  const doc = await InwardDC.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Inward DC document not found.');
  if (['completed', 'rejected'].includes(doc.status)) throw new ApiError(400, 'This inward DC has already been finalized.');

  let anyAccepted = false;
  let allReceived = true;

  for (const incoming of items) {
    const line = doc.items.find((l) => String(l.product) === String(incoming.product));
    if (!line) continue;
    line.receivedQuantity = incoming.receivedQuantity;
    line.qualityCheckPassed = incoming.qualityCheckPassed;
    line.rejectReason = incoming.rejectReason || '';

    if (incoming.qualityCheckPassed && incoming.receivedQuantity > 0) {
      anyAccepted = true;
      await applyStockDelta({ product: incoming.product, distributionCenter: doc.distributionCenter, delta: incoming.receivedQuantity });
      await recordInventoryTransaction({
        product: incoming.product, quantity: incoming.receivedQuantity, type: 'inward_dc',
        destination: doc.distributionCenter, destinationModel: 'DistributionCenter',
        referenceType: 'InwardDC', referenceId: doc._id, referenceNumber: doc.docNumber, user: req.user._id,
      });
    }
    if (incoming.receivedQuantity < line.expectedQuantity) allReceived = false;
  }

  doc.status = decision === 'reject' ? 'rejected' : (allReceived ? 'completed' : 'partially_received');
  await doc.save();

  await recordAudit({ req, action: 'dc.inward_process', entity: 'InwardDC', entityId: doc._id, newValue: { status: doc.status } });

  res.json({ success: true, data: doc });
});

// ---------- Outward DC ----------

export const createOutwardDC = catchAsync(async (req, res) => {
  const { sourceDC, destinationType, destination, items, transportDetails, responsibleEmployee } = req.body;
  if (!items?.length) throw new ApiError(400, 'Add at least one item to the outward DC.');

  const docNumber = await generateDocNumber('outwardDC');
  const doc = await OutwardDC.create({
    docNumber, sourceDC, destinationType, destination, items, transportDetails, responsibleEmployee, status: 'draft',
  });
  res.status(201).json({ success: true, data: doc });
});

export const listOutwardDC = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.sourceDC) filter.sourceDC = req.query.sourceDC;
  const [docs, total] = await Promise.all([
    OutwardDC.find(filter).populate('sourceDC', 'name code').populate('items.product', 'name sku').sort({ createdAt: -1 }).skip(skip).limit(limit),
    OutwardDC.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getOutwardDC = catchAsync(async (req, res) => {
  const doc = await OutwardDC.findById(req.params.id).populate('sourceDC destination items.product items.batch approvedBy responsibleEmployee');
  if (!doc) throw new ApiError(404, 'Outward DC document not found.');
  res.json({ success: true, data: doc });
});

const OUTWARD_TRANSITIONS = {
  draft: 'approved',
  approved: 'picking',
  picking: 'packed',
  packed: 'dispatched',
  dispatched: 'received',
};

export const advanceOutwardDC = catchAsync(async (req, res) => {
  const doc = await OutwardDC.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Outward DC document not found.');

  const next = OUTWARD_TRANSITIONS[doc.status];
  if (!next) throw new ApiError(400, `Outward DC in status "${doc.status}" cannot be advanced further.`);

  if (next === 'approved') doc.approvedBy = req.user._id;
  if (next === 'dispatched') {
    doc.dispatchedAt = new Date();
    // stock leaves the DC at dispatch time
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
    for (const item of doc.items) {
      await applyStockDelta({
        product: item.product,
        store: doc.destinationType === 'Store' ? doc.destination : undefined,
        distributionCenter: doc.destinationType === 'DistributionCenter' ? doc.destination : undefined,
        delta: item.quantity,
      });
    }
  }

  doc.status = next;
  await doc.save();
  await recordAudit({ req, action: 'dc.outward_advance', entity: 'OutwardDC', entityId: doc._id, newValue: { status: doc.status } });
  res.json({ success: true, data: doc });
});

export const cancelOutwardDC = catchAsync(async (req, res) => {
  const doc = await OutwardDC.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Outward DC document not found.');
  if (['dispatched', 'received'].includes(doc.status)) throw new ApiError(400, 'Cannot cancel an outward DC that has already dispatched.');
  doc.status = 'cancelled';
  await doc.save();
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
  createOutwardDC, listOutwardDC, getOutwardDC, advanceOutwardDC, cancelOutwardDC,
  dcWiseStock,
};
