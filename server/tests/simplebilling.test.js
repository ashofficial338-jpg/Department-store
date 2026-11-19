// Product Master name list + simple Billing (quantity in g / kg, rate per kg). Runs on the QA DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS, stockOf } from './helpers.js';
import Product from '../models/Product.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Settings from '../models/Settings.js';

let admin; let cashier; let P; let Q;
const tag = Date.now().toString(36).toUpperCase();

before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  cashier = await tokenFor(USERS.cashier);
});
after(stop);

test('SB-01 a product needs only a name; names are unique (case-insensitive) and can be renamed / deleted', async () => {
  const a = await api('POST', '/products', { token: admin, body: { name: `  QA Rice   ${tag} ` } });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  P = a.body.data;
  assert.equal(P.name, `QA Rice ${tag}`, 'spaces tidied');
  assert.ok(P.sku, 'SKU generated automatically');
  assert.equal((await api('POST', '/products', { token: admin, body: { name: `qa rice ${tag}` } })).status, 409, 'duplicate name');
  assert.equal((await api('POST', '/products', { token: admin, body: { name: '   ' } })).status, 400, 'empty name');
  const b = await api('POST', '/products', { token: admin, body: { name: `QA Dal ${tag}` } });
  assert.equal(b.status, 201);
  Q = b.body.data;
  const ren = await api('PUT', `/products/${Q._id}`, { token: admin, body: { name: `QA Toor Dal ${tag}` } });
  assert.equal(ren.status, 200, JSON.stringify(ren.body));

  const names = await api('GET', '/products/names', { token: cashier });
  assert.equal(names.status, 200);
  assert.ok(names.body.data.some((p) => p.name === `QA Toor Dal ${tag}`), 'billing dropdown sees the list');
});

test('SB-02 bill amount = quantity in kg x rate per kg; total = sum; no stock change', async () => {
  const before = await stockOf(P._id);
  const body = {
    items: [
      { product: P._id, quantity: 500, unit: 'g', rate: 60 }, // 0.5 kg x 60 = 30
      { product: Q._id, quantity: 1.25, unit: 'kg', rate: 120 }, // 150
      { product: P._id, quantity: 333, unit: 'g', rate: 47.5 }, // 15.8175 -> 15.82
    ],
    paymentMethod: 'upi',
    clientRequestId: `qa-sb-${tag}`,
  };
  const r = await api('POST', '/sales/simple', { token: cashier, body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const sale = r.body.data;
  assert.deepEqual(sale.items.map((i) => i.totalAmount), [30, 150, 15.82]);
  assert.equal(sale.grandTotal, 195.82);
  assert.equal(sale.billType, 'simple');
  assert.equal(sale.items[0].unit, 'g');
  assert.equal(sale.items[0].quantityKg, 0.5);
  assert.equal(await stockOf(P._id), before, 'simple bills do not touch stock');

  const again = await api('POST', '/sales/simple', { token: cashier, body });
  assert.equal(again.status, 200, 'same request id -> same bill, not a second one');
  assert.equal(again.body.data._id, sale._id);

  const ledger = await LedgerEntry.find({ referenceId: sale._id }).lean();
  assert.ok(ledger.length >= 2, 'posted to accounts');

  const cancel = await api('POST', `/sales/${sale._id}/cancel`, { token: admin });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal(await stockOf(P._id), before, 'cancel gives no stock back');
});

test('SB-04 GST from Pricing & GST: per-product %, Intra-State = CGST + SGST, Inter-State = IGST', async () => {
  const original = (await Settings.findOne().lean())?.gstType || 'intra';
  try {
    assert.equal((await api('PUT', `/products/${P._id}`, { token: admin, body: { gstRate: 7 } })).status, 400, 'only standard slabs');
    assert.equal((await api('PUT', `/products/${P._id}`, { token: admin, body: { gstRate: 5 } })).status, 200);
    assert.equal((await api('PUT', '/settings', { token: admin, body: { gstType: 'both' } })).status, 400, 'bad GST type');
    const names = await api('GET', '/products/names', { token: cashier });
    assert.equal(names.body.data.find((p) => p._id === P._id).gstRate, 5, 'billing gets the GST %');

    const items = [
      { product: P._id, quantity: 750, unit: 'g', rate: 47 }, // taxable 35.25, GST 5% = 1.7625 -> 1.76
      { product: Q._id, quantity: 2, unit: 'kg', rate: 40 }, // taxable 80, GST 0%
    ];
    assert.equal((await api('PUT', '/settings', { token: admin, body: { gstType: 'intra' } })).status, 200);
    const intra = (await api('POST', '/sales/simple', { token: cashier, body: { items } })).body.data;
    assert.equal(intra.isInterState, false);
    assert.equal(intra.taxableAmount, 115.25);
    assert.equal(intra.taxAmount, 1.76);
    assert.equal(intra.cgst, 0.88);
    assert.equal(intra.sgst, 0.88);
    assert.equal(intra.igst, 0);
    assert.equal(intra.grandTotal, 117.01, 'taxable + GST');
    assert.equal(intra.items[0].totalAmount, 37.01);
    assert.equal(intra.items[1].taxAmount, 0);

    // Odd paise: GST 0.05 splits as CGST 0.03 + SGST 0.02 (never loses or adds a paisa).
    const odd = (await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: P._id, quantity: 100, unit: 'g', rate: 10 }] } })).body.data;
    assert.equal(odd.taxAmount, 0.05);
    assert.equal(Math.round((odd.cgst + odd.sgst) * 100), 5);

    assert.equal((await api('PUT', '/settings', { token: admin, body: { gstType: 'inter' } })).status, 200);
    const inter = (await api('POST', '/sales/simple', { token: cashier, body: { items } })).body.data;
    assert.equal(inter.isInterState, true);
    assert.equal(inter.igst, 1.76);
    assert.equal(inter.cgst + inter.sgst, 0);
    assert.equal(inter.grandTotal, 117.01);
    const gstLedger = await LedgerEntry.find({ referenceId: inter._id }).lean();
    assert.ok(gstLedger.some((e) => /GST on/.test(e.narration || '')), 'GST posted to accounts');
  } finally {
    await Settings.updateOne({}, { $set: { gstType: original } });
  }
});

test('SB-03 invalid bills are refused', async () => {
  const bad = [
    { items: [] },
    { items: [{ product: P._id, quantity: 0, unit: 'kg', rate: 10 }] },
    { items: [{ product: P._id, quantity: -1, unit: 'kg', rate: 10 }] },
    { items: [{ product: P._id, quantity: 1, unit: 'lb', rate: 10 }] },
    { items: [{ product: P._id, quantity: 1, unit: 'kg', rate: -5 }] },
    { items: [{ product: P._id, quantity: 1, unit: 'kg', rate: 0 }] },
  ];
  for (const body of bad) {
    const r = await api('POST', '/sales/simple', { token: cashier, body });
    assert.equal(r.status, 400, `${JSON.stringify(body)} -> ${r.status}`);
  }
  const del = await api('DELETE', `/products/${Q._id}`, { token: admin });
  assert.equal(del.status, 200);
  const gone = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: Q._id, quantity: 1, unit: 'kg', rate: 10 }] } });
  assert.equal(gone.status, 400, 'deleted product cannot be billed');
  await Product.deleteMany({ _id: { $in: [P._id, Q._id] } });
});
