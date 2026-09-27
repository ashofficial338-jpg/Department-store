import ApiError from './ApiError.js';
import catchAsync from './catchAsync.js';
import recordAudit from './audit.js';
import { getPagination, buildPaginatedResponse } from './pagination.js';

// Generic CRUD controller builder for straightforward master-data models
// (Category, Brand, Store, DistributionCenter, Vendor, Supplier, TaxRate, Account).
// Modules with real business logic (Product, Sale, Purchase, Inventory, DC docs...) get bespoke controllers.
export function crudFactory(Model, { entityName, searchFields = [], populate = [], defaultSort = { createdAt: -1 } }) {
  const list = catchAsync(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search && searchFields.length) {
      filter.$or = searchFields.map((f) => ({ [f]: new RegExp(req.query.search.trim(), 'i') }));
    }
    let query = Model.find(filter).sort(defaultSort).skip(skip).limit(limit);
    populate.forEach((p) => { query = query.populate(p); });
    const [docs, total] = await Promise.all([query, Model.countDocuments(filter)]);
    res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
  });

  const listAll = catchAsync(async (req, res) => {
    const filter = req.query.status ? { status: req.query.status } : {};
    const docs = await Model.find(filter).sort(defaultSort);
    res.json({ success: true, data: docs });
  });

  const getOne = catchAsync(async (req, res) => {
    let query = Model.findById(req.params.id);
    populate.forEach((p) => { query = query.populate(p); });
    const doc = await query;
    if (!doc) throw new ApiError(404, `${entityName} not found.`);
    res.json({ success: true, data: doc });
  });

  const create = catchAsync(async (req, res) => {
    const doc = await Model.create(req.body);
    await recordAudit({ req, action: `${entityName.toLowerCase()}.create`, entity: entityName, entityId: doc._id, newValue: req.body });
    res.status(201).json({ success: true, data: doc });
  });

  const update = catchAsync(async (req, res) => {
    const before = await Model.findById(req.params.id);
    if (!before) throw new ApiError(404, `${entityName} not found.`);
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    await recordAudit({ req, action: `${entityName.toLowerCase()}.update`, entity: entityName, entityId: doc._id, oldValue: before.toObject(), newValue: req.body });
    res.json({ success: true, data: doc });
  });

  const remove = catchAsync(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw new ApiError(404, `${entityName} not found.`);
    if ('status' in Model.schema.paths) {
      doc.status = 'inactive';
      await doc.save();
    } else if ('isActive' in Model.schema.paths) {
      doc.isActive = false;
      await doc.save();
    } else {
      await doc.deleteOne();
    }
    await recordAudit({ req, action: `${entityName.toLowerCase()}.delete`, entity: entityName, entityId: doc._id });
    res.json({ success: true, message: `${entityName} removed.` });
  });

  return { list, listAll, getOne, create, update, remove };
}

export default crudFactory;
