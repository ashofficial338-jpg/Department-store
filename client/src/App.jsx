import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';

import Login from './pages/auth/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
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
            <Route path="/data-entry" element={<DataEntry />} />

            <Route path="/pos" element={<POSBilling />} />
            <Route path="/sales/invoices" element={<SalesInvoices />} />
            <Route path="/sales/returns" element={<SalesReturns />} />
            <Route path="/sales/history" element={<SalesHistory />} />

            <Route path="/products" element={<ProductMaster />} />
            <Route path="/products/categories" element={<Categories />} />
            <Route path="/products/brands" element={<Brands />} />
            <Route path="/products/from-image" element={<ProductFromImage />} />
            <Route path="/products/batches" element={<Batches />} />
            <Route path="/products/pricing" element={<Pricing />} />

            <Route path="/inventory/overview" element={<StockOverview />} />
            <Route path="/inventory/adjustment" element={<StockAdjustment />} />
            <Route path="/inventory/transfer" element={<StockTransfer />} />
            <Route path="/inventory/ledger" element={<StockLedger />} />
            <Route path="/inventory/low-stock" element={<LowStock />} />
            <Route path="/inventory/expiry-management" element={<ExpiryManagement />} />

            <Route path="/dc/inward" element={<InwardDC />} />
            <Route path="/dc/outward" element={<OutwardDC />} />
            <Route path="/dc/history" element={<DCHistory />} />
            <Route path="/dc/stock" element={<DCStock />} />

            <Route path="/purchasing/orders" element={<PurchaseOrders />} />
            <Route path="/purchasing/invoices" element={<PurchaseOrders />} />
            <Route path="/purchasing/returns" element={<PurchaseReturns />} />
            <Route path="/purchasing/vendors" element={<Vendors />} />
            <Route path="/purchasing/suppliers" element={<Suppliers />} />

            <Route path="/customers" element={<CustomerMaster />} />
            <Route path="/customers/loyalty" element={<Loyalty />} />
            <Route path="/customers/outstanding" element={<Outstanding />} />

            <Route path="/finance/accounts" element={<Accounts />} />
            <Route path="/finance/receivables" element={<Receivables />} />
            <Route path="/finance/payables" element={<Payables />} />
            <Route path="/finance/expenses" element={<Expenses />} />
            <Route path="/finance/cash-bank" element={<CashBank />} />
            <Route path="/finance/gst" element={<GST />} />
            <Route path="/finance/profit-loss" element={<ProfitLoss />} />

            <Route path="/reports" element={<ReportsCenter />} />

            <Route path="/settings/users" element={<UsersSettings />} />
            <Route path="/settings/roles" element={<RolesSettings />} />
            <Route path="/settings/stores" element={<StoresSettings />} />
            <Route path="/settings/tax" element={<TaxSettings />} />
            <Route path="/settings/invoice" element={<InvoiceSettings />} />
            <Route path="/settings/system" element={<SystemSettings />} />

            <Route path="/audit-log" element={<AuditLogPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}
