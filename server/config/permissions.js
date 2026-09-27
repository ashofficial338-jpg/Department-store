// Default permission matrix used to seed RolePermission documents.
// Module keys are checked by the `authorize()` middleware against the user's role.
export const MODULES = [
  'dashboard', 'pos', 'sales', 'products', 'inventory', 'dc',
  'purchasing', 'vendors', 'customers', 'finance', 'reports',
  'users', 'settings', 'audit',
];

export const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: { label: 'Super Admin', permissions: ['*'] },
  admin: { label: 'Admin', permissions: MODULES },
  store_manager: { label: 'Store Manager', permissions: ['dashboard', 'sales', 'products', 'inventory', 'dc', 'customers', 'reports'] },
  dc_manager: { label: 'DC Manager', permissions: ['dashboard', 'inventory', 'dc', 'reports'] },
  cashier: { label: 'Cashier', permissions: ['dashboard', 'pos', 'sales', 'customers'] },
  accountant: { label: 'Accountant', permissions: ['dashboard', 'finance', 'reports'] },
  purchase_manager: { label: 'Purchase Manager', permissions: ['dashboard', 'purchasing', 'vendors', 'reports'] },
  inventory_manager: { label: 'Inventory Manager', permissions: ['dashboard', 'inventory', 'dc', 'products', 'reports'] },
  sales_manager: { label: 'Sales Manager', permissions: ['dashboard', 'sales', 'pos', 'customers', 'reports'] },
  auditor: { label: 'Auditor', permissions: ['dashboard', 'reports', 'audit'] },
};

export function roleHasModule(role, moduleKey) {
  const entry = DEFAULT_ROLE_PERMISSIONS[role];
  if (!entry) return false;
  return entry.permissions.includes('*') || entry.permissions.includes(moduleKey);
}

export default DEFAULT_ROLE_PERMISSIONS;
