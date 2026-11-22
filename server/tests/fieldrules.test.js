// Optional fields (2026-11-23): only essential fields are mandatory; everything else is optional by default and
// administrators choose which become mandatory (Settings > Mandatory Fields). Checked on the API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS } from './helpers.js';

let admin; let pm; let cashier;
const tag = Date.now().toString(36).toUpperCase();
const resetRules = () => api('PUT', '/settings/field-rules', { token: admin, body: { rules: {} } });

before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  pm = await tokenFor(USERS.purchaseManager);
  cashier = await tokenFor(USERS.cashier);
  await resetRules();
});
after(async () => { await resetRules(); await stop(); });

test('FR-01 defaults: only essential fields are mandatory; everyone can read the rules, only admins change them', async () => {
  const r = await api('GET', '/settings/field-rules', { token: cashier });
  assert.equal(r.status, 200);
  const { registry, rules } = r.body.data;
  for (const [entity, def] of Object.entries(registry)) {
    for (const f of def.fields) assert.equal(rules[entity][f.key], !!f.essential, `${entity}.${f.key}`);
  }
  assert.equal((await api('PUT', '/settings/field-rules', { token: pm, body: { rules: { vendor: { phone: true } } } })).status, 403);
  const off = await api('PUT', '/settings/field-rules', { token: admin, body: { rules: { product: { name: false } } } });
  assert.equal(off.body.data.rules.product.name, true, 'essential fields cannot be made optional');
});

test('FR-02 records save with only the essential fields', async () => {
  const v = await api('POST', '/vendors', { token: admin, body: { name: `QA Bare Vendor ${tag}` } });
  assert.equal(v.status, 201, `vendor without mobile: ${JSON.stringify(v.body)}`);
  const c1 = await api('POST', '/customers', { token: admin, body: { name: `QA Walkin A ${tag}` } });
  const c2 = await api('POST', '/customers', { token: admin, body: { name: `QA Walkin B ${tag}` } });
  assert.equal(c1.status, 201, JSON.stringify(c1.body));
  assert.equal(c2.status, 201, 'two customers without mobile do not clash');
  const cat = await api('POST', '/categories', { token: admin, body: { name: `QA Cat ${tag}` } });
  assert.equal(cat.status, 201, `category without slug: ${JSON.stringify(cat.body)}`);
  assert.ok(cat.body.data.slug);
  const p = await api('POST', '/products', { token: admin, body: { name: `QA Bare Product ${tag}` } });
  assert.equal(p.status, 201);
  const exp = await api('POST', '/expenses', { token: admin, body: { amount: 50 } });
  assert.equal(exp.status, 201, `expense without description: ${JSON.stringify(exp.body)}`);
  const bill = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: p.body.data._id, quantity: 1, unit: 'kg', rate: 40 }], amountReceived: 0, newCustomer: { name: `QA Credit NoPhone ${tag}` } } });
  assert.equal(bill.status, 201, `credit bill to a customer without mobile: ${JSON.stringify(bill.body)}`);
  const again = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: p.body.data._id, quantity: 1, unit: 'kg', rate: 40 }], amountReceived: 0, newCustomer: { name: `qa credit nophone ${tag}` } } });
  assert.equal(again.body.data.customer, bill.body.data.customer, 'same name without mobile re-uses the customer');
  const adj = await api('POST', '/inventory/adjust', { token: admin, body: { product: p.body.data._id, quantity: 5 } });
  assert.equal(adj.status, 200, `adjustment without a reason: ${JSON.stringify(adj.body)}`);
  assert.equal((await api('POST', '/vendors', { token: admin, body: { name: `QA Bad Phone ${tag}`, phone: '123' } })).status, 400, 'a mobile that is given must still be valid');
});

test('FR-03 an administrator makes fields mandatory and the API enforces them', async () => {
  await api('PUT', '/settings/field-rules', { token: admin, body: { rules: { vendor: { phone: true }, product: { hsn: true, sellingPrice: true }, customer: { phone: true }, expense: { description: true }, stockAdjustment: { reason: true } } } });
  const v = await api('POST', '/vendors', { token: admin, body: { name: `QA Need Phone ${tag}` } });
  assert.equal(v.status, 400); assert.match(v.body.message, /Mobile number is mandatory/);
  assert.equal((await api('POST', '/vendors', { token: admin, body: { name: `QA Has Phone ${tag}`, phone: `9${String(Date.now()).slice(-9)}` } })).status, 201);
  const p = await api('POST', '/products', { token: admin, body: { name: `QA Need HSN ${tag}`, sellingPrice: 10 } });
  assert.equal(p.status, 400); assert.match(p.body.message, /HSN/);
  assert.equal((await api('POST', '/products', { token: admin, body: { name: `QA Has HSN ${tag}`, sellingPrice: 10, hsn: '1006' } })).status, 201);
  const existing = (await api('GET', `/products?search=${encodeURIComponent(`QA Bare Product ${tag}`)}`, { token: admin })).body.data[0];
  assert.equal((await api('PUT', `/products/${existing._id}`, { token: admin, body: { reorderLevel: 5 } })).status, 200, 'editing other fields is not blocked by an empty mandatory field');
  assert.equal((await api('POST', '/customers', { token: admin, body: { name: `QA Need Mobile ${tag}` } })).status, 400);
  assert.equal((await api('POST', '/expenses', { token: admin, body: { amount: 10 } })).status, 400);
  assert.equal((await api('POST', '/inventory/adjust', { token: admin, body: { product: existing._id, quantity: 1 } })).status, 400);
  await resetRules();
  assert.equal((await api('POST', '/expenses', { token: admin, body: { amount: 10 } })).status, 201, 'optional again after reset');
});
