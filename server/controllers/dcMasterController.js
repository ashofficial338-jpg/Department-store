import DistributionCenter from '../models/DistributionCenter.js';
import crudFactory from '../utils/crudFactory.js';
import catchAsync from '../utils/catchAsync.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { literalRegex } from '../utils/validate.js';
import { ACTIVE_DC_FILTER, isAdminUser } from '../utils/storeGuard.js';

const base = crudFactory(DistributionCenter, {
  entityName: 'DistributionCenter',
  searchFields: ['name', 'code'],
  populate: ['manager'],
});

// Dropdown lookups: active distribution centers only, for everyone.
const listAll = catchAsync(async (req, res) => {
  const docs = await DistributionCenter.find(ACTIVE_DC_FILTER).sort({ name: 1 });
  res.json({ success: true, data: docs });
});

// Paginated list (DC Management > Distribution Centers): administrators see every DC so they can
// reactivate one; other roles see active DCs only.
const list = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = isAdminUser(req.user) ? {} : { ...ACTIVE_DC_FILTER };
  if (req.query.search) filter.$or = ['name', 'code', 'city'].map((f) => ({ [f]: literalRegex(req.query.search) }));
  const [docs, total] = await Promise.all([
    DistributionCenter.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('manager'),
    DistributionCenter.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const dcMasterController = { ...base, list, listAll };

export default dcMasterController;
