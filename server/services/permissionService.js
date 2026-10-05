import RolePermission from '../models/RolePermission.js';
import {
  DEFAULT_ROLE_PERMISSIONS, FULL_ACCESS_ROLES, ADMIN_ONLY_MODULES, permissionListHas,
} from '../config/permissions.js';

// Role permissions are read from MongoDB on each request through a short-lived per-instance cache,
// so edits made in Settings > Roles & Permissions take effect within seconds on every server instance.
const CACHE_TTL_MS = 15 * 1000;
const cache = new Map(); // role -> { permissions, at }

export function clearPermissionCache() {
  cache.clear();
}

export function isFullAccessRole(role) {
  return FULL_ACCESS_ROLES.includes(role);
}

// Brings role documents written before dashboard permissions existed up to date by granting the
// role's default dashboard.* keys, so upgrading does not silently blank existing users' dashboards.
function migrateLegacy(doc) {
  if (doc.version >= 2) return null;
  const defaults = DEFAULT_ROLE_PERMISSIONS[doc.role]?.permissions || ['dashboard'];
  const dashboardKeys = doc.permissions.includes('dashboard') ? defaults.filter((p) => p.startsWith('dashboard.')) : [];
  return Array.from(new Set([...doc.permissions.filter((p) => !ADMIN_ONLY_MODULES.includes(p)), ...dashboardKeys]));
}

// Seeds missing built-in roles and migrates legacy documents. Idempotent.
export async function ensureRolePermissions() {
  const existing = await RolePermission.find().lean();
  const byRole = new Map(existing.map((d) => [d.role, d]));
  const ops = [];
  for (const [role, def] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const doc = byRole.get(role);
    if (!doc) {
      ops.push({ insertOne: { document: { role, label: def.label, permissions: def.permissions, isSystem: true, version: 2 } } });
    } else if (!(doc.version >= 2) || !doc.isSystem) {
      const migrated = migrateLegacy(doc);
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { isSystem: true, version: 2, ...(migrated ? { permissions: migrated } : {}) } } } });
    }
  }
  for (const doc of existing) {
    if (!DEFAULT_ROLE_PERMISSIONS[doc.role] && !(doc.version >= 2)) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { version: 2, permissions: migrateLegacy(doc) } } } });
    }
  }
  if (ops.length) {
    await RolePermission.bulkWrite(ops);
    clearPermissionCache();
  }
}

export async function getRolePermissions(role) {
  if (isFullAccessRole(role)) return ['*'];
  const hit = cache.get(role);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.permissions;

  let doc = await RolePermission.findOne({ role }).lean();
  if (!doc || !(doc.version >= 2)) {
    await ensureRolePermissions();
    doc = await RolePermission.findOne({ role }).lean();
  }
  // Admin-only modules are never honoured for other roles, even if present in the stored document.
  const permissions = (doc?.permissions || []).filter((p) => p !== '*' && !ADMIN_ONLY_MODULES.includes(p));
  cache.set(role, { permissions, at: Date.now() });
  return permissions;
}

export async function userPermissions(user) {
  if (!user) return [];
  return getRolePermissions(user.role);
}

export async function userHasPermission(user, key) {
  return permissionListHas(await userPermissions(user), key);
}

export { permissionListHas };

export default {
  getRolePermissions, userPermissions, userHasPermission, ensureRolePermissions, clearPermissionCache, isFullAccessRole,
};
