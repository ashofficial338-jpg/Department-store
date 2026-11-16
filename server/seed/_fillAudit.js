import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';

// One-off: realistic audit trail for the seeded demo data (last 60 days). Adds only; removes nothing.
await connectDB();
const { db } = mongoose.connection;
const users = await User.find().lean();
const byRole = (...roles) => users.filter((u) => roles.includes(u.role));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sample = async (col, n, projection = {}) => db.collection(col).aggregate([{ $sample: { size: n } }, { $project: { _id: 1, ...projection } }]).toArray();
const AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
];
const ipOf = (u) => `192.168.1.${20 + (parseInt(String(u._id).slice(-2), 16) % 60)}`;

const rows = [];
const add = (user, action, entity, entityId, at, newValue = null, oldValue = null) => rows.push({
  user: user._id, userName: user.name, action, entity, entityId, oldValue, newValue, ip: ipOf(user), userAgent: pick(AGENTS), createdAt: at, updatedAt: at,
});
const at = (daysBack, hour, minute = Math.floor(Math.random() * 60)) => {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hour, minute, Math.floor(Math.random() * 60), 0);
  return d > new Date() ? new Date(Date.now() - 60000 * (1 + Math.floor(Math.random() * 30))) : d;
};

const [sales, purchases, products, customers, inward, outward, returns, payments, expenses, racks] = await Promise.all([
  sample('sales', 90, { invoiceNumber: 1, grandTotal: 1 }),
  sample('purchases', 50, { poNumber: 1, grandTotal: 1 }),
  sample('products', 40, { name: 1, sku: 1 }),
  sample('customers', 25, { name: 1, phone: 1 }),
  sample('inwarddcs', 12, { dcNumber: 1 }),
  sample('outwarddcs', 12, { dcNumber: 1 }),
  sample('salesreturns', 15, { returnNumber: 1 }),
  sample('payments', 30, { amount: 1, method: 1 }),
  sample('expenses', 12, { description: 1, amount: 1 }),
  sample('products', 10, { name: 1 }),
]);

const admins = byRole('super_admin', 'admin');
const cashiers = byRole('cashier', 'store_manager', 'sales_manager');
const buyers = byRole('purchase_manager', 'admin');
const stock = byRole('inventory_manager', 'dc_manager', 'store_manager');
const finance = byRole('accountant', 'admin');
const any = (list) => pick(list.length ? list : users);
const day = () => Math.floor(Math.random() * 60);

// Daily sign-ins.
for (let d = 0; d < 60; d++) for (const u of users) if (Math.random() < 0.55) add(u, 'login', 'User', u._id, at(d, 8 + Math.floor(Math.random() * 3)));

sales.forEach((s) => add(any(cashiers), 'sale.create', 'Sale', s._id, at(day(), 10 + Math.floor(Math.random() * 10)), { invoiceNumber: s.invoiceNumber, grandTotal: s.grandTotal }));
sales.slice(0, 6).forEach((s) => add(any(admins), 'sale.cancel', 'Sale', s._id, at(day(), 17), { invoiceNumber: s.invoiceNumber, reason: pick(['Duplicate bill', 'Customer changed mind', 'Wrong item billed']) }));
returns.forEach((r) => add(any(cashiers), 'sale.return', 'SalesReturn', r._id, at(day(), 15), { returnNumber: r.returnNumber }));
purchases.forEach((p, i) => {
  const d = day();
  add(any(buyers), 'purchase.create', 'Purchase', p._id, at(d, 11), { poNumber: p.poNumber, grandTotal: p.grandTotal });
  if (i % 2 === 0) add(any(stock), 'purchase.receive', 'Purchase', p._id, at(Math.max(0, d - 2), 14), { poNumber: p.poNumber });
  if (i % 3 === 0) add(any(finance), 'purchase.pay', 'Purchase', p._id, at(Math.max(0, d - 5), 16), { poNumber: p.poNumber, amount: p.grandTotal });
});
products.forEach((p, i) => {
  add(any(admins), 'product.create', 'Product', p._id, at(30 + Math.floor(Math.random() * 30), 12), { name: p.name, sku: p.sku });
  if (i % 4 === 0) add(any(stock), 'inventory.adjust', 'Product', p._id, at(day(), 18), { name: p.name, quantity: pick([-3, -2, -1, 2, 5]), reason: pick(['Damaged in store', 'Stock count correction', 'Expired - written off', 'Found during audit']) });
  if (i % 9 === 0) add(any(finance), 'gst.override', 'Product', p._id, at(day(), 13), { gstRate: pick([5, 12, 18]) }, { gstRate: pick([0, 5, 12]) });
});
customers.forEach((c, i) => {
  add(any(cashiers), 'customer.create', 'Customer', c._id, at(day(), 12), { name: c.name, phone: c.phone });
  if (i % 3 === 0) add(any(admins), 'customer.update', 'Customer', c._id, at(day(), 16), { name: c.name });
});
inward.forEach((x) => add(any(stock), 'dc.inward_process', 'InwardDC', x._id, at(day(), 11), { dcNumber: x.dcNumber }));
outward.forEach((x) => add(any(stock), 'dc.outward_advance', 'OutwardDC', x._id, at(day(), 15), { dcNumber: x.dcNumber, status: pick(['dispatched', 'in_transit', 'delivered']) }));
payments.forEach((p) => add(any(finance), 'payment.create', 'Payment', p._id, at(day(), 17), { amount: p.amount, method: p.method }));
expenses.forEach((e) => add(any(finance), 'expense.update', 'Expense', e._id, at(day(), 18), { description: e.description, amount: e.amount }));
racks.forEach((p) => add(any(stock), 'rackitem.update', 'RackItem', p._id, at(day(), 10), { name: p.name, rack: pick(['A', 'B', 'C', 'D']) }));
users.filter((u) => u.role !== 'super_admin').forEach((u) => add(admins[0], 'user.create', 'User', u._id, at(59, 9), { name: u.name, role: u.role }));
users.slice(0, 3).forEach((u) => add(u, 'user.password_change', 'User', u._id, at(day(), 9)));
for (const role of ['cashier', 'store_manager', 'accountant']) add(admins[0], 'role.permissions_update', 'RolePermission', undefined, at(day(), 19), { role });
['companyName', 'invoicePrefix', 'lowStockAlerts'].forEach((k) => add(admins[0], 'settings.update', 'Settings', undefined, at(day(), 20), { field: k }));
for (let i = 0; i < 14; i++) add(any(finance), 'report.export', 'Report', undefined, at(day(), 18), { format: pick(['pdf', 'xlsx']), sections: pick([['sales'], ['inventory', 'purchases'], ['finance']]) });
for (let i = 0; i < 8; i++) add(any(admins), 'dashboard.export', 'Dashboard', undefined, at(day(), 19), { metric: pick(['revenue', 'profit', 'stock-value', 'receivables']) });

await AuditLog.insertMany(rows, { timestamps: false });
console.log(`[fill] audit log entries added: ${rows.length} (total now ${await AuditLog.countDocuments()})`);
await mongoose.connection.close();
