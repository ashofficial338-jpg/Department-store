import Settings from '../models/Settings.js';
import RolePermission from '../models/RolePermission.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import {
  MODULES, DASHBOARD_PERMISSIONS, ADMIN_ONLY_MODULES, ASSIGNABLE_PERMISSIONS, FULL_ACCESS_ROLES,
} from '../config/permissions.js';
import { ensureRolePermissions, clearPermissionCache } from '../services/permissionService.js';

async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  return settings;
}

export const getSettings = catchAsync(async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json({ success: true, data: settings });
});

export const updateSettings = catchAsync(async (req, res) => {
  const settings = await getOrCreateSettings();
  Object.assign(settings, req.body);
  await settings.save();
  await recordAudit({ req, action: 'settings.update', entity: 'Settings', entityId: settings._id, newValue: req.body });
  res.json({ success: true, data: settings });
});

function sanitizePermissions(permissions) {
  if (!Array.isArray(permissions)) throw new ApiError(400, 'Permissions must be a list.');
  const unknown = permissions.filter((p) => !ASSIGNABLE_PERMISSIONS.includes(p));
  if (unknown.length) throw new ApiError(400, `These permissions cannot be assigned: ${unknown.join(', ')}.`);
  return Array.from(new Set(permissions));
}

function assertEditable(role) {
  if (FULL_ACCESS_ROLES.includes(role)) {
    throw new ApiError(400, 'Administrator roles always have full access and cannot be changed.');
  }
}

export const permissionCatalog = catchAsync(async (req, res) => {
  res.json({
    success: true,
    data: {
      modules: MODULES.filter((m) => !ADMIN_ONLY_MODULES.includes(m)),
      adminOnlyModules: ADMIN_ONLY_MODULES,
      dashboard: DASHBOARD_PERMISSIONS,
      fullAccessRoles: FULL_ACCESS_ROLES,
    },
  });
});

export const listRolePermissions = catchAsync(async (req, res) => {
  await ensureRolePermissions();
  const [rows, counts] = await Promise.all([
    RolePermission.find().sort({ isSystem: -1, role: 1 }).lean(),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
  ]);
  const userCounts = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  res.json({
    success: true,
    data: rows.map((r) => ({
      ...r,
      fullAccess: FULL_ACCESS_ROLES.includes(r.role),
      permissions: FULL_ACCESS_ROLES.includes(r.role) ? ['*'] : r.permissions.filter((p) => !ADMIN_ONLY_MODULES.includes(p)),
      userCount: userCounts[r.role] || 0,
    })),
  });
});

export const createRole = catchAsync(async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) throw new ApiError(400, 'Role name is required.');
  const role = String(req.body.role || label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(role)) throw new ApiError(400, 'Role key must start with a letter and use only letters, numbers and underscores.');
  if (await RolePermission.exists({ role })) throw new ApiError(409, 'A role with this name already exists.');
  const permissions = sanitizePermissions(req.body.permissions || ['dashboard']);
  const doc = await RolePermission.create({ role, label, permissions, isSystem: false, version: 2 });
  clearPermissionCache();
  await recordAudit({ req, action: 'role.create', entity: 'RolePermission', entityId: doc._id, newValue: { role, label, permissions } });
  res.status(201).json({ success: true, data: doc });
});

export const updateRolePermission = catchAsync(async (req, res) => {
  assertEditable(req.params.role);
  const before = await RolePermission.findOne({ role: req.params.role });
  if (!before) throw new ApiError(404, 'Role not found.');
  const update = {};
  if (req.body.permissions !== undefined) update.permissions = sanitizePermissions(req.body.permissions);
  if (req.body.label !== undefined) {
    const label = String(req.body.label).trim();
    if (!label) throw new ApiError(400, 'Role name is required.');
    update.label = label;
  }
  const doc = await RolePermission.findOneAndUpdate({ role: req.params.role }, { ...update, version: 2 }, { new: true });
  clearPermissionCache();
  await recordAudit({
    req, action: 'role.permissions_update', entity: 'RolePermission', entityId: doc._id,
    oldValue: { label: before.label, permissions: before.permissions }, newValue: update,
  });
  res.json({ success: true, data: doc });
});

export const deleteRole = catchAsync(async (req, res) => {
  assertEditable(req.params.role);
  const doc = await RolePermission.findOne({ role: req.params.role });
  if (!doc) throw new ApiError(404, 'Role not found.');
  if (doc.isSystem) throw new ApiError(400, 'Built-in roles cannot be deleted.');
  const assigned = await User.countDocuments({ role: doc.role });
  if (assigned) throw new ApiError(400, `This role is assigned to ${assigned} user(s). Reassign them before deleting it.`);
  await doc.deleteOne();
  clearPermissionCache();
  await recordAudit({ req, action: 'role.delete', entity: 'RolePermission', entityId: doc._id, oldValue: { role: doc.role, label: doc.label } });
  res.json({ success: true, message: 'Role deleted.' });
});

export default {
  getSettings, updateSettings, permissionCatalog, listRolePermissions, createRole, updateRolePermission, deleteRole,
};
