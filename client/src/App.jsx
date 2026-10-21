import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import RequirePermission from './routes/RequirePermission.jsx';
import PageLoader from './components/ui/PageLoader.jsx';

// Pages are code-split: each screen's code downloads the first time it is opened (sign-in stays in the main bundle).

import Login from './pages/auth/Login.jsx';
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const DashboardDetails = lazy(() => import('./pages/DashboardDetails.jsx'));
const ItrAnalysis = lazy(() => import('./pages/analytics/ItrAnalysis.jsx'));
const DataEntry = lazy(() => import('./pages/DataEntry.jsx'));

const POSBilling = lazy(() => import('./pages/pos/POSBilling.jsx'));
const SalesInvoices = lazy(() => import('./pages/sales/SalesInvoices.jsx'));
const SalesReturns = lazy(() => import('./pages/sales/SalesReturns.jsx'));
const SalesHistory = lazy(() => import('./pages/sales/SalesHistory.jsx'));

const ProductMaster = lazy(() => import('./pages/products/ProductMaster.jsx'));
const Categories = lazy(() => import('./pages/products/Categories.jsx'));
const Brands = lazy(() => import('./pages/products/Brands.jsx'));
const ProductFromImage = lazy(() => import('./pages/products/ProductFromImage.jsx'));
const Batches = lazy(() => import('./pages/products/Batches.jsx'));
const Pricing = lazy(() => import('./pages/products/Pricing.jsx'));

const StockOverview = lazy(() => import('./pages/inventory/StockOverview.jsx'));
const StockAdjustment = lazy(() => import('./pages/inventory/StockAdjustment.jsx'));
const StockTransfer = lazy(() => import('./pages/inventory/StockTransfer.jsx'));
const StockLedger = lazy(() => import('./pages/inventory/StockLedger.jsx'));
const LowStock = lazy(() => import('./pages/inventory/LowStock.jsx'));
const ExpiryManagement = lazy(() => import('./pages/inventory/ExpiryManagement.jsx'));
const RackLocator = lazy(() => import('./pages/inventory/RackLocator.jsx'));

const InwardDC = lazy(() => import('./pages/dc/InwardDC.jsx'));
const OutwardDC = lazy(() => import('./pages/dc/OutwardDC.jsx'));
const DCHistory = lazy(() => import('./pages/dc/DCHistory.jsx'));
const DCStock = lazy(() => import('./pages/dc/DCStock.jsx'));

const PurchaseOrders = lazy(() => import('./pages/purchasing/PurchaseOrders.jsx'));
const PurchaseReturns = lazy(() => import('./pages/purchasing/PurchaseReturns.jsx'));
const Vendors = lazy(() => import('./pages/purchasing/Vendors.jsx'));
const Suppliers = lazy(() => import('./pages/purchasing/Suppliers.jsx'));

const CustomerMaster = lazy(() => import('./pages/customers/CustomerMaster.jsx'));
const Loyalty = lazy(() => import('./pages/customers/Loyalty.jsx'));
const Outstanding = lazy(() => import('./pages/customers/Outstanding.jsx'));

const Accounts = lazy(() => import('./pages/finance/Accounts.jsx'));
const Receivables = lazy(() => import('./pages/finance/Receivables.jsx'));
const Payables = lazy(() => import('./pages/finance/Payables.jsx'));
const Expenses = lazy(() => import('./pages/finance/Expenses.jsx'));
const CashBank = lazy(() => import('./pages/finance/CashBank.jsx'));
const GST = lazy(() => import('./pages/finance/GST.jsx'));
const ProfitLoss = lazy(() => import('./pages/finance/ProfitLoss.jsx'));

const ReportsCenter = lazy(() => import('./pages/reports/ReportsCenter.jsx'));
const AdvancedReports = lazy(() => import('./pages/reports/AdvancedReports.jsx'));

const UsersSettings = lazy(() => import('./pages/settings/UsersSettings.jsx'));
const RolesSettings = lazy(() => import('./pages/settings/RolesSettings.jsx'));
const StoresSettings = lazy(() => import('./pages/settings/StoresSettings.jsx'));
const TaxSettings = lazy(() => import('./pages/settings/TaxSettings.jsx'));
const InvoiceSettings = lazy(() => import('./pages/settings/InvoiceSettings.jsx'));
const SystemSettings = lazy(() => import('./pages/settings/SystemSettings.jsx'));

const AuditLogPage = lazy(() => import('./pages/AuditLog.jsx'));

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        gutter={10}
        toastOptions={{
          duration: 3500,
          style: {
            fontSize: '13px',
            fontWeight: 500,
            borderRadius: '14px',
            padding: '12px 14px',
            color: 'var(--text-primary)',
            background: 'color-mix(in srgb, var(--bg-surface) 90%, transparent)',
            backdropFilter: 'blur(14px)',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 20px 40px -20px rgba(17,18,24,0.45)',
          },
          success: { iconTheme: { primary: '#C29A56', secondary: '#fff' } },
          error: { iconTheme: { primary: '#E11D48', secondary: '#fff' } },
        }}
      />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/details/:metric" element={<RequirePermission any={['dashboard.details']}><DashboardDetails /></RequirePermission>} />
            <Route path="/analytics/itr" element={<RequirePermission any={['dashboard.inventory']}><ItrAnalysis /></RequirePermission>} />
            <Route path="/data-entry" element={<RequirePermission any={['dashboard']}><DataEntry /></RequirePermission>} />

            <Route path="/pos" element={<RequirePermission any={['pos']}><POSBilling /></RequirePermission>} />
            <Route path="/sales/invoices" element={<RequirePermission any={['sales', 'pos']}><SalesInvoices /></RequirePermission>} />
            <Route path="/sales/returns" element={<RequirePermission any={['sales']}><SalesReturns /></RequirePermission>} />
            <Route path="/sales/history" element={<RequirePermission any={['sales', 'pos']}><SalesHistory /></RequirePermission>} />

            <Route path="/products" element={<RequirePermission any={['products']}><ProductMaster /></RequirePermission>} />
            <Route path="/products/categories" element={<RequirePermission any={['products']}><Categories /></RequirePermission>} />
            <Route path="/products/brands" element={<RequirePermission any={['products']}><Brands /></RequirePermission>} />
            <Route path="/products/from-image" element={<RequirePermission any={['products']}><ProductFromImage /></RequirePermission>} />
            <Route path="/products/batches" element={<RequirePermission any={['products']}><Batches /></RequirePermission>} />
            <Route path="/products/pricing" element={<RequirePermission any={['products']}><Pricing /></RequirePermission>} />

            <Route path="/inventory/racks" element={<RequirePermission any={['inventory', 'products']}><RackLocator /></RequirePermission>} />
            <Route path="/inventory/overview" element={<RequirePermission any={['inventory']}><StockOverview /></RequirePermission>} />
            <Route path="/inventory/adjustment" element={<RequirePermission any={['inventory']}><StockAdjustment /></RequirePermission>} />
            <Route path="/inventory/transfer" element={<RequirePermission any={['inventory']}><StockTransfer /></RequirePermission>} />
            <Route path="/inventory/ledger" element={<RequirePermission any={['inventory']}><StockLedger /></RequirePermission>} />
            <Route path="/inventory/low-stock" element={<RequirePermission any={['inventory']}><LowStock /></RequirePermission>} />
            <Route path="/inventory/expiry-management" element={<RequirePermission any={['inventory']}><ExpiryManagement /></RequirePermission>} />

            <Route path="/dc/inward" element={<RequirePermission any={['dc']}><InwardDC /></RequirePermission>} />
            <Route path="/dc/outward" element={<RequirePermission any={['dc']}><OutwardDC /></RequirePermission>} />
            <Route path="/dc/history" element={<RequirePermission any={['dc']}><DCHistory /></RequirePermission>} />
            <Route path="/dc/stock" element={<RequirePermission any={['dc']}><DCStock /></RequirePermission>} />

            <Route path="/purchasing/orders" element={<RequirePermission any={['purchasing']}><PurchaseOrders /></RequirePermission>} />
            <Route path="/purchasing/invoices" element={<RequirePermission any={['purchasing']}><PurchaseOrders /></RequirePermission>} />
            <Route path="/purchasing/returns" element={<RequirePermission any={['purchasing']}><PurchaseReturns /></RequirePermission>} />
            <Route path="/purchasing/vendors" element={<RequirePermission any={['vendors']}><Vendors /></RequirePermission>} />
            <Route path="/purchasing/suppliers" element={<RequirePermission any={['vendors']}><Suppliers /></RequirePermission>} />

            <Route path="/customers" element={<RequirePermission any={['customers']}><CustomerMaster /></RequirePermission>} />
            <Route path="/customers/loyalty" element={<RequirePermission any={['customers']}><Loyalty /></RequirePermission>} />
            <Route path="/customers/outstanding" element={<RequirePermission any={['customers']}><Outstanding /></RequirePermission>} />

            <Route path="/finance/accounts" element={<RequirePermission any={['finance']}><Accounts /></RequirePermission>} />
            <Route path="/finance/receivables" element={<RequirePermission any={['finance']}><Receivables /></RequirePermission>} />
            <Route path="/finance/payables" element={<RequirePermission any={['finance']}><Payables /></RequirePermission>} />
            <Route path="/finance/expenses" element={<RequirePermission any={['finance']}><Expenses /></RequirePermission>} />
            <Route path="/finance/cash-bank" element={<RequirePermission any={['finance']}><CashBank /></RequirePermission>} />
            <Route path="/finance/gst" element={<RequirePermission any={['finance']}><GST /></RequirePermission>} />
            <Route path="/finance/profit-loss" element={<RequirePermission any={['finance']}><ProfitLoss /></RequirePermission>} />

            <Route path="/reports" element={<RequirePermission any={['reports']}><ReportsCenter /></RequirePermission>} />
            <Route path="/reports/analytics" element={<RequirePermission any={['reports']}><AdvancedReports /></RequirePermission>} />

            <Route path="/settings/users" element={<RequirePermission admin><UsersSettings /></RequirePermission>} />
            <Route path="/settings/roles" element={<RequirePermission admin><RolesSettings /></RequirePermission>} />
            <Route path="/settings/stores" element={<RequirePermission admin><StoresSettings /></RequirePermission>} />
            <Route path="/settings/tax" element={<RequirePermission admin><TaxSettings /></RequirePermission>} />
            <Route path="/settings/invoice" element={<RequirePermission admin><InvoiceSettings /></RequirePermission>} />
            <Route path="/settings/system" element={<RequirePermission admin><SystemSettings /></RequirePermission>} />

            <Route path="/audit-log" element={<RequirePermission any={['audit']}><AuditLogPage /></RequirePermission>} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}
