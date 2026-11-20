// Product barcodes (unique, cleaned, freed on delete) and priced 'pcs' lines: catalogue price, stock checked
// and taken on save, given back on cancel. Runs on the QA DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS, stockOf } from './helpers.js';
import Inventory from '../models/Inventory.js';
import { mainStoreId } from '../utils/storeGuard.js';

let admin; let cashier; let P; let L;
const tag = Date.now().toString(36).toUpperCase();
const ean = `20${String(Date.now()).slice(-10)}`; // 12 digits; the check digit is not validated by the server
const code = `${ean}7`;

before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  cashier = await tokenFor(USERS.cashier);
});
after(stop);

test('BC-01 barcode is saved on the product, unique, and can be cleared', async () => {
  const r = await api('POST', '/products', { token: admin, body: { name: `QA Biscuit ${tag}`, barcode: ` ${code} `, mrp: 50, sellingPrice: 45, gstRate: 18 } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  P = r.body.data;
  assert.equal(P.barcode, code, 'trimmed');
  assert.equal(P.sellingPrice, 45);

  const dup = await api('POST', '/products', { token: admin, body: { name: `QA Other ${tag}`, barcode: code } });
  assert.equal(dup.status, 409, 'same barcode on a second product is refused');
  assert.equal((await api('POST', '/products', { token: admin, body: { name: `QA Bad ${tag}`, barcode: `has space${tag}` } })).status, 201,
    'spaces are removed, so "has space" is stored as "hasspace"');
  assert.equal((await api('POST', '/products', { token: admin, body: { name: `QA Bad2 ${tag}`, barcode: 'é€' } })).status, 400, 'non-printable code refused');
  assert.equal((await api('PUT', `/products/${P._id}`, { token: admin, body: { sellingPrice: 60 } })).status, 400, 'selling price above MRP refused');

  const l = await api('POST', '/products', { token: admin, body: { name: `QA Loose Rice ${tag}`, barcode: '' } });
  assert.equal(l.status, 201, 'empty barcode = none');
  L = l.body.data;
  assert.equal(L.barcode, undefined);
  const l2 = await api('POST', '/products', { token: admin, body: { name: `QA Loose Dal ${tag}`, barcode: '' } });
  assert.equal(l2.status, 201, 'several products without a barcode are fine');

  const store = await mainStoreId();
  await Inventory.updateOne({ product: P._id, store }, { $set: { currentStock: 5 } }, { upsert: true });
});

test('BC-03 scanned pcs line: catalogue price, GST, stock taken; client rate ignored', async () => {
  const body = {
    items: [
      { product: P._id, quantity: 2, unit: 'pcs', rate: 1 }, // rate is ignored -> 2 x 45 = 90, GST 18% = 16.20
      { product: L._id, quantity: 500, unit: 'g', rate: 60 }, // loose line unchanged: 30, no stock
    ],
    paymentMethod: 'cash',
    clientRequestId: `qa-bc-${tag}`,
  };
  const r = await api('POST', '/sales/simple', { token: cashier, body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const sale = r.body.data;
  assert.equal(sale.items[0].unit, 'pcs');
  assert.equal(sale.items[0].unitPrice, 45);
  assert.equal(sale.items[0].taxableAmount, 90);
  assert.equal(sale.items[0].taxAmount, 16.2);
  assert.equal(sale.grandTotal, 136.2);
  assert.equal(await stockOf(P._id), 3, 'stock 5 -> 3');

  const again = await api('POST', '/sales/simple', { token: cashier, body });
  assert.equal(again.status, 200, 'retry returns the same bill');
  assert.equal(await stockOf(P._id), 3, 'retry does not take stock twice');

  const cancel = await api('POST', `/sales/${sale._id}/cancel`, { token: admin });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal(await stockOf(P._id), 5, 'cancel gives the pieces back');
});

test('BC-04 not enough stock / fractions / no price are refused and nothing changes', async () => {
  const over = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: P._id, quantity: 6, unit: 'pcs' }], paymentMethod: 'cash' } });
  assert.equal(over.status, 400);
  assert.match(over.body.message, /Only 5/);
  assert.equal(await stockOf(P._id), 5);

  const frac = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: P._id, quantity: 1.5, unit: 'pcs' }], paymentMethod: 'cash' } });
  assert.equal(frac.status, 400, 'pieces must be whole');

  const noPrice = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: L._id, quantity: 1, unit: 'pcs' }], paymentMethod: 'cash' } });
  assert.equal(noPrice.status, 400, 'a name-only product needs the rate typed');
});

test('BC-05 deleting a product frees its barcode', async () => {
  assert.equal((await api('DELETE', `/products/${P._id}`, { token: admin })).status, 200);
  const r = await api('POST', '/products', { token: admin, body: { name: `QA Biscuit New ${tag}`, barcode: code } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
});
