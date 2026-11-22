// Sales & Purchase integration (2026-11-22). Replays the Excel model "Rice Calculation" example
// (ARKA_MART_Rice_Business_Process_Tanglish.xlsx) through the website and checks the same numbers come out,
// then credit / part-paid sales with receipts, returns against the amount due, brand at billing,
// customer & supplier ledgers and the dashboard summary. Runs on the QA DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS, verifiedVendor, stockOf } from './helpers.js';
import Product from '../models/Product.js';

let admin; let cashier; let vendor; let rice;
const tag = Date.now().toString(36).toUpperCase();
const s = {};
// Excel "Rice Calculation" inputs
const X = { rate: 1150, gst: 0.05, margin: 0.18, po: 100, inv1: 60, inv2: 40, qc1: 60, qc2: 38, ret: 3, paid: 72450 };
const r2 = (n) => Math.round(n * 100) / 100;

before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  cashier = await tokenFor(USERS.cashier);
  vendor = await verifiedVendor();
  rice = await Product.create({
    name: `QA Ponni Raw Rice 25kg ${tag}`, sku: `QARICE${tag}`, gstRate: 5, purchasePrice: X.rate,
    sellingPrice: r2(X.rate * (1 + X.margin)), sellingUnit: 'pcs', baseUnit: 'pcs', unit: 'PCS', reorderLevel: 20,
  });
});
after(stop);

test('SP-01 purchase cycle gives the Excel numbers: invoices, QC, return, payable = invoiced - return - paid', async () => {
  const po = await api('POST', '/purchases', { token: admin, body: { vendor, items: [{ product: rice._id, quantity: X.po, unitPrice: X.rate, gstRate: 5 }] } });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  assert.equal(po.body.data.grandTotal, 120750, 'Excel B18 PO total');
  s.po = po.body.data._id;

  // Invoice 1: paid in full at entry (cash purchase). Invoice 2: credit.
  const i1 = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po, items: [{ product: rice._id, quantity: X.inv1 }], payNow: { amount: 72450, method: 'bank_transfer' } } });
  assert.equal(i1.status, 201, JSON.stringify(i1.body));
  assert.equal(i1.body.data.grandTotal, 72450, 'Excel B23');
  assert.equal(i1.body.due, 0);
  const tooMuch = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po, items: [{ product: rice._id, quantity: X.inv2 }], payNow: { amount: 99999, method: 'cash' } } });
  assert.equal(tooMuch.status, 400, 'paid-now above the bill is refused (nothing saved)');
  const i2 = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po, items: [{ product: rice._id, quantity: X.inv2 }] } });
  assert.equal(i2.body.data.grandTotal, 48300, 'Excel B24');
  s.inv1 = i1.body.data._id; s.inv2 = i2.body.data._id;

  for (const [inv, qc] of [[s.inv1, X.qc1], [s.inv2, X.qc2]]) {
    const dc = await api('POST', '/dc/inward', { token: admin, body: { purchaseInvoice: inv } });
    const done = await api('POST', `/dc/inward/${dc.body.data._id}/process`, { token: admin, body: { items: [{ product: rice._id, receivedQuantity: qc }] } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
  }
  assert.equal(await stockOf(rice._id), X.qc1 + X.qc2, 'only QC-passed bags in stock (98)');

  const ret = await api('POST', '/purchases/returns', { token: admin, body: { purchaseInvoiceId: s.inv2, items: [{ product: rice._id, quantity: X.ret }] } });
  assert.equal(ret.status, 201, JSON.stringify(ret.body));
  assert.equal(ret.body.data.totalAmount, 3622.5, 'Excel B39');
  const odc = await api('POST', '/dc/outward', { token: admin, body: { purchaseReturn: ret.body.data._id } });
  await api('POST', `/dc/outward/${odc.body.data._id}/submit`, { token: admin, body: {} });
  assert.equal(await stockOf(rice._id), 95);

  // Payable: Excel B63 = 72,450 + 48,300 - 3,622.50 - 72,450 = 44,677.50
  const inv2 = (await api('GET', `/purchases/invoices/${s.inv2}`, { token: admin })).body.data;
  assert.equal(inv2.due, 44677.5);
  const over = await api('POST', `/purchases/invoices/${s.inv2}/pay`, { token: admin, body: { amount: 50000, method: 'cash' } });
  assert.equal(over.status, 400, 'cannot pay more than due');
  const part = await api('POST', `/purchases/invoices/${s.inv2}/pay`, { token: admin, body: { amount: 20000, method: 'upi' } });
  assert.equal(part.status, 200, JSON.stringify(part.body));
  assert.equal(part.body.due, 24677.5, 'partial payment');
  const poNow = (await api('GET', `/purchases/${s.po}`, { token: admin })).body.data;
  assert.equal(poNow.amountPaid, 92450);
  assert.equal(poNow.returnedAmount, 3622.5);

  const unpaid = await api('GET', `/purchases/invoices?paymentStatus=partial&vendor=${vendor}`, { token: admin });
  assert.ok(unpaid.body.data.some((x) => x._id === s.inv2), 'payment-status filter');

  const led = await api('GET', `/trade/ledger/vendor/${vendor}`, { token: admin });
  assert.equal(led.status, 200, JSON.stringify(led.body));
  const mine = led.body.data.rows.filter((r) => /PINV|PRT|PV/.test(r.reference));
  assert.ok(mine.length >= 4);
  const xlsx = await api('GET', `/trade/ledger/vendor/${vendor}?format=xlsx`, { token: admin });
  assert.notEqual(xlsx.status, 500);
});

test('SP-02 credit / part-paid sale to a new customer, several receipts, never overpaid', async () => {
  const noCust = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: rice._id, quantity: 1, unit: 'pcs' }], amountReceived: 0 } });
  assert.equal(noCust.status, 400, 'credit needs a customer');

  const phone = `9${String(Date.now()).slice(-9)}`;
  const bill = await api('POST', '/sales/simple', {
    token: cashier,
    body: { items: [{ product: rice._id, quantity: 2, unit: 'pcs' }], paymentMethod: 'upi', amountReceived: 1000, newCustomer: { name: `QA Kumar ${tag}`, phone } },
  });
  assert.equal(bill.status, 201, JSON.stringify(bill.body));
  const b = bill.body.data;
  assert.equal(b.grandTotal, 2849.7, 'Excel: 2 bags x 1,424.85 (selling price incl. GST)');
  assert.equal(b.amountDue, 1849.7);
  assert.equal(b.creditAmount, 1849.7);
  assert.equal(await stockOf(rice._id), 93, 'stock down on the sale');
  s.sale = b._id; s.customer = b.customer;

  const again = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: rice._id, quantity: 1, unit: 'pcs' }], newCustomer: { name: 'Different', phone } } });
  assert.equal(again.body.data.customer, s.customer, 'same mobile = same customer');
  s.cashSale = again.body.data._id;

  const over = await api('POST', `/trade/sales/${s.sale}/receipts`, { token: cashier, body: { amount: 2000, method: 'cash' } });
  assert.equal(over.status, 400);
  const r1 = await api('POST', `/trade/sales/${s.sale}/receipts`, { token: cashier, body: { amount: 849.7, method: 'cash' } });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.data.amountDue, 1000);
  const partial = await api('GET', `/sales?paymentStatus=partial&customer=${s.customer}`, { token: admin });
  assert.equal(partial.body.data.length, 1);
  assert.equal(partial.body.summary.due, 1000);
  const cancel = await api('POST', `/sales/${s.sale}/cancel`, { token: admin });
  assert.equal(cancel.status, 400, 'no cancel once money was received');
});

test('SP-03 a return on a part-paid bill clears the amount due first, puts stock back', async () => {
  const ret = await api('POST', '/sales/returns', { token: admin, body: { saleId: s.sale, items: [{ lineIndex: 0, quantity: 1, restockStatus: 'restocked' }], refundMethod: 'cash' } });
  assert.equal(ret.status, 201, JSON.stringify(ret.body));
  assert.equal(ret.body.data.totalRefund, 1424.85);
  assert.equal(ret.body.data.dueAdjusted, 1000, 'set off against the 1,000 still due');
  assert.equal(ret.body.data.refundPaid, 424.85, 'only the rest is refunded');
  assert.equal(await stockOf(rice._id), 93, '93 - 1 (cash sale) + 1 returned');
  const sale = (await api('GET', `/sales/${s.sale}`, { token: admin })).body.data;
  assert.equal(sale.amountDue, 0);
  const led = await api('GET', `/trade/ledger/customer/${s.customer}`, { token: admin });
  assert.equal(led.body.data.closing, 0, 'customer owes nothing now');
  assert.equal((await api('POST', '/sales/returns', { token: admin, body: { saleId: s.sale, items: [{ lineIndex: 0, quantity: 2 }] } })).status, 400, 'cannot return more than sold');
});

test('SP-04 brand picked at billing takes that brand\'s stock only', async () => {
  const brand = await api('POST', '/purchases/quick/brand', { token: admin, body: { name: `QA Rice Brand ${tag}`, product: rice._id } });
  const po = await api('POST', '/purchases', { token: admin, body: { vendor, items: [{ product: rice._id, brand: brand.body.data._id, quantity: 5, unitPrice: 1100 }] } });
  const inv = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: po.body.data._id, items: [{ product: rice._id, brand: brand.body.data._id, quantity: 5 }] } });
  const dc = await api('POST', '/dc/inward', { token: admin, body: { purchaseInvoice: inv.body.data._id } });
  await api('POST', `/dc/inward/${dc.body.data._id}/process`, { token: admin, body: { items: [{ product: rice._id, brand: brand.body.data._id, receivedQuantity: 5 }] } });

  const brands = await api('GET', `/trade/sale-brands/${rice._id}`, { token: cashier });
  assert.equal(brands.status, 200, JSON.stringify(brands.body));
  assert.equal(brands.body.data.find((x) => x.brandId === brand.body.data._id).stock, 5);
  const tooMany = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: rice._id, brand: brand.body.data._id, quantity: 6, unit: 'pcs' }] } });
  assert.equal(tooMany.status, 400, 'more than the brand has');
  const ok = await api('POST', '/sales/simple', { token: cashier, body: { items: [{ product: rice._id, brand: brand.body.data._id, quantity: 2, unit: 'pcs' }] } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.data.items[0].brandName, `QA Rice Brand ${tag}`);
  const after = await api('GET', `/trade/sale-brands/${rice._id}`, { token: cashier });
  assert.equal(after.body.data.find((x) => x.brandId === brand.body.data._id).stock, 3);
});

test('SP-05 dashboard summary separates cash / credit sales and purchases, outstanding and stock', async () => {
  const sum = await api('GET', '/trade/summary', { token: admin });
  assert.equal(sum.status, 200, JSON.stringify(sum.body));
  const d = sum.body.data;
  for (const k of ['sales', 'purchases', 'today', 'customerOutstanding', 'supplierOutstanding', 'stock', 'monthly']) assert.ok(d[k] !== undefined, k);
  assert.equal(r2(d.sales.cash + d.sales.credit), d.sales.total);
  assert.equal(r2(d.purchases.cash + d.purchases.credit), d.purchases.total);
  assert.ok(d.today.sales >= 2849.7 + 1424.85);
  assert.ok(d.supplierOutstanding.value >= 24677.5);
  assert.ok(d.stock.value > 0 && d.stock.units > 0);
  const credit = await api('GET', '/sales?saleType=credit&search=QA%20Kumar', { token: admin });
  assert.ok(credit.body.data.some((x) => x._id === s.sale), 'credit-sale filter + search by customer');
});
