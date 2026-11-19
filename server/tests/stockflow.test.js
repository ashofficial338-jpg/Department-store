// Single department store: purchase -> inventory -> POS billing on ONE central stock per product.
// Whatever store or distribution center a screen sends, stock lands on the same central row; Inventory and
// POS show the same quantity; billing deducts it; a bill can never take it below zero. Runs on the QA DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS, verifiedVendor } from './helpers.js';
import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import Store from '../models/Store.js';
import Vendor from '../models/Vendor.js';
import DistributionCenter from '../models/DistributionCenter.js';
import { getMainStore } from '../utils/storeGuard.js';

let admin; let cashier; let P; let main; let otherStore; let dc; let vendor;
const cash = (amount) => [{ method: 'cash', amount }];

// Central stock as the database holds it (all rows for the product).
async function central() {
  const rows = await Inventory.find({ product: P._id }).lean();
  return { total: rows.reduce((s, r) => s + (r.currentStock || 0), 0), rows };
}
async function posStock(store) {
  const r = await api('GET', `/products?withStock=true&status=active&store=${store}&search=${encodeURIComponent(P.sku)}`, { token: cashier });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data.find((p) => String(p._id) === String(P._id)).stock;
}
async function inventoryStock() {
  const r = await api('GET', `/inventory/overview?search=${encodeURIComponent(P.sku)}`, { token: admin });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data.filter((row) => String(row.product?._id) === String(P._id)).reduce((s, row) => s + row.currentStock, 0);
}
async function assertSame(expected, msg) {
  const { total, rows } = await central();
  assert.equal(total, expected, `${msg}: database`);
  assert.equal(rows.length, 1, `${msg}: one central inventory row`);
  assert.equal(String(rows[0].store), String(main._id), `${msg}: held at the main store`);
  assert.equal(await inventoryStock(), expected, `${msg}: Inventory page`);
  assert.equal(await posStock(main._id), expected, `${msg}: POS`);
  if (otherStore) assert.equal(await posStock(otherStore), expected, `${msg}: POS ignores the store picked`);
}
// Purchase Order -> Purchase Invoice -> Inward DC (submitted): the only way purchased stock comes in.
async function receiveViaInvoice(quantity, poExtra = {}) {
  const po = await api('POST', '/purchases', { token: admin, body: { vendor, ...poExtra, items: [{ product: P._id, quantity, unitPrice: 10, gstRate: 0 }] } });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  const inv = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: po.body.data._id, items: [{ product: P._id, quantity }] } });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  const dcDoc = await api('POST', '/dc/inward', { token: admin, body: { purchaseInvoice: inv.body.data._id, ...(poExtra.distributionCenter ? { distributionCenter: poExtra.distributionCenter } : {}) } });
  assert.equal(dcDoc.status, 201, JSON.stringify(dcDoc.body));
  const done = await api('POST', `/dc/inward/${dcDoc.body.data._id}/process`, { token: admin, body: { items: [{ product: P._id, receivedQuantity: quantity, qualityCheckPassed: true }] } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return { po: po.body.data, invoice: inv.body.data, dc: dcDoc.body.data };
}
async function sell(quantity, store = main._id) {
  const pr = await api('POST', '/sales/preview', { token: cashier, body: { items: [{ product: P._id, quantity }] } });
  return api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity }], payments: cash(pr.body.data.summary.grandTotal) } });
}

before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  cashier = await tokenFor(USERS.cashier);
  main = await getMainStore();
  otherStore = (await Store.findOne({ _id: { $ne: main._id }, isActive: { $ne: false } }))?._id;
  dc = (await DistributionCenter.findOne({ status: { $ne: 'inactive' } }))._id;
  vendor = await verifiedVendor();
  // A fresh product (copy of an existing one) so the quantities below are exact.
  const tpl = await Product.findOne({ status: 'active' }).lean();
  const tag = Date.now().toString(36).toUpperCase();
  const { _id, createdAt, updatedAt, __v, barcode, ...fields } = tpl; // eslint-disable-line no-unused-vars
  P = await Product.create({ ...fields, sku: `QAFLOW${tag}`, name: `QA Flow Item ${tag}` });
});
after(stop);

test('FLOW-01 goods received on an Inward DC (even "at a DC") become central stock that POS can sell', async () => {
  await receiveViaInvoice(5, { distributionCenter: dc });
  await assertSame(5, 'after purchase receipt');
});

test('FLOW-02 inward DC and stock adjustments add to the same central stock', async () => {
  await receiveViaInvoice(3, { distributionCenter: dc });
  await assertSame(8, 'after inward DC');

  const adj = await api('POST', '/inventory/adjust', { token: admin, body: { product: P._id, distributionCenter: dc, quantity: 2, notes: 'qa' } });
  assert.equal(adj.status, 200, JSON.stringify(adj.body));
  await assertSame(10, 'after adjustment');

  // A transfer between "locations" leaves the one central stock unchanged once completed.
  const t = await api('POST', '/inventory/transfers', { token: admin, body: { sourceType: 'DistributionCenter', source: dc, destinationType: 'Store', destination: main._id, items: [{ product: P._id, quantity: 4 }] } });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  assert.equal((await api('POST', `/inventory/transfers/${t.body.data._id}/complete`, { token: admin })).status, 200);
  await assertSame(10, 'after transfer');
});

test('FLOW-03 POS bills the stock Inventory shows, deducts it, and never goes negative', async () => {
  const s1 = await sell(6, otherStore || main._id); // whichever store the till has selected
  assert.equal(s1.status, 201, JSON.stringify(s1.body));
  await assertSame(4, 'after billing 6');

  const over = await sell(5);
  assert.equal(over.status, 400, 'cannot bill more than the stock');
  await assertSame(4, 'failed bill leaves stock unchanged');

  assert.equal((await api('POST', `/sales/${s1.body.data._id}/cancel`, { token: admin })).status, 200);
  await assertSame(10, 'cancelling the bill puts the stock back');

  assert.equal((await sell(10)).status, 201, 'all 10 units can be billed');
  await assertSame(0, 'sold out');
  const none = await sell(1);
  assert.equal(none.status, 400);
  assert.match(none.body.message, /out of stock/i);
  await assertSame(0, 'never negative');
});

test('FLOW-04 single department: no store or DC needs to be chosen anywhere', async () => {
  await assertSame(0, 'start');
  const { po, invoice } = await receiveViaInvoice(3);
  assert.equal(String(po.store), String(main._id), 'purchase belongs to the department store');
  await assertSame(3, 'inward DC without a distribution center');

  const adj = await api('POST', '/inventory/adjust', { token: admin, body: { product: P._id, quantity: 2, notes: 'qa' } });
  assert.equal(adj.status, 200, JSON.stringify(adj.body));
  await assertSame(5, 'adjustment without a store');

  const pr = await api('POST', '/sales/preview', { token: cashier, body: { items: [{ product: P._id, quantity: 1 }] } });
  const sale = await api('POST', '/sales', { token: cashier, body: { items: [{ product: P._id, quantity: 1 }], payments: cash(pr.body.data.summary.grandTotal) } });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  assert.equal(String(sale.body.data.store), String(main._id));
  await assertSame(4, 'POS bill without a store');

  const ret = await api('POST', '/purchases/returns', { token: admin, body: { purchaseInvoiceId: invoice._id, items: [{ product: P._id, quantity: 2 }] } });
  assert.equal(ret.status, 201, JSON.stringify(ret.body));
  const out = await api('POST', '/dc/outward', { token: admin, body: { purchaseReturn: ret.body.data._id } });
  assert.equal(out.status, 201, JSON.stringify(out.body));
  const sub = await api('POST', `/dc/outward/${out.body.data._id}/submit`, { token: admin, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  assert.equal((await api('POST', `/dc/outward/${out.body.data._id}/submit`, { token: admin, body: {} })).status, 400, 'second submit refused');
  await assertSame(2, 'outward DC without a destination takes the stock out once');
});
