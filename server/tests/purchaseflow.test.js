// Purchase cycle: PO -> Purchase Invoice -> Inward DC -> stock up; Purchase Return -> Outward DC -> stock down.
// POs, invoices and returns never move stock; each DC books its stock once. Runs on the QA DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS, stockOf, verifiedVendor } from './helpers.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import InventoryTransaction from '../models/InventoryTransaction.js';

let admin; let P; let Q; let vendor;
const s = { po: null, invoice: null, dc: null, ret: null, out: null };

async function ledgerBalance(productId) {
  const rows = await InventoryTransaction.find({ product: productId }).lean();
  const inward = rows.filter((r) => r.quantity > 0).reduce((a, r) => a + r.quantity, 0);
  const outward = rows.filter((r) => r.quantity < 0).reduce((a, r) => a - r.quantity, 0);
  return inward - outward;
}

before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  vendor = await verifiedVendor();
  const tpl = await Product.findOne({ status: 'active' }).lean();
  const tag = Date.now().toString(36).toUpperCase();
  const { _id, createdAt, updatedAt, __v, barcode, ...fields } = tpl; // eslint-disable-line no-unused-vars
  P = await Product.create({ ...fields, sku: `QAPI${tag}`, name: `QA Invoice Item ${tag}` });
  Q = await Product.create({ ...fields, sku: `QAPJ${tag}`, name: `QA Invoice Item B ${tag}` });
});
after(stop);

test('PF-01 a draft PO is saved, cannot be invoiced until approved, and never changes stock', async () => {
  const po = await api('POST', '/purchases', { token: admin, body: { vendor, approve: false, items: [{ product: P._id, quantity: 10, unitPrice: 20, gstRate: 5 }, { product: Q._id, quantity: 4, unitPrice: 50, gstRate: 0 }] } });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  assert.equal(po.body.data.status, 'draft');
  s.po = po.body.data;
  const early = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po._id, items: [{ product: P._id, quantity: 1 }] } });
  assert.equal(early.status, 400);
  const ok = await api('POST', `/purchases/${s.po._id}/approve`, { token: admin });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.status, 'approved');
  assert.equal((await api('POST', `/purchases/${s.po._id}/approve`, { token: admin })).status, 400, 'approve once');
  assert.equal(await stockOf(P._id), 0);
  assert.equal(await stockOf(Q._id), 0);
});

test('PF-02 partial invoice fetches the PO rates, blocks over-invoicing, and does not change stock', async () => {
  const over = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po._id, items: [{ product: P._id, quantity: 11 }] } });
  assert.equal(over.status, 400, 'beyond ordered without permission');
  const inv = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po._id, vendorInvoiceNumber: `V-${P.sku}`, items: [{ product: P._id, quantity: 6 }] } });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  s.invoice = inv.body.data;
  assert.equal(s.invoice.items[0].unitPrice, 20, 'rate from the PO');
  assert.equal(s.invoice.grandTotal, 126, '6 x 20 + 5% GST');
  assert.equal(String(s.invoice.purchase), String(s.po._id), 'linked to the PO');
  const dup = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po._id, vendorInvoiceNumber: `V-${P.sku}`, items: [{ product: P._id, quantity: 1 }] } });
  assert.equal(dup.status, 400, 'same vendor invoice number twice');
  const more = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po._id, items: [{ product: P._id, quantity: 5 }] } });
  assert.equal(more.status, 400, 'only 4 left to invoice');

  const po = (await api('GET', `/purchases/${s.po._id}`, { token: admin })).body.data;
  assert.equal(po.status, 'partially_invoiced');
  assert.equal(po.items.find((l) => String(l.product._id) === String(P._id)).invoicedQuantity, 6);
  assert.equal(po.invoices.length, 1, 'invoice listed on the PO');
  assert.equal(await stockOf(P._id), 0, 'invoice does not add stock');
});

test('PF-03 payables follow the invoiced value, not the order value', async () => {
  const pay = await api('POST', `/purchases/${s.po._id}/pay`, { token: admin, body: { amount: 127, method: 'bank_transfer' } });
  assert.equal(pay.status, 400, 'cannot pay more than invoiced');
  const out = await api('GET', '/reports/outstanding', { token: admin });
  const row = out.body.data.payables.find((r) => String(r._id) === String(s.po._id));
  assert.equal(row?.balance, 126);
});

test('PF-04 inward DC adds stock only on submit, once, and never beyond the invoice', async () => {
  const tooMany = await api('POST', '/dc/inward', { token: admin, body: { purchaseInvoice: s.invoice._id, items: [{ product: P._id, expectedQuantity: 7 }] } });
  assert.equal(tooMany.status, 400);
  const noInvoice = await api('POST', '/dc/inward', { token: admin, body: { items: [{ product: P._id, expectedQuantity: 1 }] } });
  assert.equal(noInvoice.status, 400, 'inward DC needs a purchase invoice');

  const dc = await api('POST', '/dc/inward', { token: admin, body: { purchaseInvoice: s.invoice._id } });
  assert.equal(dc.status, 201, JSON.stringify(dc.body));
  assert.equal(dc.body.data.items[0].expectedQuantity, 6, 'fetches what is still due on the invoice');
  s.dc = dc.body.data;
  assert.equal(await stockOf(P._id), 0, 'creating the DC does not add stock');

  // A second DC for the same goods, submitted after the first, must not over-receive.
  const dc2 = await api('POST', '/dc/inward', { token: admin, body: { purchaseInvoice: s.invoice._id, items: [{ product: P._id, expectedQuantity: 3 }] } });
  assert.equal(dc2.status, 201);

  // Partial delivery: 4 of 6 arrive. Two simultaneous submits -> exactly one books stock.
  const body = { items: [{ product: P._id, receivedQuantity: 4, qualityCheckPassed: true }] };
  const [a, b] = await Promise.all([
    api('POST', `/dc/inward/${s.dc._id}/process`, { token: admin, body }),
    api('POST', `/dc/inward/${s.dc._id}/process`, { token: admin, body }),
  ]);
  assert.equal([a, b].filter((r) => r.status === 200).length, 1, 'only one submit succeeds');
  assert.equal(await stockOf(P._id), 4);
  assert.equal((await api('POST', `/dc/inward/${s.dc._id}/process`, { token: admin, body })).status, 400, 'resubmit refused');
  assert.equal(await stockOf(P._id), 4, 'no duplicate stock');

  const over = await api('POST', `/dc/inward/${dc2.body.data._id}/process`, { token: admin, body: { items: [{ product: P._id, receivedQuantity: 3, qualityCheckPassed: true }] } });
  assert.equal(over.status, 400, 'only 2 still due on the invoice');
  const rest = await api('POST', `/dc/inward/${dc2.body.data._id}/process`, { token: admin, body: { items: [{ product: P._id, receivedQuantity: 2, qualityCheckPassed: true }] } });
  assert.equal(rest.status, 200, JSON.stringify(rest.body));
  assert.equal(await stockOf(P._id), 6);

  const inv = (await api('GET', `/purchases/invoices/${s.invoice._id}`, { token: admin })).body.data;
  assert.equal(inv.status, 'received');
  assert.equal(inv.items[0].receivedQuantity, 6);
  assert.equal(inv.inwardDCs.length, 2, 'DCs listed on the invoice');
  const po = (await api('GET', `/purchases/${s.po._id}`, { token: admin })).body.data;
  assert.equal(po.items.find((l) => String(l.product._id) === String(P._id)).receivedQuantity, 6);
});

test('PF-05 allowOverInvoice explicitly permits billing beyond the order', async () => {
  const inv = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po._id, allowOverInvoice: true, items: [{ product: Q._id, quantity: 5 }] } });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  assert.equal(await stockOf(Q._id), 0);
});

test('PF-06 purchase return does not move stock; outward DC takes it out once on submit', async () => {
  const tooMany = await api('POST', '/purchases/returns', { token: admin, body: { purchaseInvoiceId: s.invoice._id, items: [{ product: P._id, quantity: 7 }] } });
  assert.equal(tooMany.status, 400);
  const oldStyle = await api('POST', '/purchases/returns', { token: admin, body: { purchaseId: s.po._id, items: [{ product: P._id, quantity: 1 }] } });
  assert.equal(oldStyle.status, 400, 'return needs the purchase invoice');

  const ret = await api('POST', '/purchases/returns', { token: admin, body: { purchaseInvoiceId: s.invoice._id, items: [{ product: P._id, quantity: 3, reason: 'damaged' }] } });
  assert.equal(ret.status, 201, JSON.stringify(ret.body));
  s.ret = ret.body.data;
  assert.equal(s.ret.status, 'pending_dispatch');
  assert.equal(await stockOf(P._id), 6, 'return does not reduce stock');

  const noReturn = await api('POST', '/dc/outward', { token: admin, body: { items: [{ product: P._id, quantity: 1 }] } });
  assert.equal(noReturn.status, 400, 'outward DC needs a purchase return');
  const out = await api('POST', '/dc/outward', { token: admin, body: { purchaseReturn: s.ret._id } });
  assert.equal(out.status, 201, JSON.stringify(out.body));
  s.out = out.body.data;
  assert.equal(await stockOf(P._id), 6, 'creating the DC does not reduce stock');
  assert.equal((await api('POST', `/dc/outward/${s.out._id}/advance`, { token: admin })).status, 200, 'can be approved');
  assert.equal((await api('POST', `/dc/outward/${s.out._id}/advance`, { token: admin })).status, 200, 'picking');
  assert.equal((await api('POST', `/dc/outward/${s.out._id}/advance`, { token: admin })).status, 200, 'packed');
  assert.equal((await api('POST', `/dc/outward/${s.out._id}/advance`, { token: admin })).status, 400, 'dispatch only through submit');

  const tooFar = await api('POST', `/dc/outward/${s.out._id}/submit`, { token: admin, body: { items: [{ product: P._id, dispatchedQuantity: 4 }] } });
  assert.equal(tooFar.status, 400, 'cannot dispatch more than planned');
  const body = { items: [{ product: P._id, dispatchedQuantity: 2 }] };
  const [a, b] = await Promise.all([
    api('POST', `/dc/outward/${s.out._id}/submit`, { token: admin, body }),
    api('POST', `/dc/outward/${s.out._id}/submit`, { token: admin, body }),
  ]);
  assert.equal([a, b].filter((r) => r.status === 200).length, 1, 'only one submit succeeds');
  assert.equal(await stockOf(P._id), 4);

  const r = (await api('GET', `/purchases/returns/${s.ret._id}`, { token: admin })).body.data;
  assert.equal(r.status, 'partially_dispatched');
  assert.equal(r.items[0].dispatchedQuantity, 2);
  assert.equal(r.outwardDCs.length, 1);

  // The last unit goes on a second outward DC.
  const out2 = await api('POST', '/dc/outward', { token: admin, body: { purchaseReturn: s.ret._id } });
  assert.equal(out2.status, 201);
  assert.equal(out2.body.data.items[0].quantity, 1);
  assert.equal((await api('POST', `/dc/outward/${out2.body.data._id}/submit`, { token: admin, body: {} })).status, 200);
  assert.equal(await stockOf(P._id), 3);
  const done = (await api('GET', `/purchases/returns/${s.ret._id}`, { token: admin })).body.data;
  assert.equal(done.status, 'dispatched');
  assert.equal((await api('POST', '/dc/outward', { token: admin, body: { purchaseReturn: s.ret._id } })).status, 400, 'nothing left to dispatch');
});

test('PF-07 available stock = submitted inward - submitted outward; movements split by direction', async () => {
  assert.equal(await ledgerBalance(P._id), await stockOf(P._id));
  assert.equal(await stockOf(P._id), 3);
  const inward = await api('GET', `/inventory/ledger?direction=in&search=${encodeURIComponent(P.sku)}`, { token: admin });
  const outward = await api('GET', `/inventory/ledger?direction=out&search=${encodeURIComponent(P.sku)}`, { token: admin });
  assert.equal(inward.status, 200);
  assert.deepEqual(inward.body.data.map((r) => r.quantity).sort(), [2, 4]);
  assert.ok(inward.body.data.every((r) => r.type === 'inward_dc' && r.referenceNumber));
  assert.deepEqual(outward.body.data.map((r) => r.quantity).sort(), [-1, -2]);
  assert.ok(outward.body.data.every((r) => r.type === 'outward_dc'));
  const ov = await api('GET', `/inventory/overview?search=${encodeURIComponent(P.sku)}`, { token: admin });
  const row = ov.body.data.find((x) => String(x.product._id) === String(P._id));
  assert.equal(row.totalInward, 6);
  assert.equal(row.totalOutward, 3);
});
