// Mirrors server/config/permissions.js so the sidebar/routes can hide what a role can't access.
// The server is the actual source of truth/enforcement; this is UI-only convenience.
export const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: ['dashboard', 'pos', 'sales', 'products', 'inventory', 'dc', 'purchasing', 'vendors', 'customers', 'finance', 'reports', 'users', 'settings', 'audit'],
  store_manager: ['dashboard', 'sales', 'products', 'inventory', 'dc', 'customers', 'reports'],
  dc_manager: ['dashboard', 'inventory', 'dc', 'reports'],
  cashier: ['dashboard', 'pos', 'sales', 'customers'],
  accountant: ['dashboard', 'finance', 'reports'],
  purchase_manager: ['dashboard', 'purchasing', 'vendors', 'reports'],
  inventory_manager: ['dashboard', 'inventory', 'dc', 'products', 'reports'],
  sales_manager: ['dashboard', 'sales', 'pos', 'customers', 'reports'],
  auditor: ['dashboard', 'reports', 'audit'],
};

export function roleHasModule(role, moduleKey) {
  const perms = DEFAULT_ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes('*') || perms.includes(moduleKey);
}

// Only administrators may edit or delete existing records (enforced on the server too).
export function isAdmin(user) {
  return user?.role === 'super_admin' || user?.role === 'admin';
}

export default { DEFAULT_ROLE_PERMISSIONS, roleHasModule, isAdmin };
