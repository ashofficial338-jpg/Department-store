// Product Master full details (2026-11-22): brands by name (no duplicates), sub-category, attributes, HSN, purchase
// price, stock limits, preferred supplier; admin-only edits; the product overview (stock by brand, purchases, sales).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS, verifiedVendor } from './helpers.js';

let admin; let pm; let cashier; let vendor; let P;
const tag = Date.now().toString(36).toUpperCase();

before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  pm = await tokenFor(USERS.purchaseManager);
  cashier = await tokenFor(USERS.cashier);
  vendor = await verifiedVendor();
});
after(stop);

test('PD-01 create a product with full details; brands and sub-category are created once', async () => {
  const body = {
    name: `QA Sona Masoori ${tag}`, categoryName: `QA Rice ${tag}`, subcategoryName: 'Raw Rice', hsn: '1006',
    description: 'Premium raw rice', brandName: `QA Brand A ${tag}`, brandNames: [`QA Brand A ${tag}`, `qa brand b ${tag}`],
    purchasePrice: 52.5, sellingPrice: 60, mrp: 65, gstRate: 5, reorderLevel: 20, minStock: 5, maxStock: 500, shelfLifeDays: 270,
    primaryVendor: vendor, attributes: [{ name: 'Variety', value: 'Sona Masoori' }, { name: 'Origin', value: 'Andhra' }, { name: '', value: 'x' }],
  };
  const r = await api('POST', '/products', { token: admin, body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  P = r.body.data;
  assert.equal(P.brands.length, 2);
  assert.ok(P.brand);
  assert.equal(P.attributes.length, 2, 'empty attribute rows dropped');
  assert.equal(P.purchasePrice, 52.5);
  assert.ok(P.subcategory);

  const full = (await api('GET', `/products/${P._id}`, { token: admin })).body.data;
  assert.equal(full.brand.name, `QA Brand A ${tag}`);
  assert.equal(full.subcategory.name, 'Raw Rice');
  assert.equal(full.primaryVendor._id, String(vendor));

  const again = await api('POST', '/products', { token: admin, body: { name: `QA Other ${tag}`, brandNames: [`QA BRAND B ${tag}`] } });
  assert.equal(again.body.data.brands[0], P.brands[1], 'existing brand re-used (any letter case)');
  assert.equal((await api('POST', '/products', { token: admin, body: { name: `QA Bad ${tag}`, hsn: '12ab' } })).status, 400, 'HSN digits only');
  assert.equal((await api('POST', '/products', { token: admin, body: { name: `QA Bad2 ${tag}`, minStock: 50, maxStock: 10 } })).status, 400, 'min <= max');
  assert.equal((await api('POST', '/products', { token: admin, body: { name: `QA Bad3 ${tag}`, purchasePrice: -1 } })).status, 400);
});

test('PD-02 only admins edit; edits keep everything else; SKU stays unique', async () => {
  assert.equal((await api('PUT', `/products/${P._id}`, { token: pm, body: { mrp: 70 } })).status, 403);
  const upd = await api('PUT', `/products/${P._id}`, { token: admin, body: { brandNames: [`QA Brand A ${tag}`], attributes: [{ name: 'Variety', value: 'Sona' }], shelfLifeDays: '' } });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.data.brands.length, 1);
  assert.equal(upd.body.data.attributes[0].value, 'Sona');
  assert.equal(upd.body.data.shelfLifeDays, undefined, 'cleared');
  assert.equal(upd.body.data.purchasePrice, 52.5, 'untouched fields kept');
  const other = (await api('GET', `/products?search=${encodeURIComponent(`QA Other ${tag}`)}`, { token: admin })).body.data[0];
  assert.equal((await api('PUT', `/products/${P._id}`, { token: admin, body: { sku: other.sku } })).status, 409);
});

test('PD-03 a new product shows up in purchase, stock and the overview (stock by brand, purchase history)', async () => {
  const po = await api('POST', '/purchases', { token: admin, body: { vendor, items: [{ product: P._id, brand: P.brand, quantity: 10, unitPrice: 52.5 }] } });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  const inv = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: po.body.data._id, items: [{ product: P._id, quantity: 10 }] } });
  const dc = await api('POST', '/dc/inward', { token: admin, body: { purchaseInvoice: inv.body.data._id } });
  await api('POST', `/dc/inward/${dc.body.data._id}/process`, { token: admin, body: { items: [{ product: P._id, receivedQuantity: 10 }] } });

  const ov = await api('GET', `/products/${P._id}/overview`, { token: admin });
  assert.equal(ov.status, 200, JSON.stringify(ov.body));
  assert.equal(ov.body.data.stock.current, 10);
  assert.equal(ov.body.data.stock.status, 'low_stock', 'at or below reorder level 20');
  assert.equal(ov.body.data.stock.byBrand.find((b) => b.brandName === `QA Brand A ${tag}`).stock, 10);
  assert.equal(ov.body.data.purchases.totals.qty, 10);
  assert.equal(ov.body.data.stock.value, 525);
  assert.equal((await api('GET', `/products/${P._id}/overview`, { token: cashier })).status, 403, 'purchase rates are not for cashiers');
  const names = await api('GET', '/products/names', { token: cashier });
  assert.ok(names.body.data.some((x) => x._id === P._id), 'available at billing');
});
