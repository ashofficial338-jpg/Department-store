// Purchasing, payments and stock movements: amounts and quantities must be validated server-side.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS, stockedProduct, stockOf } from './helpers.js';
import Purchase from '../models/Purchase.js';
import Store from '../models/Store.js';

let admin; let P; let store; let otherStore;
before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  ({ product: P, store } = await stockedProduct(30));
  otherStore = (await Store.findOne({ _id: { $ne: store } }))._id;
});
after(stop);

test('OPS-01 vendor payments must be positive and cannot exceed the bill balance', async () => {
  const po = await Purchase.findOne({ status: 'invoiced', $expr: { $gt: ['$grandTotal', { $add: ['$amountPaid', 10] }] } });
  const balance = po.grandTotal - po.amountPaid;
  for (const amount of [-100, 0, 'abc', balance + 1000]) {
    const r = await api('POST', `/purchases/${po._id}/pay`, { token: admin, body: { amount, method: 'bank_transfer' } });
    assert.equal(r.status, 400, `amount ${amount} -> ${r.status}`);
  }
  const after = await Purchase.findById(po._id);
  assert.equal(after.amountPaid, po.amountPaid, 'nothing recorded');
});

test('OPS-02 goods receipts cannot be negative or exceed the ordered quantity', async () => {
  const po = await Purchase.findOne({ status: 'ordered' });
  const line = po.items[0];
  for (const receivedQuantity of [-5, line.quantity + 100]) {
    const r = await api('POST', `/purchases/${po._id}/receive`, { token: admin, body: { items: [{ product: line.product, receivedQuantity }] } });
    assert.equal(r.status, 400, `received ${receivedQuantity} -> ${r.status}`);
  }
});

test('OPS-03 stock transfers need stock at the source and a different destination', async () => {
  const have = await stockOf(P._id, store);
  const base = { sourceType: 'Store', source: store, destinationType: 'Store' };
  const tooMany = await api('POST', '/inventory/transfers', { token: admin, body: { ...base, destination: otherStore, items: [{ product: P._id, quantity: have + 1 }] } });
  assert.equal(tooMany.status, 400);
  const same = await api('POST', '/inventory/transfers', { token: admin, body: { ...base, destination: store, items: [{ product: P._id, quantity: 1 }] } });
  assert.equal(same.status, 400);
  const negative = await api('POST', '/inventory/transfers', { token: admin, body: { ...base, destination: otherStore, items: [{ product: P._id, quantity: -3 }] } });
  assert.equal(negative.status, 400);
  assert.equal(await stockOf(P._id, store), have);
});

test('OPS-04 a stock adjustment cannot take stock below zero', async () => {
  const have = await stockOf(P._id, store);
  const r = await api('POST', '/inventory/adjust', { token: admin, body: { product: P._id, store, quantity: -(have + 10), notes: 'qa' } });
  assert.equal(r.status, 400);
  assert.equal(await stockOf(P._id, store), have);
});

test('OPS-05 customer receipts must be positive', async () => {
  const r = await api('POST', '/payments', { token: admin, body: { direction: 'incoming', purpose: 'customer_receipt', method: 'cash', amount: -500 } });
  assert.equal(r.status, 400);
});
