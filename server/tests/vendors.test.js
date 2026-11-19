// Vendor Management: registration, documents, verification (admin), history, and "verified vendors only"
// across purchasing. Runs on the QA DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS } from './helpers.js';
import Vendor from '../models/Vendor.js';
import VendorDocument from '../models/VendorDocument.js';
import Product from '../models/Product.js';

let base; let admin; let cashier; let pm; let V; let P;
const tag = Date.now().toString().slice(-4);
const GSTIN = `33QAVEN${tag}A1Z5`;
const PAN = `QAVEN${tag}A`;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function upload(id, docType, buf = PDF, name = 'doc.pdf', token = admin) {
  const form = new FormData();
  form.append('docType', docType);
  form.append('file', new Blob([buf]), name);
  const res = await fetch(`${base}/vendors/${id}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  base = await start();
  admin = await tokenFor(USERS.admin);
  cashier = await tokenFor(USERS.cashier);
  pm = await tokenFor(USERS.purchaseManager);
  P = await Product.create({ name: `QA Vendor Item ${tag}`, sku: `QAVI${tag}${Date.now().toString(36)}`.toUpperCase() });
});
after(async () => {
  if (V) { await VendorDocument.deleteMany({ vendor: V._id }); }
  await stop();
});

test('VEN-01 registration validates GSTIN / PAN / IFSC / phone and starts as Pending Verification', async () => {
  const good = {
    name: `QA Rice Mill ${tag}`, companyName: 'QA Rice Mill Pvt Ltd', contactPerson: 'Ravi', phone: '9876501234', email: 'qa@ricemill.test',
    address: '12 Mill Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', gstin: GSTIN, pan: PAN,
    bankDetails: { accountName: 'QA Rice Mill', accountNumber: '123456789012', ifsc: 'SBIN0001234', bankName: 'SBI', branch: 'Anna Nagar' },
  };
  for (const bad of [{ gstin: '33ABC' }, { pan: 'ABCDE12345' }, { phone: '12345' }, { bankDetails: { ...good.bankDetails, ifsc: 'SBIN1234' } }, { pan: 'ZZZZZ9999Z' }, { name: '' }]) {
    const r = await api('POST', '/vendors', { token: admin, body: { ...good, ...bad } });
    assert.equal(r.status, 400, `${JSON.stringify(bad)} -> ${r.status} ${r.body?.message}`);
  }
  const r = await api('POST', '/vendors', { token: pm, body: good });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  V = r.body.data;
  assert.equal(V.verificationStatus, 'pending');
  assert.equal(V.verificationHistory[0].action, 'registered');
  assert.equal((await api('POST', '/vendors', { token: admin, body: { ...good, name: `Other ${tag}` } })).status, 409, 'same GSTIN twice');
});

test('VEN-01b common typing formats are accepted; errors name the field', async () => {
  const r = await api('POST', '/vendors', { token: admin, body: {
    name: `QA Format ${tag}`, phone: '+91 93000-00059', alternatePhone: '093000 00058', pincode: '641 605',
    gstin: `33 qafmt ${tag}c1z5`.replace(/ /g, ' '), pan: `qafmt${tag}c`, bankDetails: { accountNumber: '1234 5678 9012', ifsc: 'sbin 0001234' },
  } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.phone, '9300000059');
  assert.equal(r.body.data.alternatePhone, '9300000058');
  assert.equal(r.body.data.pincode, '641605');
  assert.equal(r.body.data.gstin, `33QAFMT${tag}C1Z5`);
  assert.equal(r.body.data.bankDetails.accountNumber, '123456789012');
  assert.equal(r.body.data.bankDetails.ifsc, 'SBIN0001234');
  const bad = await api('PUT', `/vendors/${r.body.data._id}`, { token: admin, body: { phone: '12345' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.details?.field, 'phone', 'error points at the field');
  const unchanged = await api('PUT', `/vendors/${r.body.data._id}`, { token: admin, body: { ...r.body.data, verificationHistory: undefined, documents: undefined } });
  assert.equal(unchanged.status, 200, `saving the edit form unchanged works: ${JSON.stringify(unchanged.body)}`);
  await Vendor.deleteOne({ _id: r.body.data._id });
});

test('VEN-02 unverified vendors cannot be used for purchase orders and are not offered in dropdowns', async () => {
  const po = await api('POST', '/purchases', { token: admin, body: { vendor: V._id, items: [{ product: P._id, quantity: 1, unitPrice: 10 }] } });
  assert.equal(po.status, 400);
  assert.match(po.body.message, /Pending Verification/);
  const all = await api('GET', '/vendors/all?verified=true', { token: pm });
  assert.ok(!all.body.data.some((v) => v._id === V._id));
});

test('VEN-03 documents: PDF/image only, content checked, private download, one per type', async () => {
  assert.equal((await upload(V._id, 'gst_certificate', Buffer.from('not a pdf'), 'x.pdf')).status, 400, 'fake PDF');
  assert.equal((await upload(V._id, 'gst_certificate', PDF, 'x.exe')).status, 400, 'wrong type');
  assert.equal((await upload(V._id, 'aadhaar', PDF)).status, 400, 'unknown document type');
  const up = await upload(V._id, 'gst_certificate', PDF, 'gst.pdf', pm);
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const again = await upload(V._id, 'gst_certificate', PDF, 'gst-v2.pdf');
  assert.equal(again.body.data.documents.filter((d) => d.docType === 'gst_certificate').length, 1, 'replaced, not duplicated');
  const doc = again.body.data.documents.find((d) => d.docType === 'gst_certificate');

  const noAuth = await fetch(`${base}/vendors/${V._id}/documents/${doc._id}`);
  assert.equal(noAuth.status, 401, 'documents need login');
  const dl = await fetch(`${base}/vendors/${V._id}/documents/${doc._id}`, { headers: { Authorization: `Bearer ${admin}` } });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await dl.arrayBuffer()).toString().slice(0, 4), '%PDF');
});

test('VEN-04 only administrators verify; documents are optional but details are required; remarks needed to reject / hold', async () => {
  assert.equal((await api('POST', `/vendors/${V._id}/verify`, { token: pm, body: { status: 'verified' } })).status, 403, 'not admin');
  // A vendor with no documents and no bank details cannot be verified yet - the details are what is missing.
  const bare = await api('POST', '/vendors', { token: admin, body: { name: `QA No Docs ${tag}`, phone: '9876509999', address: 'x', gstin: `33QANOD${tag}B1Z5`, pan: `QANOD${tag}B` } });
  assert.equal(bare.status, 201, JSON.stringify(bare.body));
  const early = await api('POST', `/vendors/${bare.body.data._id}/verify`, { token: admin, body: { status: 'verified' } });
  assert.equal(early.status, 400);
  assert.match(early.body.message, /Bank account/);
  assert.doesNotMatch(early.body.message, /PAN Card|GST Certificate|Bank Proof/, 'documents are not required');
  await api('PUT', `/vendors/${bare.body.data._id}`, { token: admin, body: { bankDetails: { accountName: 'X', accountNumber: '123456789', ifsc: 'SBIN0001234' } } });
  const noDocs = await api('POST', `/vendors/${bare.body.data._id}/verify`, { token: admin, body: { status: 'verified' } });
  assert.equal(noDocs.status, 200, `verified without any documents: ${JSON.stringify(noDocs.body)}`);
  await Vendor.deleteOne({ _id: bare.body.data._id });
  assert.equal((await api('POST', `/vendors/${V._id}/verify`, { token: admin, body: { status: 'on_hold' } })).status, 400, 'remarks required');
  const hold = await api('POST', `/vendors/${V._id}/verify`, { token: admin, body: { status: 'on_hold', remarks: 'Waiting for PAN card' } });
  assert.equal(hold.status, 200);
  assert.equal(hold.body.data.verificationStatus, 'on_hold');

  await upload(V._id, 'pan_card');
  await upload(V._id, 'bank_proof', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'cheque.png');
  const ok = await api('POST', `/vendors/${V._id}/verify`, { token: admin, body: { status: 'verified', remarks: 'All documents match' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.verificationStatus, 'verified');
  assert.ok(ok.body.data.verifiedAt, 'approval date recorded');
  const h = ok.body.data.verificationHistory.filter((e) => e.action === 'status_changed');
  assert.deepEqual(h.map((e) => [e.fromStatus, e.toStatus]), [['pending', 'on_hold'], ['on_hold', 'verified']]);
  assert.equal(h[1].remarks, 'All documents match');
  assert.ok(h[1].byName, 'who approved');
});

test('VEN-05 verified vendor can be used for POs; changing GSTIN / bank sends it back to Pending Verification', async () => {
  const all = await api('GET', '/vendors/all?verified=true', { token: pm });
  assert.ok(all.body.data.some((v) => v._id === V._id), 'offered in PO dropdown');
  const po = await api('POST', '/purchases', { token: admin, body: { vendor: V._id, items: [{ product: P._id, quantity: 1, unitPrice: 10 }] } });
  assert.equal(po.status, 201, JSON.stringify(po.body));

  const small = await api('PUT', `/vendors/${V._id}`, { token: pm, body: { contactPerson: 'Ravi Kumar' } });
  assert.equal(small.body.data.verificationStatus, 'verified', 'contact change keeps verification');
  const big = await api('PUT', `/vendors/${V._id}`, { token: pm, body: { bankDetails: { accountName: 'QA Rice Mill', accountNumber: '999988887777', ifsc: 'HDFC0001234', bankName: 'HDFC' } } });
  assert.equal(big.status, 200, JSON.stringify(big.body));
  assert.equal(big.body.data.verificationStatus, 'pending', 'bank change needs re-verification');
  const pay = await api('POST', `/purchases/${po.body.data._id}/approve`, { token: admin });
  assert.equal(pay.status, 400, 'PO already approved or vendor unverified');
  const inv = await api('POST', '/purchases/invoices', { token: admin, body: { purchaseId: po.body.data._id, items: [{ product: P._id, quantity: 1 }] } });
  assert.equal(inv.status, 400);
  assert.match(inv.body.message, /Pending Verification/, 'invoice blocked for unverified vendor');
});

test('VEN-06 list: search, status filter, sorting, summary counts; cashiers cannot see vendors', async () => {
  const r = await api('GET', `/vendors?search=${encodeURIComponent(GSTIN)}&verificationStatus=pending&sort=name&order=asc`, { token: pm });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.data[0].verificationHistory, undefined, 'history not sent in lists');
  assert.ok(r.body.summary.pending >= 1 && r.body.summary.all >= 1);
  assert.equal((await api('GET', '/vendors?sort=bogus', { token: pm })).status, 200, 'unknown sort falls back');
  assert.equal((await api('GET', '/vendors?verificationStatus=maybe', { token: pm })).status, 400);
  assert.equal((await api('GET', '/vendors', { token: cashier })).status, 403);
  await Vendor.deleteOne({ _id: V._id });
  await Product.deleteOne({ _id: P._id });
});
