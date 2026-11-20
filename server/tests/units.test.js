// Grocery units: product unit setup, price by weight / volume / count, stock in the base unit, packs with and
// without net content, custom units, negative stock, receipts keeping their prices. Runs on the QA DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS, stockOf } from './helpers.js';
import Inventory from '../models/Inventory.js';
import { mainStoreId } from '../utils/storeGuard.js';
import { unitMap, convert, compatible, parseOption, formatOption } from '../utils/units.js';

let admin; let cashier;
const P = {};
const tag = Date.now().toString(36).toUpperCase();
const setStock = async (id, qty) => Inventory.updateOne({ product: id, store: await mainStoreId() }, { $set: { currentStock: qty } }, { upsert: true });
const bill = (items, extra = {}) => api('POST', '/sales/simple', { token: cashier, body: { items, paymentMethod: 'cash', ...extra } });

before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  cashier = await tokenFor(USERS.cashier);
});
after(stop);

test('UN-01 unit engine: conversions only within a family, packs only with net content', () => {
  const u = unitMap();
  assert.equal(convert(250, 'g', 'kg', u), 0.25);
  assert.equal(convert(750, 'ml', 'l', u), 0.75);
  assert.equal(convert(1, 'dozen', 'pcs', u), 12);
  assert.equal(convert(6, 'pcs', 'dozen', u), 0.5);
  assert.equal(convert(500, 'mg', 'g', u), 0.5);
  assert.equal(compatible('g', 'ml', u), false);
  assert.equal(compatible('packet', 'g', u), false, 'packet never becomes grams by itself');
  assert.equal(compatible('packet', 'g', u, { packUnit: 'packet', packQuantity: 500, packQuantityUnit: 'g' }), true);
  assert.equal(convert(2, 'packet', 'kg', u, { packUnit: 'packet', packQuantity: 500, packQuantityUnit: 'g' }), 1);
  assert.deepEqual(parseOption('500 g', u), { quantity: 500, unit: 'g' });
  assert.deepEqual(parseOption('1 litre', u), { quantity: 1, unit: 'l' });
  assert.deepEqual(parseOption('Half Dozen', u), { quantity: null, unit: 'half_dozen' });
  assert.equal(formatOption(parseOption('2 Litres', u), u), '2 L');
  assert.equal(parseOption('500 xyz', u), null);
});

test('UN-02 product unit setup is saved and validated', async () => {
  const mk = async (body) => api('POST', '/products', { token: admin, body: { ...body, name: `${body.name} ${tag}` } });
  let r = await mk({ name: 'QA Rice', categoryName: 'Rice & Grains', productType: 'loose', sellingUnit: 'kg', baseUnit: 'kg', purchaseUnit: 'sack', sellingPrice: 60, mrp: 65, gstRate: 5, unitOptions: ['kg', '500 g', '1 kg', '5 kg', '25 kgs'] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  P.rice = r.body.data;
  assert.deepEqual(P.rice.unitOptions, ['kg', '500 g', '1 kg', '5 kg', '25 kg'], 'options normalised');
  assert.equal(P.rice.unit, 'KG', 'old unit field kept in step');
  assert.ok(P.rice.category, 'category created from its name');

  r = await mk({ name: 'QA Sugar', productType: 'loose', sellingUnit: 'kg', baseUnit: 'g', sellingPrice: 45 });
  assert.equal(r.status, 201, JSON.stringify(r.body)); P.sugar = r.body.data;
  r = await mk({ name: 'QA Milk', productType: 'packed', sellingUnit: 'l', baseUnit: 'ml', sellingPrice: 60, unitOptions: ['250 ml', '500 ml', '1 L'] });
  assert.equal(r.status, 201, JSON.stringify(r.body)); P.milk = r.body.data;
  r = await mk({ name: 'QA Banana', productType: 'loose', sellingUnit: 'pcs', baseUnit: 'pcs', sellingPrice: 5, unitOptions: ['pcs', 'dozen'] });
  assert.equal(r.status, 201, JSON.stringify(r.body)); P.banana = r.body.data;
  r = await mk({ name: 'QA Biscuit', productType: 'packed', sellingUnit: 'packet', baseUnit: 'packet', sellingPrice: 30, discountPercent: 10 });
  assert.equal(r.status, 201, JSON.stringify(r.body)); P.biscuit = r.body.data;
  r = await mk({ name: 'QA Masala', productType: 'packed', sellingUnit: 'packet', baseUnit: 'g', packUnit: 'packet', packQuantity: 100, packQuantityUnit: 'g', sellingPrice: 40 });
  assert.equal(r.status, 201, JSON.stringify(r.body)); P.masala = r.body.data;

  assert.equal((await mk({ name: 'QA Bad1', sellingUnit: 'kg', baseUnit: 'ml' })).status, 400, 'kg and ml do not convert');
  assert.equal((await mk({ name: 'QA Bad2', sellingUnit: 'packet', baseUnit: 'g' })).status, 400, 'packet -> g needs net content');
  assert.equal((await mk({ name: 'QA Bad3', sellingUnit: 'kg', unitOptions: ['500 ml'] })).status, 400, 'option must fit the selling unit');
  assert.equal((await mk({ name: 'QA Bad4', sellingUnit: 'furlong' })).status, 400, 'unknown unit');

  const names = await api('GET', '/products/names', { token: cashier });
  const rice = names.body.data.find((p) => p._id === P.rice._id);
  assert.equal(rice.sellingUnit, 'kg', 'billing dropdown receives the unit setup');
  assert.equal(rice.sellingPrice, 60);

  for (const [k, qty] of [['rice', 100], ['sugar', 10000], ['milk', 5000], ['banana', 50], ['biscuit', 10], ['masala', 1000]]) await setStock(P[k]._id, qty);
  assert.equal((await api('PUT', `/products/${P.sugar._id}`, { token: admin, body: { baseUnit: 'kg' } })).status, 400, 'stock unit locked while there is stock');
});

test('UN-03 the example bill: weight, volume and count priced from the selling unit; client rate ignored', async () => {
  const r = await bill([
    { product: P.rice._id, quantity: 500, unit: 'g', rate: 1 }, // 0.5 kg x 60 = 30 (GST 5% = 1.50)
    { product: P.sugar._id, quantity: 2, unit: 'kg' }, // 2 x 45 = 90
    { product: P.milk._id, quantity: 500, unit: 'ml' }, // 0.5 L x 60 = 30
    { product: P.banana._id, quantity: 6, unit: 'pcs' }, // 6 x 5 = 30
    { product: P.rice._id, quantity: 250, unit: 'g' }, // 15
    { product: P.rice._id, quantity: 750, unit: 'g' }, // 45
    { product: P.sugar._id, quantity: 500, unit: 'g' }, // 22.50
    { product: P.milk._id, quantity: 250, unit: 'ml' }, // 15
  ], { clientRequestId: `qa-un-${tag}` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const s = r.body.data;
  assert.deepEqual(s.items.map((i) => i.grossAmount), [30, 90, 30, 30, 15, 45, 22.5, 15]);
  assert.deepEqual(s.items.map((i) => i.rateUnit), ['kg', 'kg', 'l', 'pcs', 'kg', 'kg', 'kg', 'l']);
  assert.equal(s.items[0].unitPrice, 60, 'catalogue price, not the 1 sent');
  assert.equal(s.items[0].taxAmount, 1.5);
  assert.equal(s.items[0].unit, 'g');
  assert.equal(s.items[0].baseQty, 0.5);
  assert.equal(s.items[0].baseUnit, 'kg');
  assert.equal(s.taxableAmount, 277.5);

  assert.equal(await stockOf(P.rice._id), 98.5, 'rice 100 kg - 1.5 kg');
  assert.equal(await stockOf(P.sugar._id), 7500, 'sugar kept in g: 10000 - 2500');
  assert.equal(await stockOf(P.milk._id), 4250, 'milk kept in ml: 5000 - 750');
  assert.equal(await stockOf(P.banana._id), 44);
});

test('UN-04 dozen, packs, net content, discount and whole-number rules', async () => {
  let r = await bill([
    { product: P.banana._id, quantity: 1, unit: 'dozen' }, // 12 pcs x 5 = 60
    { product: P.banana._id, quantity: 1, unit: 'half_dozen' }, // 30
    { product: P.biscuit._id, quantity: 2, unit: 'packet' }, // 60 - 10% = 54
    { product: P.masala._id, quantity: 3, unit: 'packet' }, // 120, stock 300 g
  ]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const s = r.body.data;
  assert.deepEqual(s.items.map((i) => i.grossAmount), [60, 30, 60, 120]);
  assert.equal(s.items[2].discountAmount, 6);
  assert.equal(s.items[2].taxableAmount, 54);
  assert.equal(s.discount, 6);
  assert.equal(await stockOf(P.banana._id), 26, '44 - 18 pcs');
  assert.equal(await stockOf(P.biscuit._id), 8);
  assert.equal(await stockOf(P.masala._id), 700, 'masala stock in g: 1000 - 3 x 100 g');

  r = await bill([{ product: P.masala._id, quantity: 250, unit: 'g' }]); // sold loose from the pack price: 250/100 x 40 = 100
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.items[0].grossAmount, 100);

  assert.equal((await bill([{ product: P.biscuit._id, quantity: 100, unit: 'g' }])).status, 400, 'biscuit packet has no net weight -> no grams');
  assert.equal((await bill([{ product: P.rice._id, quantity: 1, unit: 'l' }])).status, 400, 'rice cannot be sold in litres');
  assert.equal((await bill([{ product: P.banana._id, quantity: 1.5, unit: 'pcs' }])).status, 400, 'half a banana');
  assert.equal((await bill([{ product: P.biscuit._id, quantity: 1.5, unit: 'packet' }])).status, 400, '1.5 packets');
  assert.equal((await bill([{ product: P.rice._id, quantity: 0.125, unit: 'kg' }])).status, 201, 'decimal weights are fine');
});

test('UN-05 stock never goes negative; cancel puts the base quantity back', async () => {
  const before = await stockOf(P.milk._id);
  const over = await bill([{ product: P.milk._id, quantity: 5, unit: 'l' }]);
  assert.equal(over.status, 400);
  assert.match(over.body.message, /Only 4250 ml of QA Milk/);
  assert.equal(await stockOf(P.milk._id), before);

  const ok = await bill([{ product: P.milk._id, quantity: 2, unit: 'l' }]);
  assert.equal(ok.status, 201);
  assert.equal(await stockOf(P.milk._id), before - 2000);
  assert.equal((await api('POST', `/sales/${ok.body.data._id}/cancel`, { token: admin })).status, 200);
  assert.equal(await stockOf(P.milk._id), before, 'cancel returns 2000 ml');
});

test('UN-06 saved bills keep their price after the product price changes', async () => {
  const r = await bill([{ product: P.sugar._id, quantity: 1, unit: 'kg' }]);
  assert.equal(r.status, 201);
  assert.equal((await api('PUT', `/products/${P.sugar._id}`, { token: admin, body: { sellingPrice: 50 } })).status, 200);
  const again = await api('GET', `/sales/${r.body.data._id}`, { token: admin });
  assert.equal(again.body.data.items[0].unitPrice, 45);
  assert.equal(again.body.data.items[0].rateUnit, 'kg');
  assert.equal(again.body.data.grandTotal, 45);
});

test('UN-07 custom units: pack-type and weight with a size', async () => {
  const name = `Tumbler${tag.replace(/[^A-Z]/g, '')}`;
  const a = await api('POST', '/products/units', { token: admin, body: { label: name, family: 'pack' } });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal((await api('POST', '/products/units', { token: admin, body: { label: name } })).status, 409);
  const q = await api('POST', '/products/units', { token: admin, body: { label: `Quintal${tag.replace(/[^A-Z]/g, '')}`, family: 'mass', factor: 100000 } });
  assert.equal(q.status, 201, JSON.stringify(q.body));
  assert.equal((await api('POST', '/products/units', { token: admin, body: { label: 'Bad', family: 'mass' } })).status, 400, 'weight unit needs its size');
  const list = await api('GET', '/products/units', { token: cashier });
  assert.ok(list.body.data.some((u) => u.code === a.body.data.code));

  const p = await api('POST', '/products', { token: admin, body: { name: `QA Kulfi ${tag}`, sellingUnit: a.body.data.code, sellingPrice: 25 } });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  await setStock(p.body.data._id, 4);
  const r = await bill([{ product: p.body.data._id, quantity: 2, unit: a.body.data.code }]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.grandTotal, 50);
  assert.equal(await stockOf(p.body.data._id), 2);

  const rr = await bill([{ product: P.rice._id, quantity: 0.01, unit: q.body.data.code }]); // 1 kg
  assert.equal(rr.status, 201, JSON.stringify(rr.body));
  assert.equal(rr.body.data.items[0].grossAmount, 60);
});
