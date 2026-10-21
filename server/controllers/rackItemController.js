import RackItem from '../models/RackItem.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Natural order so rack "2" sorts before rack "10".
const NATURAL = { locale: 'en', numericOrdering: true };

function pickFields(body) {
  const out = {};
  ['name', 'serialNumber', 'rack', 'quantity'].forEach((k) => { if (body[k] !== undefined) out[k] = body[k]; });
  return out;
}

async function assertSerialFree(serialNumber, exceptId) {
  if (!serialNumber) return;
  const existing = await RackItem.findOne({ serialNumber: String(serialNumber).trim().toUpperCase() });
  if (existing && String(existing._id) !== String(exceptId)) {
    throw new ApiError(409, `Serial number ${existing.serialNumber} is already used by "${existing.name}" (Rack ${existing.rack}).`);
  }
}

// GET /rack-items?search=dolo  - matches product name, serial number or rack. Returns every match, rack-wise.
export const list = catchAsync(async (req, res) => {
  const filter = {};
  const q = (req.query.search || '').trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { serialNumber: rx }, { rack: rx }];
  }
  const docs = await RackItem.find(filter).collation(NATURAL).sort({ rack: 1, name: 1 }).lean();
  res.json({ success: true, data: docs });
});

export const create = catchAsync(async (req, res) => {
  const payload = pickFields(req.body);
  await assertSerialFree(payload.serialNumber);
  const doc = await RackItem.create(payload);
  await recordAudit({ req, action: 'rackitem.create', entity: 'RackItem', entityId: doc._id, newValue: payload });
  res.status(201).json({ success: true, data: doc });
});

export const update = catchAsync(async (req, res) => {
  const before = await RackItem.findById(req.params.id);
  if (!before) throw new ApiError(404, 'Product not found.');
  const payload = pickFields(req.body);
  await assertSerialFree(payload.serialNumber, before._id);
  const doc = await RackItem.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  await recordAudit({ req, action: 'rackitem.update', entity: 'RackItem', entityId: doc._id, oldValue: before.toObject(), newValue: payload });
  res.json({ success: true, data: doc });
});

export const remove = catchAsync(async (req, res) => {
  const doc = await RackItem.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Product not found.');
  await doc.deleteOne();
  await recordAudit({ req, action: 'rackitem.delete', entity: 'RackItem', entityId: doc._id, oldValue: doc.toObject() });
  res.json({ success: true, message: 'Product removed.' });
});

export default { list, create, update, remove };
