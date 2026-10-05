import User from '../models/User.js';
import RolePermission from '../models/RolePermission.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { ensureRolePermissions } from '../services/permissionService.js';

// Only a Super Admin may create or promote another Super Admin, and a Super Admin can only be changed by one.
async function assertRoleAssignable(req, role, target) {
  if (role !== undefined) {
    if (!(await RolePermission.exists({ role }))) throw new ApiError(400, 'Unknown role. Create it in Roles & Permissions first.');
    if (role === 'super_admin' && req.user.role !== 'super_admin') throw new ApiError(403, 'Only a Super Admin can assign the Super Admin role.');
  }
  if (target?.role === 'super_admin' && req.user.role !== 'super_admin') throw new ApiError(403, 'Only a Super Admin can modify a Super Admin account.');
  if (target && String(target._id) === String(req.user._id) && (role !== undefined && role !== target.role)) {
    throw new ApiError(400, 'You cannot change your own role.');
  }
}

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
  await ensureRolePermissions();
  const roles = await RolePermission.find().sort({ isSystem: -1, role: 1 }).select('role label').lean();
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }), roles: roles.map((r) => r.role), roleOptions: roles });
});

export const createUser = catchAsync(async (req, res) => {
  await assertRoleAssignable(req, req.body.role || 'cashier');
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
  await assertRoleAssignable(req, update.role, before);
  if (String(before._id) === String(req.user._id) && update.isActive === false) throw new ApiError(400, 'You cannot deactivate your own account.');
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  await recordAudit({ req, action: 'user.update', entity: 'User', entityId: user._id, oldValue: { role: before.role, isActive: before.isActive }, newValue: { role: user.role, isActive: user.isActive } });
  res.json({ success: true, data: user });
});

export const deleteUser = catchAsync(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'User not found.');
  await assertRoleAssignable(req, undefined, target);
  if (String(target._id) === String(req.user._id)) throw new ApiError(400, 'You cannot deactivate your own account.');
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!user) throw new ApiError(404, 'User not found.');
  await recordAudit({ req, action: 'user.deactivate', entity: 'User', entityId: user._id });
  res.json({ success: true, message: 'User deactivated.' });
});

export default { listUsers, createUser, updateUser, deleteUser };
