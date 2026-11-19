// Test harness: boots the real Express app in-process against a separate QA database
// (never the working database) and offers a tiny fetch-based API client.
import mongoose from 'mongoose';

const QA_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/department_store_qa';
if (!/_qa|_test/.test(QA_URI)) throw new Error(`Refusing to run tests against ${QA_URI} - use a *_qa or *_test database.`);
process.env.MONGODB_URI = QA_URI;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_automated_tests_only';

let server;
let base;

export async function start() {
  if (server) return base;
  const { default: app } = await import('../app.js');
  const { default: connectDB } = await import('../config/db.js');
  await connectDB();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  return base;
}

export async function stop() {
  if (server) await new Promise((r) => server.close(r));
  await mongoose.connection.close();
  server = null;
}

export async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, body: json };
}

// Signs a token directly (avoids the login rate limiter in tests that are not about login).
export async function tokenFor(email) {
  const { default: User } = await import('../models/User.js');
  const { default: generateToken } = await import('../utils/generateToken.js');
  const user = await User.findOne({ email });
  if (!user) throw new Error(`Test user ${email} not found in the QA database - restore it from the working database.`);
  return generateToken(user);
}

export const USERS = {
  admin: 'ashwinlav@gmail.com',
  cashier: 'cashier@aurelia.test',
  storeManager: 'storemanager@aurelia.test',
  accountant: 'accountant@aurelia.test',
  purchaseManager: 'purchasemanager@aurelia.test',
};

// A product with plenty of central stock, plus the (single) store it is sold from.
export async function stockedProduct(minQty = 20) {
  const { default: Inventory } = await import('../models/Inventory.js');
  const { default: Product } = await import('../models/Product.js');
  const { mainStoreId } = await import('../utils/storeGuard.js');
  const store = await mainStoreId();
  const inv = await Inventory.findOne({ store, currentStock: { $gte: minQty } }).sort({ currentStock: -1 });
  const product = await Product.findById(inv.product);
  return { product, store, stock: inv.currentStock };
}

// Central stock of a product - the row billing deducts from. (`storeId` kept for older call sites.)
// eslint-disable-next-line no-unused-vars
export async function stockOf(productId, storeId) {
  const { default: Inventory } = await import('../models/Inventory.js');
  const { mainStoreId } = await import('../utils/storeGuard.js');
  const inv = await Inventory.findOne({ product: productId, store: await mainStoreId() });
  return inv?.currentStock ?? 0;
}

// A verified, active vendor for purchase tests (POs, invoices and payments need one).
export async function verifiedVendor() {
  const { default: Vendor } = await import('../models/Vendor.js');
  const found = await Vendor.findOne({ name: 'QA Verified Vendor' });
  if (found) {
    if (found.verificationStatus !== 'verified' || found.status !== 'active') {
      await Vendor.updateOne({ _id: found._id }, { $set: { verificationStatus: 'verified', status: 'active' } });
    }
    return found._id;
  }
  const v = await Vendor.create({ name: 'QA Verified Vendor', phone: '9876543210', verificationStatus: 'verified', verifiedAt: new Date() });
  return v._id;
}
