// Purchase enhancements (2026-11-22): new suppliers from purchase entry, minimal mandatory fields,
// quantity x rate-per-piece totals, several brands of one product with brand-wise stock, admin-only changes
// with edit requests + activity log, and the Purchase Analysis filters / reports / exports. Runs on the QA DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS, verifiedVendor } from './helpers.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';

let admin; let pm; let vendor; let P; let base;
const tag = Date.now().toString(36).toUpperCase();
const mobile = `9${String(Date.now()).slice(-9)}`; // unique per run (suppliers are kept between runs)
const s = {};

before(async () => {
  base = await start();
  admin = await tokenFor(USERS.admin);
  pm = await tokenFor(USERS.purchaseManager);
  vendor = await verifiedVendor();
  P = await Product.create({ name: `QA Basmati ${tag}`, sku: `QAPP${tag}`, gstRate: 0 });
});
// Records use unique tagged names and are kept: the orders created here refer to them.
after(stop);

test('PP-01 a new supplier is added from purchase entry with just a name, and is never duplicated', async () => {
  const a = await api('POST', '/vendors/quick', { token: pm, body: { name: `QA New Supplier ${tag}`, phone: `+91 ${mobile}` } });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.data.verificationStatus, 'pending');
  const again = await api('POST', '/vendors/quick', { token: pm, body: { name: `  qa new   supplier ${tag.toLowerCase()} ` } });
  assert.equal(again.status, 200);
  assert.equal(again.body.existing, true);
  assert.equal(again.body.data._id, a.body.data._id, 'same name re-uses the supplier');
  const byPhone = await api('POST', '/vendors/quick', { token: pm, body: { name: 'Different Name', phone: mobile } });
  assert.equal(byPhone.body.data._id, a.body.data._id, 'same mobile re-uses the supplier');
  const listed = await api('GET', '/vendors/all?forPurchase=true', { token: pm });
  assert.ok(listed.body.data.some((v) => v._id === a.body.data._id), 'offered on the purchase form');
  assert.equal((await api('POST', '/vendors/quick', { token: pm, body: { name: '' } })).status, 400);
  s.newVendor = a.body.data._id;

  // Ordering from it works, but only as a draft until an admin verifies it.
  const po = await api('POST', '/purchases', { token: pm, body: { vendor: s.newVendor, items: [{ product: P._id, quantity: 2 }] } });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  assert.equal(po.body.data.status, 'draft');
  assert.ok(po.body.notice);
  assert.equal(po.body.data.grandTotal, 0, 'rate is optional');
  s.draftPO = po.body.data._id;
});

test('PP-02 quick product / brand entry re-uses existing names (any letter case)', async () => {
  const p = await api('POST', '/purchases/quick/product', { token: pm, body: { name: P.name.toUpperCase() } });
  assert.equal(p.status, 200);
  assert.equal(p.body.data._id, String(P._id));
  const b1 = await api('POST', '/purchases/quick/brand', { token: pm, body: { name: `India Gate ${tag}`, product: P._id } });
  assert.equal(b1.status, 201, JSON.stringify(b1.body));
  const b2 = await api('POST', '/purchases/quick/brand', { token: pm, body: { name: ` india gate ${tag} ` } });
  assert.equal(b2.body.data._id, b1.body.data._id);
  s.brandA = b1.body.data._id;
  const prod = await Product.findById(P._id).lean();
  assert.ok(prod.brands.map(String).includes(s.brandA), 'brand linked to the product');
  const dup = await api('POST', '/brands', { token: admin, body: { name: `INDIA GATE ${tag}` } });
  assert.equal(dup.status, 409, 'Brands page refuses a case-variant duplicate');
});

test('PP-03 one product, two brands on one PO: qty x rate per piece, brand carried to invoice, DC and batches', async () => {
  const po = await api('POST', '/purchases', {
    token: admin,
    body: {
      vendor,
      items: [
        { product: P._id, brand: s.brandA, quantity: 10, unitPrice: 85.5 },
        { product: P._id, brandName: `Daawat ${tag}`, quantity: 4, unitPrice: 92, gstRate: 5 },
      ],
    },
  });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  const [a, b] = po.body.data.items;
  assert.equal(a.totalAmount, 855, '10 x 85.50');
  assert.equal(b.taxableAmount, 368, '4 x 92');
  assert.equal(b.totalAmount, 386.4, '+5% GST');
  assert.equal(po.body.data.grandTotal, 1241.4);
  s.brandB = b.brand;
  s.po = po.body.data._id;

  const same = await api('POST', '/purchases', { token: admin, body: { vendor, items: [{ product: P._id, brand: s.brandA, quantity: 1 }, { product: P._id, brand: s.brandA, quantity: 2 }] } });
  assert.equal(same.status, 400, 'same product + same brand twice');

  const ambiguous = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po, items: [{ product: P._id, quantity: 1 }] } });
  assert.equal(ambiguous.status, 400, 'brand needed when the product is on the PO twice');
  const inv = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: s.po, items: [{ product: P._id, brand: s.brandA, quantity: 10 }, { product: P._id, brand: s.brandB, quantity: 4 }] } });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  assert.equal(inv.body.data.grandTotal, 1241.4);

  const dc = await api('POST', '/dc/inward', { token: admin, body: { purchaseInvoice: inv.body.data._id } });
  assert.equal(dc.status, 201, JSON.stringify(dc.body));
  assert.equal(dc.body.data.items.length, 2);
  const done = await api('POST', `/dc/inward/${dc.body.data._id}/process`, {
    token: admin,
    body: { items: [{ product: P._id, brand: s.brandA, receivedQuantity: 10 }, { product: P._id, brand: s.brandB, receivedQuantity: 3 }] },
  });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const batches = await Batch.find({ product: P._id }).lean();
  const byBrand = Object.fromEntries(batches.map((x) => [String(x.brand), x.availableQuantity]));
  assert.equal(byBrand[s.brandA], 10);
  assert.equal(byBrand[s.brandB], 3);
  const poNow = (await api('GET', `/purchases/${s.po}`, { token: admin })).body.data;
  assert.deepEqual(poNow.items.map((i) => i.receivedQuantity), [10, 3], 'received booked on the right brand line');

  const brands = await api('GET', `/purchase-analysis/product/${P._id}/brands`, { token: pm });
  assert.equal(brands.status, 200, JSON.stringify(brands.body));
  const A = brands.body.data.find((x) => x.brandId === s.brandA);
  const B = brands.body.data.find((x) => x.brandId === s.brandB);
  assert.equal(A.stock, 10); assert.equal(A.lastRate, 85.5);
  assert.equal(B.stock, 3); assert.equal(B.lastRate, 92);
});

test('PP-04 only admins change or cancel orders; others send an edit request that an admin approves', async () => {
  assert.equal((await api('PUT', `/purchases/${s.draftPO}`, { token: pm, body: { notes: 'x' } })).status, 403);
  assert.equal((await api('DELETE', `/purchases/${s.draftPO}`, { token: pm })).status, 403);
  assert.equal((await api('PUT', `/products/${P._id}`, { token: pm, body: { name: 'x' } })).status, 403, 'product edits are admin-only too');

  // The reason is optional by default (2026-11-23); an administrator can make it mandatory in Settings > Mandatory Fields.
  await api('PUT', '/settings/field-rules', { token: admin, body: { rules: { editRequest: { reason: true } } } });
  const noReason = await api('POST', '/edit-requests', { token: pm, body: { entity: 'Purchase', entityId: s.draftPO, changes: { notes: 'x' } } });
  assert.equal(noReason.status, 400, 'mandatory once configured');
  await api('PUT', '/settings/field-rules', { token: admin, body: { rules: {} } });
  const req = await api('POST', '/edit-requests', {
    token: pm,
    body: { entity: 'Purchase', entityId: s.draftPO, action: 'update', reason: 'Supplier quoted a rate', changes: { items: [{ product: P._id, quantity: 3, unitPrice: 40 }], hacked: true } },
  });
  assert.equal(req.status, 201, JSON.stringify(req.body));
  assert.equal(req.body.data.changes.hacked, undefined, 'only editable fields are kept');
  const twice = await api('POST', '/edit-requests', { token: pm, body: { entity: 'Purchase', entityId: s.draftPO, reason: 'again', changes: { notes: 'y' } } });
  assert.equal(twice.status, 409, 'one pending request per record per user');

  assert.equal((await api('POST', `/edit-requests/${req.body.data._id}/approve`, { token: pm })).status, 403, 'requester cannot approve');
  const mine = await api('GET', '/edit-requests', { token: pm });
  assert.ok(mine.body.data.every((r) => r.requestedByName), 'own requests listed');
  const ok = await api('POST', `/edit-requests/${req.body.data._id}/approve`, { token: admin });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const po = (await api('GET', `/purchases/${s.draftPO}`, { token: admin })).body.data;
  assert.equal(po.grandTotal, 120, 'change applied: 3 x 40');
  assert.equal((await api('POST', `/edit-requests/${req.body.data._id}/approve`, { token: admin })).status, 400, 'approve once');

  const del = await api('POST', '/edit-requests', { token: pm, body: { entity: 'Purchase', entityId: s.draftPO, action: 'delete', reason: 'Duplicate order' } });
  assert.equal(del.status, 201);
  await api('PUT', '/settings/field-rules', { token: admin, body: { rules: { editRequest: { rejectRemarks: true } } } });
  assert.equal((await api('POST', `/edit-requests/${del.body.data._id}/reject`, { token: admin, body: {} })).status, 400, 'reject needs remarks');
  await api('PUT', '/settings/field-rules', { token: admin, body: { rules: {} } });
  const rej = await api('POST', `/edit-requests/${del.body.data._id}/reject`, { token: admin, body: { remarks: 'Keep it' } });
  assert.equal(rej.body.data.status, 'rejected');

  const act = await api('GET', `/edit-requests/activity/Purchase/${s.draftPO}`, { token: pm });
  assert.equal(act.status, 200);
  const actions = act.body.data.logs.map((l) => l.action);
  ['purchase.create', 'edit_request.create', 'purchase.update', 'edit_request.approve', 'edit_request.reject'].forEach((a) => assert.ok(actions.includes(a), `activity has ${a}`));

  // Admin edit is blocked once an order has been invoiced.
  assert.equal((await api('PUT', `/purchases/${s.po}`, { token: admin, body: { notes: 'late' } })).status, 400);
  const cancel = await api('DELETE', `/purchases/${s.draftPO}`, { token: admin });
  assert.equal(cancel.body.data.status, 'cancelled');
});

test('PP-05 purchase analysis: combined filters, grouped reports with stock, rate history and exports', async () => {
  const all = await api('GET', `/purchase-analysis/lines?product=${P._id}`, { token: pm });
  assert.equal(all.status, 200, JSON.stringify(all.body));
  assert.equal(all.body.totals.lines, 2, 'cancelled order left out by default');
  const brandA = await api('GET', `/purchase-analysis/lines?product=${P._id}&brand=${s.brandA}&minRate=80&maxRate=90&minQty=5`, { token: pm });
  assert.equal(brandA.body.totals.lines, 1);
  assert.equal(brandA.body.data[0].total, 855);
  const none = await api('GET', `/purchase-analysis/lines?product=${P._id}&minAmount=10000`, { token: pm });
  assert.equal(none.body.totals.lines, 0);
  const search = await api('GET', `/purchase-analysis/lines?search=${encodeURIComponent(`Daawat ${tag}`)}`, { token: pm });
  assert.equal(search.body.totals.lines, 1, 'search matches brand names');
  const sorted = await api('GET', `/purchase-analysis/lines?product=${P._id}&sort=rate&order=asc`, { token: pm });
  assert.deepEqual(sorted.body.data.map((r) => r.rate), [85.5, 92]);

  const pb = await api('GET', `/purchase-analysis/summary?groupBy=productBrand&product=${P._id}`, { token: pm });
  assert.equal(pb.body.data.length, 2);
  assert.equal(pb.body.totals.stock, 13);
  const prod = await api('GET', `/purchase-analysis/summary?groupBy=product&product=${P._id}`, { token: pm });
  assert.equal(prod.body.data[0].qty, 14);
  assert.equal(prod.body.data[0].stock, 13, 'available stock from inventory');
  const vend = await api('GET', `/purchase-analysis/summary?groupBy=vendor&product=${P._id}`, { token: pm });
  assert.equal(vend.body.data[0].billed, 1241.4);
  const out = await api('GET', `/purchase-analysis/summary?groupBy=product&product=${P._id}&stock=out`, { token: pm });
  assert.equal(out.body.data.length, 0);

  const xlsx = await fetch(`${base}/purchase-analysis/export?view=brand&format=xlsx&product=${P._id}`, { headers: { Authorization: `Bearer ${pm}` } });
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers.get('content-type'), /spreadsheet/);
  const pdf = await fetch(`${base}/purchase-analysis/export?view=lines&format=pdf&product=${P._id}`, { headers: { Authorization: `Bearer ${pm}` } });
  assert.equal(pdf.status, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).toString().slice(0, 4), '%PDF');

  const cashier = await tokenFor(USERS.cashier);
  assert.equal((await api('GET', '/purchase-analysis/lines', { token: cashier })).status, 403, 'needs reports or purchasing');

  const po = await api('GET', `/purchases?product=${P._id}&brand=${s.brandB}&paymentStatus=unpaid&sort=total&order=desc`, { token: pm });
  assert.equal(po.status, 200, JSON.stringify(po.body));
  assert.equal(po.body.data.length, 1);
  assert.equal(po.body.summary.billed, 1241.4);
  const products = await api('GET', `/products?brand=${s.brandB}&stock=in`, { token: pm });
  assert.ok(products.body.data.some((x) => x._id === String(P._id)), 'product filter by any bought brand + stock');
});
