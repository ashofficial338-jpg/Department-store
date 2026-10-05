// The signed-in user's effective permission keys come from the server (/auth/login and /auth/me),
// which reads the editable Roles & Permissions matrix. This is UI convenience only - the API enforces
// every permission independently.
//
// Fallback used only until /auth/me refreshes a session cached before permissions were sent.
const FALLBACK_ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: ['*'],
};

export const ADMIN_ROLES = ['super_admin', 'admin'];

export function isAdmin(user) {
  return !!user && (user.isAdmin === true || ADMIN_ROLES.includes(user.role));
}

export function userPermissions(user) {
  if (!user) return [];
  return user.permissions || FALLBACK_ROLE_PERMISSIONS[user.role] || ['dashboard'];
}

export function hasPermission(user, key) {
  const perms = userPermissions(user);
  return perms.includes('*') || perms.includes(key);
}

export function hasAnyPermission(user, keys) {
  return keys.some((k) => hasPermission(user, k));
}

export default { isAdmin, hasPermission, hasAnyPermission, userPermissions };
