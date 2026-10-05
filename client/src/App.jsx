import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import RequirePermission from './routes/RequirePermission.jsx';

import Login from './pages/auth/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DashboardDetails from './pages/DashboardDetails.jsx';
import DataEntry from './pages/DataEntry.jsx';

import POSBilling from './pages/pos/POSBilling.jsx';
import SalesInvoices from './pages/sales/SalesInvoices.jsx';
import SalesReturns from './pages/sales/SalesReturns.jsx';
import SalesHistory from './pages/sales/SalesHistory.jsx';

import ProductMaster from './pages/products/ProductMaster.jsx';
import Categories from './pages/products/Categories.jsx';
import Brands from './pages/products/Brands.jsx';
import ProductFromImage from './pages/products/ProductFromImage.jsx';
import Batches from './pages/products/Batches.jsx';
import Pricing from './pages/products/Pricing.jsx';

import StockOverview from './pages/inventory/StockOverview.jsx';
import StockAdjustment from './pages/inventory/StockAdjustment.jsx';
import StockTransfer from './pages/inventory/StockTransfer.jsx';
import StockLedger from './pages/inventory/StockLedger.jsx';
import LowStock from './pages/inventory/LowStock.jsx';
import ExpiryManagement from './pages/inventory/ExpiryManagement.jsx';

import InwardDC from './pages/dc/InwardDC.jsx';
import OutwardDC from './pages/dc/OutwardDC.jsx';
import DCHistory from './pages/dc/DCHistory.jsx';
import DCStock from './pages/dc/DCStock.jsx';

import PurchaseOrders from './pages/purchasing/PurchaseOrders.jsx';
import PurchaseReturns from './pages/purchasing/PurchaseReturns.jsx';
import Vendors from './pages/purchasing/Vendors.jsx';
import Suppliers from './pages/purchasing/Suppliers.jsx';

import CustomerMaster from './pages/customers/CustomerMaster.jsx';
import Loyalty from './pages/customers/Loyalty.jsx';
import Outstanding from './pages/customers/Outstanding.jsx';

import Accounts from './pages/finance/Accounts.jsx';
import Receivables from './pages/finance/Receivables.jsx';
import Payables from './pages/finance/Payables.jsx';
import Expenses from './pages/finance/Expenses.jsx';
import CashBank from './pages/finance/CashBank.jsx';
import GST from './pages/finance/GST.jsx';
import ProfitLoss from './pages/finance/ProfitLoss.jsx';

import ReportsCenter from './pages/reports/ReportsCenter.jsx';

import UsersSettings from './pages/settings/UsersSettings.jsx';
import RolesSettings from './pages/settings/RolesSettings.jsx';
import StoresSettings from './pages/settings/StoresSettings.jsx';
import TaxSettings from './pages/settings/TaxSettings.jsx';
import InvoiceSettings from './pages/settings/InvoiceSettings.jsx';
import SystemSettings from './pages/settings/SystemSettings.jsx';

import AuditLogPage from './pages/AuditLog.jsx';

export default function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { fontSize: '13px', borderRadius: '10px' } }} />
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/details/:metric" element={<RequirePermission any={['dashboard.details']}><DashboardDetails /></RequirePermission>} />
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
    </>
  );
}
