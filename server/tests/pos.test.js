// POS billing ("checkout") integrity: prices, quantities, discounts, payments, stock, duplicates, returns,
// cancellations and held bills. Runs against the QA database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { start, stop, api, tokenFor, USERS, stockedProduct, stockOf } from './helpers.js';
import LedgerEntry from '../models/LedgerEntry.js';

let cashier; let admin; let P; let store;
const cash = (amount) => [{ method: 'cash', amount }];

before(async () => {
  await start();
  cashier = await tokenFor(USERS.cashier);
  admin = await tokenFor(USERS.admin);
  ({ product: P, store } = await stockedProduct(40));
});
after(stop);

async function preview(items) {
  const r = await api('POST', '/sales/preview', { token: cashier, body: { items } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data.summary.grandTotal;
}

test('POS-01 server ignores a unit price sent by the browser', async () => {
  const total = await preview([{ product: P._id, quantity: 1 }]);
  const r = await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity: 1, unitPrice: 1 }], payments: cash(total) } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.items[0].unitPrice, P.sellingPrice, 'billed at the catalogue price, not the tampered price');
  assert.equal(r.body.data.grandTotal, total);
});

test('POS-02 zero, negative and non-numeric quantities are rejected', async () => {
  for (const quantity of [0, -5, 'abc', 1e9]) {
    const r = await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity }], payments: cash(0) } });
    assert.equal(r.status, 400, `quantity ${quantity} -> ${r.status} ${JSON.stringify(r.body)}`);
  }
});

test('POS-03 discount must be between 0 and 100 percent', async () => {
  for (const discountPercent of [-10, 150]) {
    const r = await api('POST', '/sales/preview', { token: cashier, body: { items: [{ product: P._id, quantity: 1, discountPercent }] } });
    assert.equal(r.status, 400, `discount ${discountPercent} -> ${r.status}`);
  }
});

test('POS-04 GST override must be a configured GST slab', async () => {
  const r = await api('POST', '/sales/preview', { token: cashier, body: { items: [{ product: P._id, quantity: 1, gstRateOverride: 3, overrideReason: 'test' }] } });
  assert.equal(r.status, 400);
});

test('POS-05 a bill needs a valid store', async () => {
  const total = await preview([{ product: P._id, quantity: 1 }]);
  const r = await api('POST', '/sales', { token: cashier, body: { items: [{ product: P._id, quantity: 1 }], payments: cash(total) } });
  assert.equal(r.status, 400);
});

test('POS-06 cannot sell more than the store has in stock', async () => {
  const have = await stockOf(P._id, store);
  const r = await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity: have + 1 }], payments: cash(9999999) } });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.equal(await stockOf(P._id, store), have, 'stock unchanged');
});

test('POS-07 payment lines must be positive with a known method', async () => {
  const total = await preview([{ product: P._id, quantity: 1 }]);
  for (const payments of [[{ method: 'cash', amount: -50 }, { method: 'cash', amount: total + 50 }], [{ method: 'bitcoin', amount: total }]]) {
    const r = await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity: 1 }], payments } });
    assert.equal(r.status, 400, JSON.stringify(payments));
  }
});

test('POS-08 credit sales need a customer', async () => {
  const total = await preview([{ product: P._id, quantity: 1 }]);
  const r = await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity: 1 }], payments: [{ method: 'credit', amount: total }] } });
  assert.equal(r.status, 400);
});

test('POS-09 cash overpayment is returned as change, not booked as sales', async () => {
  const total = await preview([{ product: P._id, quantity: 1 }]);
  const r = await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity: 1 }], payments: cash(total + 100) } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.amountPaid, total, 'amount paid equals the bill');
  assert.equal(r.body.data.payments[0].changeReturned, 100);
  const posted = await LedgerEntry.aggregate([{ $match: { referenceId: new mongoose.Types.ObjectId(r.body.data._id), entryType: 'debit', narration: /^Sale / } }, { $group: { _id: null, t: { $sum: '$amount' } } }]);
  assert.equal(posted[0]?.t, total, 'only the bill amount is posted to cash');
});

test('POS-10 non-cash overpayment is rejected', async () => {
  const total = await preview([{ product: P._id, quantity: 1 }]);
  const r = await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity: 1 }], payments: [{ method: 'upi', amount: total + 500 }] } });
  assert.equal(r.status, 400);
});

test('POS-11 a repeated submission with the same request id creates one invoice', async () => {
  const total = await preview([{ product: P._id, quantity: 1 }]);
  const body = { store, items: [{ product: P._id, quantity: 1 }], payments: cash(total), clientRequestId: `qa-${Date.now()}-${Math.random()}` };
  const before = await stockOf(P._id, store);
  const [a, b] = await Promise.all([api('POST', '/sales', { token: cashier, body }), api('POST', '/sales', { token: cashier, body })]);
  assert.ok([a.status, b.status].every((s) => s === 200 || s === 201), `${a.status} ${b.status} ${JSON.stringify(b.body)}`);
  assert.equal(a.body.data.invoiceNumber, b.body.data.invoiceNumber, 'same invoice returned');
  assert.equal(await stockOf(P._id, store), before - 1, 'stock deducted once');
});

test('POS-12 returns cannot exceed what is left to return across several returns', async () => {
  const total = await preview([{ product: P._id, quantity: 2 }]);
  const sale = (await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity: 2 }], payments: cash(total) } })).body.data;
  const r1 = await api('POST', '/sales/returns', { token: cashier, body: { saleId: sale._id, items: [{ product: P._id, quantity: 2, reason: 'qa' }] } });
  assert.equal(r1.status, 201);
  const r2 = await api('POST', '/sales/returns', { token: cashier, body: { saleId: sale._id, items: [{ product: P._id, quantity: 1, reason: 'qa' }] } });
  assert.equal(r2.status, 400, 'second return of the same units refused');
  const r3 = await api('POST', '/sales/returns', { token: cashier, body: { saleId: sale._id, items: [{ product: P._id, quantity: -1 }] } });
  assert.equal(r3.status, 400, 'negative return quantity refused');
});

test('POS-13 an invoice with returns cannot be cancelled (stock and refunds stay consistent)', async () => {
  const total = await preview([{ product: P._id, quantity: 3 }]);
  const sale = (await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity: 3 }], payments: cash(total) } })).body.data;
  await api('POST', '/sales/returns', { token: cashier, body: { saleId: sale._id, items: [{ product: P._id, quantity: 1, reason: 'qa' }] } });
  const stockBefore = await stockOf(P._id, store);
  const c = await api('POST', `/sales/${sale._id}/cancel`, { token: admin });
  assert.equal(c.status, 400, JSON.stringify(c.body));
  assert.equal(await stockOf(P._id, store), stockBefore, 'no double restock');
});

test('POS-13b no returns against a cancelled invoice, and cancelling twice is refused', async () => {
  const total = await preview([{ product: P._id, quantity: 1 }]);
  const before = await stockOf(P._id, store);
  const sale = (await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity: 1 }], payments: cash(total) } })).body.data;
  assert.equal((await api('POST', `/sales/${sale._id}/cancel`, { token: admin })).status, 200);
  assert.equal(await stockOf(P._id, store), before, 'cancel restores the stock');
  assert.equal((await api('POST', `/sales/${sale._id}/cancel`, { token: admin })).status, 400);
  const r = await api('POST', '/sales/returns', { token: cashier, body: { saleId: sale._id, items: [{ product: P._id, quantity: 1 }] } });
  assert.equal(r.status, 400);
});

test('POS-14 cancelling an invoice reverses its accounting entries', async () => {
  const total = await preview([{ product: P._id, quantity: 1 }]);
  const sale = (await api('POST', '/sales', { token: cashier, body: { store, items: [{ product: P._id, quantity: 1 }], payments: cash(total) } })).body.data;
  await api('POST', `/sales/${sale._id}/cancel`, { token: admin });
  const rows = await LedgerEntry.aggregate([
    { $match: { referenceId: new mongoose.Types.ObjectId(sale._id) } },
    { $group: { _id: '$account', net: { $sum: { $cond: [{ $eq: ['$entryType', 'debit'] }, '$amount', { $multiply: ['$amount', -1] }] } } } },
  ]);
  assert.ok(rows.length > 0);
  rows.forEach((r) => assert.ok(Math.abs(r.net) < 0.01, `account ${r._id} not reversed (${r.net})`));
});

test('POS-15 a held bill survives a failed resume, and edits made on resume are billed', async () => {
  const held = (await api('POST', '/sales', { token: cashier, body: { store, status: 'held', items: [{ product: P._id, quantity: 1 }] } })).body.data;
  const have = await stockOf(P._id, store);
  const fail = await api('POST', `/sales/${held._id}/resume`, { token: cashier, body: { store, items: [{ product: P._id, quantity: have + 5 }], payments: cash(9999999) } });
  assert.equal(fail.status, 400);
  const list = (await api('GET', '/sales/held', { token: cashier })).body.data;
  assert.ok(list.some((h) => h._id === held._id), 'held bill still there after the failed resume');
  const total = await preview([{ product: P._id, quantity: 2 }]);
  const ok = await api('POST', `/sales/${held._id}/resume`, { token: cashier, body: { store, items: [{ product: P._id, quantity: 2 }], payments: cash(total) } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.data.items[0].quantity, 2, 'billed the edited quantity');
});
