import User, { ROLES } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';

export const listUsers = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.search) {
    filter.$or = [
      { name: new RegExp(req.query.search, 'i') },
      { email: new RegExp(req.query.search, 'i') },
    ];
  }
  const [docs, total] = await Promise.all([
    User.find(filter).populate('store', 'name code').sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }), roles: ROLES });
});

export const createUser = catchAsync(async (req, res) => {
  const user = await User.create(req.body);
  await recordAudit({ req, action: 'user.create', entity: 'User', entityId: user._id, newValue: { email: user.email, role: user.role } });
  const obj = user.toObject();
  delete obj.password;
  res.status(201).json({ success: true, data: obj });
});

export const updateUser = catchAsync(async (req, res) => {
  const before = await User.findById(req.params.id);
  if (!before) throw new ApiError(404, 'User not found.');
  const update = { ...req.body };
  delete update.password;
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  await recordAudit({ req, action: 'user.update', entity: 'User', entityId: user._id, oldValue: { role: before.role, isActive: before.isActive }, newValue: { role: user.role, isActive: user.isActive } });
  res.json({ success: true, data: user });
});

export const deleteUser = catchAsync(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!user) throw new ApiError(404, 'User not found.');
  await recordAudit({ req, action: 'user.deactivate', entity: 'User', entityId: user._id });
  res.json({ success: true, message: 'User deactivated.' });
});

export default { listUsers, createUser, updateUser, deleteUser };
