import Store from '../models/Store.js';
import crudFactory from '../utils/crudFactory.js';
import catchAsync from '../utils/catchAsync.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { literalRegex } from '../utils/validate.js';
import { ACTIVE_STORE_FILTER, isAdminUser } from '../utils/storeGuard.js';

const base = crudFactory(Store, { entityName: 'Store', searchFields: ['name', 'code'], populate: ['manager'] });

// Dropdown lookups (POS, expenses, users, data entry...): active stores only, for everyone.
const listAll = catchAsync(async (req, res) => {
  const docs = await Store.find(ACTIVE_STORE_FILTER).sort({ name: 1 });
  res.json({ success: true, data: docs });
});

// Paginated list: administrators see every store (Settings > Store / Branch needs inactive ones to
// reactivate them); everyone else sees active stores only.
const list = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = isAdminUser(req.user) ? {} : { ...ACTIVE_STORE_FILTER };
  if (req.query.search) filter.$or = ['name', 'code'].map((f) => ({ [f]: literalRegex(req.query.search) }));
  const [docs, total] = await Promise.all([
    Store.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('manager'),
    Store.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const storeController = { ...base, list, listAll };

export default storeController;
