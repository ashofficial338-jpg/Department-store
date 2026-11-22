// Multiple units of measurement (2026-11-23): KG / G / NOS / PCS / L / ML / Box / Packet / Bundle / Dozen / Meter,
// product conversion rules (1 box = 24 pcs), separate purchase / selling rates per unit, purchase entry in any unit
// with stock kept in the base unit, billing in any unit, whole-number vs decimal rules, admin-managed custom units.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS, verifiedVendor, stockOf } from './helpers.js';

let admin; let pm; let cashier; let vendor;
const tag = Date.now().toString(36).toUpperCase();
const letters = tag.replace(/[^A-Z]/g, '') || 'X';
const P = {};

before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  pm = await tokenFor(USERS.purchaseManager);
  cashier = await tokenFor(USERS.cashier);
  vendor = await verifiedVendor();
});
after(stop);

async function receive(productId, items) {
  const po = await api('POST', '/purchases', { token: admin, body: { vendor, items } });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  const inv = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: po.body.data._id, items: po.body.data.items.map((l) => ({ product: l.product, quantity: l.quantity })) } });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  const dc = await api('POST', '/dc/inward', { token: admin, body: { purchaseInvoice: inv.body.data._id } });
  const done = await api('POST', `/dc/inward/${dc.body.data._id}/process`, { token: admin, body: { items: dc.body.data.items.map((l) => ({ product: l.product, receivedQuantity: l.expectedQuantity })) } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return { po: po.body.data, invoice: inv.body.data };
}

test('UOM-01 all requested units exist; admins manage custom units and conversion rules', async () => {
  const list = (await api('GET', '/products/units', { token: cashier })).body.data.map((u) => u.code);
  for (const c of ['kg', 'g', 'nos', 'pcs', 'l', 'ml', 'box', 'packet', 'bundle', 'dozen', 'm']) assert.ok(list.includes(c), c);

  assert.equal((await api('POST', '/products/units', { token: pm, body: { label: `Score${letters}`, family: 'each', factor: 20 } })).status, 403, 'admin only');
  const score = await api('POST', '/products/units', { token: admin, body: { label: `Score${letters}`, family: 'each', factor: 20 } });
  assert.equal(score.status, 201, JSON.stringify(score.body));
  assert.equal(score.body.data.factor, 20);
  const yard = await api('POST', '/products/units', { token: admin, body: { label: `Yard${letters}`, family: 'length', factor: 91.44 } });
  assert.equal(yard.status, 201);
  const ren = await api('PUT', `/products/units/${score.body.data.code}`, { token: admin, body: { label: `Score ${letters}`, factor: 20 } });
  assert.equal(ren.status, 200, JSON.stringify(ren.body));
  assert.equal((await api('PUT', '/products/units/kg', { token: admin, body: { label: 'Kilo' } })).status, 400, 'built-in units are fixed');
  P.score = score.body.data.code;
  assert.equal((await api('DELETE', `/products/units/${yard.body.data.code}`, { token: admin })).status, 200, 'unused unit can be deleted');
});

test('UOM-02 product with box / bundle conversions and its own rates per unit; bad rules refused', async () => {
  const bad = await api('POST', '/products', { token: admin, body: { name: `QA Bad Soap ${tag}`, sellingUnit: 'pcs', baseUnit: 'pcs', conversions: [{ unit: 'kg', quantity: 2, ofUnit: 'pcs' }] } });
  assert.equal(bad.status, 400, 'kg has a fixed size');
  const bad2 = await api('POST', '/products', { token: admin, body: { name: `QA Bad Soap2 ${tag}`, sellingUnit: 'pcs', baseUnit: 'pcs', unitPrices: [{ unit: 'carton', sellingPrice: 100 }] } });
  assert.equal(bad2.status, 400, 'a rate per carton needs a carton conversion');

  const soap = await api('POST', '/products', {
    token: admin,
    body: {
      name: `QA Soap ${tag}`, sellingUnit: 'pcs', baseUnit: 'pcs', purchaseUnit: 'box', sellingPrice: 11, purchasePrice: 9, gstRate: 0,
      conversions: [{ unit: 'box', quantity: 24, ofUnit: 'pcs' }, { unit: 'bundle', quantity: 10, ofUnit: 'pcs' }],
      unitPrices: [{ unit: 'box', sellingPrice: 250, purchasePrice: 210 }],
    },
  });
  assert.equal(soap.status, 201, JSON.stringify(soap.body));
  P.soap = soap.body.data;
  assert.equal(P.soap.conversions.length, 2);
  assert.equal(P.soap.unitPrices[0].purchasePrice, 210);
  const used = await api('DELETE', '/products/units/box', { token: admin });
  assert.equal(used.status, 400, 'built-in');
});

test('UOM-03 purchase in boxes: amount = qty x rate per box, stock in pieces, batch rate per piece', async () => {
  const half = await api('POST', '/purchases', { token: admin, body: { vendor, items: [{ product: P.soap._id, unit: 'box', quantity: 1.5, unitPrice: 210 }] } });
  assert.equal(half.status, 400, 'boxes are whole numbers');
  const wrong = await api('POST', '/purchases', { token: admin, body: { vendor, items: [{ product: P.soap._id, unit: 'kg', quantity: 1, unitPrice: 1 }] } });
  assert.equal(wrong.status, 400, 'kg does not convert to pieces');

  const { po } = await receive(P.soap._id, [{ product: P.soap._id, unit: 'box', quantity: 2, unitPrice: 210 }]);
  assert.equal(po.items[0].unit, 'box');
  assert.equal(po.items[0].baseFactor, 24);
  assert.equal(po.grandTotal, 420, '2 boxes x 210');
  assert.equal(await stockOf(P.soap._id), 48, '2 boxes = 48 pcs in stock');
  const ov = (await api('GET', `/products/${P.soap._id}/overview`, { token: admin })).body.data;
  assert.equal(ov.batches[0].available, 48);
  assert.equal(ov.batches[0].purchasePrice, 8.75, '210 / 24 per piece');

  const def = await api('POST', '/purchases', { token: admin, body: { vendor, approve: false, items: [{ product: P.soap._id, quantity: 1, unitPrice: 210 }] } });
  assert.equal(def.body.data.items[0].unit, 'box', 'purchase unit of the product is the default');
  await api('DELETE', `/purchases/${def.body.data._id}`, { token: admin });
});

test('UOM-04 billing in pieces, dozen, box (own rate) and bundle; whole numbers only for pieces / packs', async () => {
  const bill = await api('POST', '/sales/simple', {
    token: cashier,
    body: { items: [
      { product: P.soap._id, quantity: 1, unit: 'box' },
      { product: P.soap._id, quantity: 2, unit: 'pcs' },
      { product: P.soap._id, quantity: 1, unit: 'dozen' },
      { product: P.soap._id, quantity: 1, unit: 'bundle' },
    ] },
  });
  assert.equal(bill.status, 201, JSON.stringify(bill.body));
  const [box, pcs, dozen, bundle] = bill.body.data.items;
  assert.equal(box.totalAmount, 250, 'box at its own rate');
  assert.equal(box.baseQty, 24);
  assert.equal(pcs.totalAmount, 22, '2 x 11');
  assert.equal(dozen.totalAmount, 132, '12 x 11');
  assert.equal(bundle.totalAmount, 110, '10 x 11 (no own rate)');
  assert.equal(bill.body.data.grandTotal, 514);
  assert.equal(await stockOf(P.soap._id), 0, '48 - 24 - 2 - 12 - 10: stock taken in pieces');
  assert.equal((await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: P.soap._id, quantity: 1.5, unit: 'pcs' }] } })).status, 400, 'pieces are whole');
  assert.equal((await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: P.soap._id, quantity: 1, unit: 'kg' }] } })).status, 400, 'kg does not convert');
  assert.equal((await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: P.soap._id, quantity: 1, unit: 'box' }] } })).status, 400, 'no stock left');
});

test('UOM-05 weight and length: buy in kg / g with decimals, sell in g / kg / m', async () => {
  const rice = (await api('POST', '/products', { token: admin, body: { name: `QA Loose Dal ${tag}`, sellingUnit: 'kg', baseUnit: 'kg', sellingPrice: 120, purchasePrice: 100 } })).body.data;
  const { po } = await receive(rice._id, [{ product: rice._id, unit: 'kg', quantity: 12.5, unitPrice: 100 }]);
  assert.equal(po.grandTotal, 1250);
  assert.equal(await stockOf(rice._id), 12.5);
  await receive(rice._id, [{ product: rice._id, unit: 'g', quantity: 500, unitPrice: 0.1 }]);
  assert.equal(await stockOf(rice._id), 13, '500 g = 0.5 kg');
  const sale = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: rice._id, quantity: 750, unit: 'g' }, { product: rice._id, quantity: 1.25, unit: 'kg' }] } });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  assert.equal(sale.body.data.items[0].totalAmount, 90, '0.75 kg x 120');
  assert.equal(sale.body.data.items[1].totalAmount, 150);
  assert.equal(await stockOf(rice._id), 11);

  const wire = (await api('POST', '/products', { token: admin, body: { name: `QA Wire ${tag}`, sellingUnit: 'm', baseUnit: 'm', sellingPrice: 18 } })).body.data;
  await receive(wire._id, [{ product: wire._id, unit: 'm', quantity: 90, unitPrice: 12 }]);
  const cut = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: wire._id, quantity: 2.5, unit: 'm' }, { product: wire._id, quantity: 50, unit: 'cm' }] } });
  assert.equal(cut.status, 201, JSON.stringify(cut.body));
  assert.equal(cut.body.data.items[0].totalAmount, 45);
  assert.equal(cut.body.data.items[1].totalAmount, 9);
  assert.equal(await stockOf(wire._id), 87);
});

test('UOM-06 purchase return in boxes leaves stock in pieces; reports add up in the stock unit', async () => {
  const { invoice } = await receive(P.soap._id, [{ product: P.soap._id, unit: 'box', quantity: 3, unitPrice: 210 }]);
  const before = await stockOf(P.soap._id);
  const ret = await api('POST', '/purchases/returns', { token: admin, body: { purchaseInvoiceId: invoice._id, items: [{ product: P.soap._id, quantity: 1 }] } });
  assert.equal(ret.status, 201, JSON.stringify(ret.body));
  assert.equal(ret.body.data.totalAmount, 210);
  const odc = await api('POST', '/dc/outward', { token: admin, body: { purchaseReturn: ret.body.data._id } });
  const sub = await api('POST', `/dc/outward/${odc.body.data._id}/submit`, { token: admin, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  assert.equal(await stockOf(P.soap._id), before - 24);

  const lines = await api('GET', `/purchase-analysis/lines?product=${P.soap._id}`, { token: admin });
  assert.ok(lines.body.data.every((l) => l.unit === 'box'));
  const sum = await api('GET', `/purchase-analysis/summary?groupBy=product&product=${P.soap._id}`, { token: admin });
  assert.equal(sum.body.data[0].qty, (2 + 3) * 24, 'purchased qty in pieces');
  assert.equal(sum.body.data[0].unit, 'pcs');
});
