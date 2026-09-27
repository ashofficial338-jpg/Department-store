import Settings from '../models/Settings.js';
import RolePermission from '../models/RolePermission.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';

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

export const listRolePermissions = catchAsync(async (req, res) => {
  const count = await RolePermission.countDocuments();
  if (count === 0) {
    const docs = Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, v]) => ({ role, label: v.label, permissions: v.permissions }));
    await RolePermission.insertMany(docs);
  }
  const rows = await RolePermission.find().sort({ role: 1 });
  res.json({ success: true, data: rows });
});

export const updateRolePermission = catchAsync(async (req, res) => {
  const doc = await RolePermission.findOneAndUpdate(
    { role: req.params.role },
    { permissions: req.body.permissions },
    { new: true, upsert: true }
  );
  await recordAudit({ req, action: 'role.permissions_update', entity: 'RolePermission', entityId: doc._id, newValue: req.body });
  res.json({ success: true, data: doc });
});

export default { getSettings, updateSettings, listRolePermissions, updateRolePermission };
