// Default permission matrix used to seed RolePermission documents.
// The live matrix is stored in MongoDB (editable at Settings > Roles & Permissions) and enforced
// on every API route by the requirePermission() middleware (see services/permissionService.js).
export const MODULES = [
  'dashboard', 'pos', 'sales', 'products', 'inventory', 'dc',
  'purchasing', 'vendors', 'customers', 'finance', 'reports',
  'users', 'settings', 'audit',
];

// Fine-grained dashboard permissions. Section keys control which widgets/data a role can view;
// the interaction keys gate click-through detail pages, filters and exports.
export const DASHBOARD_PERMISSIONS = [
  { key: 'dashboard.sales', label: 'Revenue', description: 'Daily revenue, sales trend, top products, category & payment charts' },
  { key: 'dashboard.expenses', label: 'Expenses', description: 'Daily and period expenses' },
  { key: 'dashboard.inventory', label: 'Inventory', description: 'Stock value, low stock, ITR, inventory holding period' },
  { key: 'dashboard.financials', label: 'Financials', description: 'Profit, margin, EBITDA, product ROI, purchases, receivables, payables' },
  { key: 'dashboard.details', label: 'Detail pages', description: 'Click dashboard elements to open detailed information pages' },
  { key: 'dashboard.filters', label: 'Filters', description: 'Filter the dashboard by date, product, category, stock, revenue and expenses' },
  { key: 'dashboard.export', label: 'Export', description: 'Export dashboard data to Excel, CSV or PDF' },
];

// Users, Settings and Roles & Permissions are reserved for administrators and cannot be granted to other roles.
export const ADMIN_ONLY_MODULES = ['users', 'settings'];
export const FULL_ACCESS_ROLES = ['super_admin', 'admin'];

export const ASSIGNABLE_PERMISSIONS = [
  ...MODULES.filter((m) => !ADMIN_ONLY_MODULES.includes(m)),
  ...DASHBOARD_PERMISSIONS.map((p) => p.key),
];

export const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: { label: 'Super Admin', permissions: ['*'] },
  admin: { label: 'Admin', permissions: ['*'] },
  store_manager: { label: 'Store Manager', permissions: ['dashboard', 'dashboard.sales', 'dashboard.expenses', 'dashboard.inventory', 'sales', 'products', 'inventory', 'dc', 'customers', 'reports'] },
  dc_manager: { label: 'DC Manager', permissions: ['dashboard', 'dashboard.inventory', 'inventory', 'dc', 'reports'] },
  cashier: { label: 'Cashier', permissions: ['dashboard', 'dashboard.sales', 'pos', 'sales', 'customers'] },
  accountant: { label: 'Accountant', permissions: ['dashboard', 'dashboard.sales', 'dashboard.expenses', 'dashboard.financials', 'finance', 'reports'] },
  purchase_manager: { label: 'Purchase Manager', permissions: ['dashboard', 'dashboard.inventory', 'purchasing', 'vendors', 'reports'] },
  inventory_manager: { label: 'Inventory Manager', permissions: ['dashboard', 'dashboard.inventory', 'inventory', 'dc', 'products', 'reports'] },
  sales_manager: { label: 'Sales Manager', permissions: ['dashboard', 'dashboard.sales', 'sales', 'pos', 'customers', 'reports'] },
  auditor: { label: 'Auditor', permissions: ['dashboard', 'dashboard.sales', 'dashboard.expenses', 'dashboard.inventory', 'dashboard.financials', 'reports', 'audit'] },
};

export function permissionListHas(permissions, key) {
  return !!permissions && (permissions.includes('*') || permissions.includes(key));
}

// Static default check (used only where the DB-backed matrix is unavailable, e.g. seeding).
export function roleHasModule(role, moduleKey) {
  const entry = DEFAULT_ROLE_PERMISSIONS[role];
  return !!entry && permissionListHas(entry.permissions, moduleKey);
}

export default DEFAULT_ROLE_PERMISSIONS;
