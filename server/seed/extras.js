import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import AuditLog from '../models/AuditLog.js';
import ReportTemplate from '../models/ReportTemplate.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Expense from '../models/Expense.js';
import Payment from '../models/Payment.js';
import SalesReturn from '../models/SalesReturn.js';
import InwardDC from '../models/InwardDC.js';
import OutwardDC from '../models/OutwardDC.js';
import RackItem from '../models/RackItem.js';

// Fills the Audit Log and saved Report Templates, which `seed` and `seed:activity` leave empty.
// Run after them. Replaces any previous sample rows, so it is safe to re-run.
//   npm run seed:extras

const DAYS = 90;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/17.5',
  'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
];

// Which roles plausibly perform each action.
const ROLE_ACTIONS = {
  super_admin: ['settings.update', 'role.permissions_update', 'user.update', 'report.export'],
  admin: ['user.create', 'user.update', 'settings.update', 'report.export'],
  store_manager: ['sale.cancel', 'gst.override', 'inventory.adjust', 'rackitem.update'],
  dc_manager: ['dc.inward_process', 'dc.outward_advance', 'inventory.adjust'],
  cashier: ['sale.create', 'sale.create', 'sale.create', 'sale.return'],
  accountant: ['payment.create', 'expense.update', 'purchase.pay', 'report.export'],
  purchase_manager: ['purchase.create', 'purchase.receive', 'product.create'],
  inventory_manager: ['inventory.adjust', 'rackitem.create', 'rackitem.update', 'product.import'],
  sales_manager: ['report.export', 'sale.cancel', 'sale.return'],
  auditor: ['report.export'],
};

async function main() {
  await connectDB();

  const users = await User.find().select('name role').lean();
  if (!users.length) throw new Error('No users found. Run `npm run seed` first.');
  const byRole = Object.fromEntries(users.map((u) => [u.role, u]));
  const owner = byRole.super_admin || users[0];

  const [products, sales, purchases, expenses, payments, returns, inward, outward, racks] = await Promise.all([
    Product.find().select('name sellingPrice').limit(200).lean(),
    Sale.find().sort({ createdAt: -1 }).limit(500).select('invoiceNumber grandTotal').lean(),
    Purchase.find().sort({ createdAt: -1 }).limit(300).select('poNumber grandTotal').lean(),
    Expense.find().sort({ createdAt: -1 }).limit(200).select('amount category').lean(),
    Payment.find().limit(200).select('amount').lean(),
    SalesReturn.find().limit(100).select('_id').lean(),
    InwardDC.find().select('_id').lean(),
    OutwardDC.find().select('_id').lean(),
    RackItem.find().select('name rack quantity').lean(),
  ]);

  const entityFor = (action) => {
    const ref = (list, entity, fn) => {
      const doc = list.length ? pick(list) : null;
      return { entity, entityId: doc?._id, ...(doc && fn ? fn(doc) : {}) };
    };
    switch (action) {
      case 'sale.create': return ref(sales, 'Sale', (d) => ({ newValue: { invoiceNumber: d.invoiceNumber, total: d.grandTotal } }));
      case 'sale.cancel': return ref(sales, 'Sale', (d) => ({ oldValue: { status: 'completed' }, newValue: { status: 'cancelled', invoiceNumber: d.invoiceNumber } }));
      case 'sale.return': return ref(returns, 'SalesReturn', () => ({ newValue: { reason: pick(['Damaged', 'Wrong size', 'Expired', 'Customer changed mind']) } }));
      case 'gst.override': return ref(sales, 'Sale', () => ({ oldValue: { gstRate: 18 }, newValue: { gstRate: 12 } }));
      case 'purchase.create': return ref(purchases, 'Purchase', (d) => ({ newValue: { poNumber: d.poNumber, total: d.grandTotal } }));
      case 'purchase.receive': return ref(purchases, 'Purchase', (d) => ({ oldValue: { status: 'ordered' }, newValue: { status: 'received', poNumber: d.poNumber } }));
      case 'purchase.pay': return ref(purchases, 'Purchase', (d) => ({ newValue: { poNumber: d.poNumber, paid: d.grandTotal } }));
      case 'payment.create': return ref(payments, 'Payment', (d) => ({ newValue: { amount: d.amount } }));
      case 'expense.update': return ref(expenses, 'Expense', (d) => ({ oldValue: { amount: Math.round(d.amount * 0.9) }, newValue: { amount: d.amount } }));
      case 'product.create': return ref(products, 'Product', (d) => ({ newValue: { name: d.name, sellingPrice: d.sellingPrice } }));
      case 'product.import': return { entity: 'Product', newValue: { created: rand(5, 40), updated: rand(0, 20), failed: rand(0, 3) } };
      case 'inventory.adjust': {
        const q = rand(10, 80);
        return ref(products, 'Inventory', (d) => ({ oldValue: { product: d.name, quantity: q }, newValue: { product: d.name, quantity: q - rand(1, 5), reason: pick(['Damaged', 'Stock count', 'Expired']) } }));
      }
      case 'dc.inward_process': return ref(inward, 'InwardDC', () => ({ newValue: { status: 'processed' } }));
      case 'dc.outward_advance': return ref(outward, 'OutwardDC', () => ({ oldValue: { status: 'packed' }, newValue: { status: 'dispatched' } }));
      case 'rackitem.create': return ref(racks, 'RackItem', (d) => ({ newValue: { name: d.name, rack: d.rack } }));
      case 'rackitem.update': return ref(racks, 'RackItem', (d) => ({ oldValue: { quantity: d.quantity + 5 }, newValue: { quantity: d.quantity } }));
      case 'user.create': return ref(users, 'User', (d) => ({ newValue: { name: d.name, role: d.role } }));
      case 'user.update': return ref(users, 'User', (d) => ({ newValue: { name: d.name, isActive: true } }));
      case 'role.permissions_update': return { entity: 'RolePermission', newValue: { role: pick(['cashier', 'store_manager', 'accountant']), changed: rand(1, 4) } };
      case 'settings.update': return { entity: 'Settings', newValue: { section: pick(['store', 'invoice', 'tax', 'loyalty']) } };
      case 'report.export': return { entity: 'Report', newValue: { format: pick(['pdf', 'xlsx']), sections: ['summary', 'sales'], rows: rand(20, 400) } };
      default: return { entity: 'System' };
    }
  };

  const logs = [];
  const now = Date.now();
  for (let day = DAYS - 1; day >= 0; day -= 1) {
    const base = new Date(now - day * 86400000);
    base.setHours(9, 0, 0, 0);
    const working = users.filter(() => Math.random() < 0.75);
    for (const user of working) {
      const ip = `192.168.1.${rand(10, 60)}`;
      const ua = pick(AGENTS);
      let t = base.getTime() + rand(0, 90) * 60000;
      const at = () => new Date(Math.min((t += rand(5, 70) * 60000), now - 60000));
      logs.push({ user: user._id, userName: user.name, action: 'login', entity: 'User', entityId: user._id, ip, userAgent: ua, createdAt: at() });
      const actions = ROLE_ACTIONS[user.role] || ['report.export'];
      for (let i = rand(1, 4); i > 0; i -= 1) {
        const action = pick(actions);
        logs.push({ user: user._id, userName: user.name, action, ...entityFor(action), ip, userAgent: ua, createdAt: at() });
      }
    }
  }
  logs.forEach((l) => { l.updatedAt = l.createdAt; });

  await AuditLog.deleteMany({});
  await AuditLog.collection.insertMany(logs);

  const templates = [
    { name: 'Owner Weekly Review', description: 'Revenue, top products and expenses for the Monday review.', sections: ['summary', 'trend', 'products', 'expenses'], filters: { range: 'this_week', granularity: 'day' }, owner: owner._id, shared: true },
    { name: 'Month-end Finance Pack', description: 'P&L, cash flow, GST and outstanding balances for month-end close.', sections: ['summary', 'pnl', 'cashflow', 'gst', 'outstanding'], filters: { range: 'previous_month', granularity: 'week' }, owner: (byRole.accountant || owner)._id, shared: true },
    { name: 'Low Stock & Reorder', description: 'Stock alerts and inventory valuation for the purchase team.', sections: ['inventory', 'alerts', 'suppliers'], filters: { range: 'this_month', stockStatus: 'low' }, owner: (byRole.inventory_manager || owner)._id, shared: true },
    { name: 'Brand & Category Mix', description: 'Quarterly brand and category performance.', sections: ['brands', 'categories', 'trend'], filters: { range: 'this_quarter', granularity: 'month' }, owner: (byRole.sales_manager || owner)._id, shared: false },
    { name: 'Supplier Purchases', description: 'Purchases and supplier balances for the year.', sections: ['purchases', 'suppliers', 'outstanding'], filters: { range: 'this_year', granularity: 'month' }, owner: (byRole.purchase_manager || owner)._id, shared: true },
    { name: 'Daily Cashier Summary', description: 'Today\'s sales and transactions by payment method.', sections: ['sales', 'transactions'], filters: { range: 'today' }, owner: (byRole.store_manager || owner)._id, shared: false },
    { name: 'Top Customers', description: 'Best customers and sales trend over the previous quarter.', sections: ['customers', 'sales', 'trend'], filters: { range: 'previous_quarter', granularity: 'week' }, owner: owner._id, shared: true },
  ];
  await ReportTemplate.deleteMany({});
  await ReportTemplate.insertMany(templates);

  console.log(`[seed:extras] Audit log entries: ${logs.length} (last ${DAYS} days)`);
  console.log(`[seed:extras] Report templates:  ${templates.length}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(`[seed:extras] Failed: ${err.message}`);
  await mongoose.disconnect();
  process.exit(1);
});
