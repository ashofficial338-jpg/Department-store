import EditRequest, { EDIT_REQUEST_ENTITIES } from '../models/EditRequest.js';
import AuditLog from '../models/AuditLog.js';
import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Vendor from '../models/Vendor.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { requireId, oneOf, literalRegex } from '../utils/validate.js';
import { permissionListHas } from '../services/permissionService.js';
import { isFullAccessRole } from '../services/permissionService.js';
import { updatePurchase, cancelPurchase } from './purchaseController.js';
import { updateProduct, deleteProduct } from './productController.js';
import { brandController } from './brandController.js';
import { categoryController } from './categoryController.js';
import { vendorController } from './vendorController.js';
import { requireFields } from '../utils/fieldRules.js';

const pickKeys = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && obj[k] !== undefined).map((k) => [k, obj[k]]));

// Per entity: the module a user needs to ask for a change, how to describe the record, which fields a
// request may change, and the administrator handlers that apply it.
const ENTITIES = {
  Purchase: {
    module: 'purchasing', model: Purchase, label: (d) => d.poNumber,
    fields: ['vendor', 'items', 'notes'], update: updatePurchase, remove: cancelPurchase,
    snapshot: (d) => pickKeys(d, ['vendor', 'notes', 'grandTotal', 'status', 'items']),
  },
  Product: {
    module: 'products', model: Product, label: (d) => d.name,
    fields: ['name', 'categoryName', 'category', 'brand', 'hsn', 'gstRate', 'purchasePrice', 'sellingPrice', 'mrp', 'discountPercent', 'unit',
      'productType', 'sellingUnit', 'baseUnit', 'purchaseUnit', 'unitOptions', 'packUnit', 'packQuantity', 'packQuantityUnit',
      'reorderLevel', 'minStock', 'maxStock', 'description', 'status', 'barcode',
      'sku', 'subcategoryName', 'brandName', 'brandNames', 'attributes', 'shelfLifeDays', 'primaryVendor', 'conversions', 'unitPrices'],
    update: updateProduct, remove: deleteProduct,
    snapshot: (d) => pickKeys(d, ['name', 'category', 'brand', 'gstRate', 'purchasePrice', 'sellingPrice', 'mrp', 'status', 'reorderLevel']),
  },
  Brand: {
    module: 'products', model: Brand, label: (d) => d.name,
    fields: ['name', 'description', 'status'], update: brandController.update, remove: brandController.remove,
    snapshot: (d) => pickKeys(d, ['name', 'description', 'status']),
  },
  Category: {
    module: 'products', model: Category, label: (d) => d.name,
    fields: ['name', 'description', 'status', 'parent'], update: categoryController.update, remove: categoryController.remove,
    snapshot: (d) => pickKeys(d, ['name', 'description', 'status', 'parent']),
  },
  Vendor: {
    module: 'vendors', model: Vendor, label: (d) => d.name,
    fields: ['name', 'companyName', 'contactPerson', 'phone', 'alternatePhone', 'email', 'address', 'city', 'state', 'pincode', 'gstin', 'pan', 'paymentTerms', 'creditLimit', 'bankDetails', 'status'],
    update: vendorController.update, remove: vendorController.remove,
    snapshot: (d) => pickKeys(d, ['name', 'phone', 'gstin', 'pan', 'address', 'status', 'verificationStatus']),
  },
};

const isAdmin = (req) => isFullAccessRole(req.user?.role);
const canUseEntity = (req, entity) => isAdmin(req) || permissionListHas(req.permissions, ENTITIES[entity].module);

// Runs an Express handler internally (as the approving administrator) and resolves with its JSON reply.
function runHandler(handler, req, { id, body }) {
  return new Promise((resolve, reject) => {
    const fakeReq = {
      user: req.user, permissions: req.permissions, ip: req.ip, headers: req.headers,
      params: { id: String(id) }, body: body || {}, query: {},
    };
    const fakeRes = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      set() { return this; },
      setHeader() { return this; },
      json(payload) { resolve(payload); return this; },
      send(payload) { resolve(payload); return this; },
    };
    handler(fakeReq, fakeRes, (err) => (err ? reject(err) : resolve(null)));
  });
}

export const createEditRequest = catchAsync(async (req, res) => {
  const entity = oneOf(req.body?.entity, EDIT_REQUEST_ENTITIES, 'Record type');
  const action = oneOf(req.body?.action || 'update', ['update', 'delete'], 'Request type');
  const entityId = requireId(req.body?.entityId, 'Record');
  const def = ENTITIES[entity];
  if (!canUseEntity(req, entity)) throw new ApiError(403, 'You do not have access to this module.');
  const doc = await def.model.findById(entityId).lean();
  if (!doc) throw new ApiError(404, `${entity === 'Purchase' ? 'Purchase order' : entity} not found.`);

  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  await requireFields('editRequest', { reason });
  let changes;
  if (action === 'update') {
    changes = pickKeys(req.body?.changes || {}, def.fields);
    if (!Object.keys(changes).length) throw new ApiError(400, 'No changes were given for this request.');
  }
  if (await EditRequest.exists({ entity, entityId, requestedBy: req.user._id, status: 'pending' })) {
    throw new ApiError(409, 'You already have a pending request for this record. Wait for the administrator, or withdraw it first.');
  }

  const request = await EditRequest.create({
    entity, entityId, entityLabel: def.label(doc), action, changes, before: def.snapshot(doc), reason,
    requestedBy: req.user._id, requestedByName: req.user.name || req.user.email,
  });
  await recordAudit({ req, action: 'edit_request.create', entity, entityId, newValue: { requestId: request._id, action, changes, reason } });
  res.status(201).json({ success: true, data: request, message: 'Request sent to the administrator for approval.' });
});

export const listEditRequests = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  // Administrators see every request; everyone else sees only their own.
  if (!isAdmin(req) || req.query.mine === 'true') filter.requestedBy = req.user._id;
  if (req.query.status) filter.status = oneOf(req.query.status, ['pending', 'approved', 'rejected', 'withdrawn'], 'Status');
  if (req.query.entity) filter.entity = oneOf(req.query.entity, EDIT_REQUEST_ENTITIES, 'Record type');
  if (req.query.entityId) filter.entityId = requireId(req.query.entityId, 'Record');
  if (req.query.user && isAdmin(req)) filter.requestedBy = requireId(req.query.user, 'User');
  if (req.query.search) {
    const rx = literalRegex(req.query.search);
    filter.$or = [{ entityLabel: rx }, { reason: rx }, { requestedByName: rx }];
  }
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(`${String(req.query.from).slice(0, 10)}T00:00:00.000+05:30`);
    if (req.query.to) filter.createdAt.$lte = new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999+05:30`);
  }
  const dir = req.query.order === 'asc' ? 1 : -1;
  const [docs, total, counts] = await Promise.all([
    EditRequest.find(filter).sort({ createdAt: dir }).skip(skip).limit(limit).lean(),
    EditRequest.countDocuments(filter),
    EditRequest.aggregate([{ $match: isAdmin(req) ? {} : { requestedBy: req.user._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const summary = { pending: 0, approved: 0, rejected: 0, withdrawn: 0 };
  counts.forEach((c) => { summary[c._id] = c.n; });
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }), summary });
});

async function pendingRequest(id) {
  requireId(id, 'Request');
  const request = await EditRequest.findById(id);
  if (!request) throw new ApiError(404, 'Edit request not found.');
  if (request.status !== 'pending') throw new ApiError(400, `This request is already ${request.status}.`);
  return request;
}

// Administrator approval: applies the change with the administrator's own edit / delete handler.
export const approveEditRequest = catchAsync(async (req, res) => {
  const request = await pendingRequest(req.params.id);
  const def = ENTITIES[request.entity];
  const handler = request.action === 'delete' ? def.remove : def.update;
  const body = request.action === 'delete' ? { reason: request.reason } : request.changes;
  const result = await runHandler(handler, req, { id: request.entityId, body }); // throws (request stays pending) if invalid

  const claimed = await EditRequest.findOneAndUpdate(
    { _id: request._id, status: 'pending' },
    { $set: { status: 'approved', reviewedBy: req.user._id, reviewedByName: req.user.name || req.user.email, reviewedAt: new Date(), reviewRemarks: String(req.body?.remarks || '').slice(0, 500) || undefined } },
    { new: true },
  );
  await recordAudit({
    req, action: 'edit_request.approve', entity: request.entity, entityId: request.entityId,
    newValue: { requestId: request._id, action: request.action, requestedBy: request.requestedByName, changes: request.changes },
  });
  res.json({ success: true, data: claimed, record: result?.data, message: 'Request approved and the change applied.' });
});

export const rejectEditRequest = catchAsync(async (req, res) => {
  const request = await pendingRequest(req.params.id);
  const remarks = String(req.body?.remarks || '').trim().slice(0, 500);
  await requireFields('editRequest', { rejectRemarks: remarks });
  request.status = 'rejected';
  request.reviewedBy = req.user._id;
  request.reviewedByName = req.user.name || req.user.email;
  request.reviewedAt = new Date();
  request.reviewRemarks = remarks;
  await request.save();
  await recordAudit({ req, action: 'edit_request.reject', entity: request.entity, entityId: request.entityId, newValue: { requestId: request._id, remarks, requestedBy: request.requestedByName } });
  res.json({ success: true, data: request });
});

// The requester can withdraw their own pending request.
export const withdrawEditRequest = catchAsync(async (req, res) => {
  const request = await pendingRequest(req.params.id);
  if (String(request.requestedBy) !== String(req.user._id)) throw new ApiError(403, 'Only the person who sent the request can withdraw it.');
  request.status = 'withdrawn';
  await request.save();
  await recordAudit({ req, action: 'edit_request.withdraw', entity: request.entity, entityId: request.entityId, newValue: { requestId: request._id } });
  res.json({ success: true, data: request });
});

// Activity of one record: who created, changed, requested and approved it (audit log + edit requests).
export const recordActivity = catchAsync(async (req, res) => {
  const entity = oneOf(req.params.entity, EDIT_REQUEST_ENTITIES, 'Record type');
  const entityId = requireId(req.params.id, 'Record');
  if (!canUseEntity(req, entity)) throw new ApiError(403, 'You do not have access to this module.');
  const [logs, requests] = await Promise.all([
    AuditLog.find({ entityId }).sort({ createdAt: -1 }).limit(100).select('action userName user createdAt oldValue newValue').lean(),
    EditRequest.find({ entity, entityId }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  res.json({ success: true, data: { logs, requests } });
});

export const pendingCount = catchAsync(async (req, res) => {
  const filter = { status: 'pending', ...(isAdmin(req) ? {} : { requestedBy: req.user._id }) };
  res.json({ success: true, data: { pending: await EditRequest.countDocuments(filter) } });
});

export default {
  createEditRequest, listEditRequests, approveEditRequest, rejectEditRequest, withdrawEditRequest, recordActivity, pendingCount,
};
