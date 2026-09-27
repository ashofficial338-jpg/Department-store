import {
  LayoutDashboard, FilePlus2, ShoppingCart, ReceiptText, Undo2, History,
  Package, Tags, Award, Images, Layers, Tag,
  Boxes, SlidersHorizontal, ArrowLeftRight, ScrollText, AlertTriangle, CalendarClock,
  Truck, LogIn, LogOut as LogOutIcon, ListChecks, CheckSquare, Warehouse,
  ClipboardList, FileText, RotateCcw, Building2, Factory,
  Users, UserCircle, Star, Wallet,
  Landmark, ArrowDownCircle, ArrowUpCircle, Receipt, Coins, Building, CreditCard, Percent, TrendingUp,
  BarChart3, FileBarChart,
  UserCog, ShieldCheck, Store, Percent as PercentIcon, Banknote, FileCog, Settings as SettingsIcon,
} from 'lucide-react';

// module: used by requireModule() permission checks on the client (mirrors server config/permissions.js)
export const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
      { label: 'Data Entry', to: '/data-entry', icon: FilePlus2, module: 'dashboard' },
    ],
  },
  {
    label: 'Sales',
    module: 'sales',
    items: [
      { label: 'POS Billing', to: '/pos', icon: ShoppingCart, module: 'pos' },
      { label: 'Sales Invoices', to: '/sales/invoices', icon: ReceiptText, module: 'sales' },
      { label: 'Sales Returns', to: '/sales/returns', icon: Undo2, module: 'sales' },
      { label: 'Sales History', to: '/sales/history', icon: History, module: 'sales' },
    ],
  },
  {
    label: 'Products',
    module: 'products',
    items: [
      { label: 'Product Master', to: '/products', icon: Package, module: 'products' },
      { label: 'Categories', to: '/products/categories', icon: Tags, module: 'products' },
      { label: 'Brands', to: '/products/brands', icon: Award, module: 'products' },
      { label: 'Create from Image', to: '/products/from-image', icon: Images, module: 'products' },
      { label: 'Batch Management', to: '/products/batches', icon: Layers, module: 'products' },
      { label: 'Pricing & GST', to: '/products/pricing', icon: Tag, module: 'products' },
    ],
  },
  {
    label: 'Inventory',
    module: 'inventory',
    items: [
      { label: 'Stock Overview', to: '/inventory/overview', icon: Boxes, module: 'inventory' },
      { label: 'Stock Adjustment', to: '/inventory/adjustment', icon: SlidersHorizontal, module: 'inventory' },
      { label: 'Stock Transfer', to: '/inventory/transfer', icon: ArrowLeftRight, module: 'inventory' },
      { label: 'Stock Ledger', to: '/inventory/ledger', icon: ScrollText, module: 'inventory' },
      { label: 'Low Stock', to: '/inventory/low-stock', icon: AlertTriangle, module: 'inventory' },
      { label: 'Expiry Management', to: '/inventory/expiry-management', icon: CalendarClock, module: 'inventory' },
    ],
  },
  {
    label: 'DC Management',
    module: 'dc',
    items: [
      { label: 'Inward DC', to: '/dc/inward', icon: LogIn, module: 'dc' },
      { label: 'Outward DC', to: '/dc/outward', icon: LogOutIcon, module: 'dc' },
      { label: 'DC History', to: '/dc/history', icon: ListChecks, module: 'dc' },
      { label: 'DC-wise Stock', to: '/dc/stock', icon: Warehouse, module: 'dc' },
    ],
  },
  {
    label: 'Purchasing',
    module: 'purchasing',
    items: [
      { label: 'Purchase Orders', to: '/purchasing/orders', icon: ClipboardList, module: 'purchasing' },
      { label: 'Purchase Invoices', to: '/purchasing/invoices', icon: FileText, module: 'purchasing' },
      { label: 'Purchase Returns', to: '/purchasing/returns', icon: RotateCcw, module: 'purchasing' },
      { label: 'Vendors', to: '/purchasing/vendors', icon: Building2, module: 'vendors' },
      { label: 'Suppliers', to: '/purchasing/suppliers', icon: Factory, module: 'vendors' },
    ],
  },
  {
    label: 'Customers',
    module: 'customers',
    items: [
      { label: 'Customer Master', to: '/customers', icon: Users, module: 'customers' },
      { label: 'Customer Loyalty', to: '/customers/loyalty', icon: Star, module: 'customers' },
      { label: 'Outstanding Payments', to: '/customers/outstanding', icon: Wallet, module: 'customers' },
    ],
  },
  {
    label: 'Finance',
    module: 'finance',
    items: [
      { label: 'Accounts', to: '/finance/accounts', icon: Landmark, module: 'finance' },
      { label: 'Receivables', to: '/finance/receivables', icon: ArrowDownCircle, module: 'finance' },
      { label: 'Payables', to: '/finance/payables', icon: ArrowUpCircle, module: 'finance' },
      { label: 'Expenses', to: '/finance/expenses', icon: Receipt, module: 'finance' },
      { label: 'Cash & Bank', to: '/finance/cash-bank', icon: Coins, module: 'finance' },
      { label: 'GST', to: '/finance/gst', icon: Percent, module: 'finance' },
      { label: 'Profit & Loss', to: '/finance/profit-loss', icon: TrendingUp, module: 'finance' },
    ],
  },
  {
    label: 'Reports',
    module: 'reports',
    items: [{ label: 'Reports Center', to: '/reports', icon: FileBarChart, module: 'reports' }],
  },
  {
    label: 'Settings',
    module: 'settings',
    items: [
      { label: 'Users', to: '/settings/users', icon: UserCog, module: 'users' },
      { label: 'Roles & Permissions', to: '/settings/roles', icon: ShieldCheck, module: 'settings' },
      { label: 'Store / Branch', to: '/settings/stores', icon: Store, module: 'settings' },
      { label: 'Tax Settings', to: '/settings/tax', icon: PercentIcon, module: 'settings' },
      { label: 'Invoice Settings', to: '/settings/invoice', icon: FileCog, module: 'settings' },
      { label: 'System Settings', to: '/settings/system', icon: SettingsIcon, module: 'settings' },
    ],
  },
  {
    label: null,
    items: [{ label: 'Audit Log', to: '/audit-log', icon: BarChart3, module: 'audit' }],
  },
];

export default NAV_SECTIONS;
