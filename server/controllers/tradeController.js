import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import SalesReturn from '../models/SalesReturn.js';
import Customer, { ensureCustomerPhoneIndex } from '../models/Customer.js';
import { requireFields } from '../utils/fieldRules.js';
import { escapeRegex } from '../utils/validate.js';
import Counter from '../models/Counter.js';
import Payment from '../models/Payment.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';
import Inventory from '../models/Inventory.js';
import Vendor from '../models/Vendor.js';
import Purchase from '../models/Purchase.js';
import PurchaseInvoice from '../models/PurchaseInvoice.js';
import PurchaseReturn from '../models/PurchaseReturn.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { postLedgerPair, methodToAccountKey } from '../utils/ledger.js';
import { round2 } from '../utils/gstCalculator.js';
import { requireId, positive, oneOf } from '../utils/validate.js';
import { BILLED_EXPR, PAYABLE_STATUSES } from '../utils/payables.js';
import { sendExport, EXPORT_FORMATS } from '../utils/exporters.js';

// Sales & purchase money flow shared by Billing, Customers, Purchase Invoices, the party ledgers and the
// Dashboard. Formulas match the Excel model:
//   Customer outstanding = total sales - amount received (receipts and returns reduce it)
//   Supplier outstanding = total purchases (invoiced) - purchase returns - amount paid

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const RECEIPT_METHODS = ['cash', 'upi', 'card', 'bank_transfer'];

// ---------- customers at billing ----------
async function nextCustomerId() {
  const key = 'customer';
  if (!(await Counter.exists({ key }))) {
    const last = await Customer.findOne({ customerId: /^CUST\d+$/ }).sort({ customerId: -1 }).select('customerId').lean();
    await Counter.updateOne({ key }, { $setOnInsert: { seq: Number(last?.customerId?.slice(4) || 0) } }, { upsert: true });
  }
  const c = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { new: true });
  return `CUST${String(c.seq).padStart(5, '0')}`;
}

const normPhone = (v) => {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
};

// The customer on a bill: an existing id, or { name, phone } - an existing customer with that mobile is
// re-used (no duplicates). Returns null when the bill has no customer (walk-in cash sale).
export async function resolveSaleCustomer(req, customerId, newCustomer) {
  if (customerId) {
    requireId(customerId, 'Customer');
    const c = await Customer.findById(customerId);
    if (!c || c.status === 'inactive') throw new ApiError(400, 'Selected customer was not found.');
    return c;
  }
  if (!newCustomer || (!newCustomer.name && !newCustomer.phone)) return null;
  // Mobile is optional (unless made mandatory in Settings); when given it must be valid and identifies the customer.
  const phone = newCustomer.phone ? normPhone(newCustomer.phone) : '';
  if (phone && !/^[6-9][0-9]{9}$/.test(phone)) throw new ApiError(400, 'Mobile number must be 10 digits (starting with 6-9).', { field: 'phone' });
  const name = String(newCustomer.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  await requireFields('customer', { phone }, { partial: true });
  // Same mobile = same customer; without a mobile, an existing customer with exactly this name (and no mobile) is re-used.
  const existing = phone
    ? await Customer.findOne({ phone })
    : (name ? await Customer.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i'), $or: [{ phone: { $exists: false } }, { phone: null }, { phone: '' }] }) : null);
  if (existing) {
    if (existing.status === 'inactive') { existing.status = 'active'; await existing.save(); }
    return existing;
  }
  if (!name) throw new ApiError(400, 'Enter the customer name.', { field: 'name' });
  await ensureCustomerPhoneIndex();
  const c = await Customer.create({ customerId: await nextCustomerId(), name, ...(phone ? { phone } : {}) });
  await recordAudit({ req, action: 'customer.create', entity: 'Customer', entityId: c._id, newValue: { name, phone, via: 'billing' } });
  return c;
}

// ---------- receipts against a bill (several part-payments allowed) ----------
export const receiveSalePayment = catchAsync(async (req, res) => {
  requireId(req.params.id, 'Invoice');
  const method = oneOf(req.body?.method || 'cash', RECEIPT_METHODS, 'Payment method');
  const amount = round2(positive(req.body?.amount, 'Amount received'));
  const sale = await Sale.findById(req.params.id);
  if (!sale) throw new ApiError(404, 'Invoice not found.');
  if (['cancelled', 'held'].includes(sale.status)) throw new ApiError(400, `A ${sale.status} invoice cannot take payments.`);
  const due = round2(sale.amountDue || 0);
  if (due <= 0) throw new ApiError(400, 'Nothing is due on this invoice.');
  if (amount > due + 0.001) throw new ApiError(400, `Amount (₹${amount}) is more than the balance due (₹${due}).`);

  // Only if nobody else took a payment at the same moment (never below zero).
  const claimed = await Sale.findOneAndUpdate(
    { _id: sale._id, amountDue: sale.amountDue },
    { $set: { amountDue: round2(due - amount), amountPaid: round2((sale.amountPaid || 0) + amount) } },
    { new: true },
  );
  if (!claimed) throw new ApiError(409, 'This invoice was just updated by someone else. Refresh and try again.');

  const voucherNumber = await generateDocNumber('receiptVoucher');
  const payment = await Payment.create({
    voucherNumber, direction: 'incoming', purpose: 'customer_receipt', party: sale.customer, partyModel: sale.customer ? 'Customer' : undefined,
    referenceType: 'Sale', referenceId: sale._id, referenceNumber: sale.invoiceNumber, method, amount, recordedBy: req.user._id,
    notes: req.body?.notes ? String(req.body.notes).slice(0, 200) : undefined,
  });
  await postLedgerPair({
    debitKey: methodToAccountKey(method), creditKey: 'receivable', amount,
    narration: `Receipt ${voucherNumber} against ${sale.invoiceNumber}`, referenceType: 'Payment', referenceId: payment._id, userId: req.user._id,
  });
  if (sale.customer) await Customer.updateOne({ _id: sale.customer }, { $inc: { outstanding: -amount } });
  const data = await Sale.findByIdAndUpdate(sale._id, {
    $push: { receipts: { amount, method, voucherNumber, payment: payment._id, receivedBy: req.user._id } },
  }, { new: true }).populate('customer', 'name phone outstanding');
  await recordAudit({ req, action: 'sale.receipt', entity: 'Sale', entityId: sale._id, newValue: { amount, method, voucherNumber } });
  res.json({ success: true, data });
});

// ---------- brands of a product at billing: each brand's stock (from its batches) ----------
export const saleProductBrands = catchAsync(async (req, res) => {
  const productId = requireId(req.params.productId, 'Product');
  const product = await Product.findById(productId).select('name brand brands').populate('brand', 'name').populate('brands', 'name').lean();
  if (!product) throw new ApiError(404, 'Product not found.');
  const stock = await Batch.aggregate([
    { $match: { product: oid(productId), availableQuantity: { $gt: 0 } } },
    { $group: { _id: '$brand', stock: { $sum: '$availableQuantity' }, sellingPrice: { $last: '$sellingPrice' } } },
  ]);
  const byId = new Map(stock.map((s) => [String(s._id || ''), s]));
  const brands = new Map();
  [product.brand, ...(product.brands || [])].filter(Boolean).forEach((b) => brands.set(String(b._id), b.name));
  const ids = stock.map((s) => s._id).filter(Boolean).filter((id) => !brands.has(String(id)));
  if (ids.length) {
    const { default: Brand } = await import('../models/Brand.js');
    (await Brand.find({ _id: { $in: ids } }).select('name').lean()).forEach((b) => brands.set(String(b._id), b.name));
  }
  const total = (await Inventory.aggregate([{ $match: { product: oid(productId) } }, { $group: { _id: null, s: { $sum: '$currentStock' } } }]))[0]?.s || 0;
  const data = [...brands].map(([id, name]) => ({ brandId: id, brandName: name, stock: byId.get(id)?.stock || 0 }))
    .sort((a, b) => b.stock - a.stock || a.brandName.localeCompare(b.brandName));
  res.json({ success: true, data, totalStock: total, unbranded: byId.get('')?.stock || 0 });
});

// ---------- party ledgers ----------
const istStart = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00.000+05:30`);
const istEnd = (d) => new Date(`${String(d).slice(0, 10)}T23:59:59.999+05:30`);

// Builds rows (date, type, reference, debit, credit) and running balance; opening balance = rows before `from`.
function withBalance(rows, from, to) {
  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  let opening = 0;
  let balance = 0;
  const out = [];
  for (const r of rows) {
    balance = round2(balance + (r.debit || 0) - (r.credit || 0));
    if (from && new Date(r.date) < istStart(from)) { opening = balance; continue; }
    if (to && new Date(r.date) > istEnd(to)) continue;
    out.push({ ...r, balance });
  }
  const totals = { debit: round2(out.reduce((t, r) => t + (r.debit || 0), 0)), credit: round2(out.reduce((t, r) => t + (r.credit || 0), 0)) };
  return { rows: out, opening, closing: out.length ? out[out.length - 1].balance : opening, totals };
}

// Customer: Debit = bill value; Credit = paid at billing, later receipts, returns (value of goods back).
// Refund paid out on a return is a Debit (money given back). Balance = what the customer owes.
async function customerLedgerRows(customerId) {
  const id = oid(customerId);
  const [sales, returns] = await Promise.all([
    Sale.find({ customer: id, status: { $nin: ['held'] } }).select('invoiceNumber createdAt grandTotal payments receipts status creditAmount').lean(),
    SalesReturn.find({ customer: id }).populate('sale', 'invoiceNumber').lean(),
  ]);
  const rows = [];
  for (const s of sales) {
    rows.push({ date: s.createdAt, type: 'Sale', reference: s.invoiceNumber, debit: s.grandTotal, credit: 0, note: s.status === 'cancelled' ? 'Cancelled' : '' });
    const paidAtBill = (s.payments || []).filter((p) => p.method !== 'credit').reduce((t, p) => t + (p.amount || 0) - (p.changeReturned || 0), 0);
    if (paidAtBill > 0) rows.push({ date: s.createdAt, type: 'Paid at billing', reference: s.invoiceNumber, debit: 0, credit: round2(Math.min(paidAtBill, s.grandTotal)) });
    for (const r of s.receipts || []) rows.push({ date: r.receivedAt, type: `Receipt (${r.method.replace('_', ' ')})`, reference: `${r.voucherNumber} / ${s.invoiceNumber}`, debit: 0, credit: r.amount });
    if (s.status === 'cancelled') rows.push({ date: s.createdAt, type: 'Bill cancelled', reference: s.invoiceNumber, debit: 0, credit: round2(s.grandTotal - Math.min(paidAtBill, s.grandTotal)) });
  }
  for (const r of returns) {
    rows.push({ date: r.createdAt, type: 'Sales return', reference: `${r.returnNumber} / ${r.sale?.invoiceNumber || ''}`, debit: 0, credit: r.totalRefund });
    const refund = r.refundPaid ?? r.totalRefund;
    if (r.refundMethod !== 'store_credit' && refund > 0) rows.push({ date: r.createdAt, type: `Refund (${r.refundMethod})`, reference: r.returnNumber, debit: refund, credit: 0 });
  }
  return rows;
}

// Supplier: Credit = purchase invoice value (we owe); Debit = payments and purchase returns. Balance shown as
// what we owe the supplier (credit - debit).
async function vendorLedgerRows(vendorId) {
  const id = oid(vendorId);
  const [invoices, returns, payments, legacy] = await Promise.all([
    PurchaseInvoice.find({ vendor: id, status: { $ne: 'cancelled' } }).select('invoiceNumber vendorInvoiceNumber poNumber invoiceDate createdAt grandTotal').lean(),
    PurchaseReturn.find({ vendor: id }).select('returnNumber invoiceNumber createdAt totalAmount').lean(),
    Payment.find({ party: id, partyModel: 'Vendor', direction: 'outgoing' }).select('voucherNumber referenceNumber method amount paymentDate createdAt').lean(),
    // Orders from before Purchase Invoices existed: their full value was payable.
    Purchase.find({ vendor: id, invoicedAmount: { $exists: false }, status: { $in: PAYABLE_STATUSES } }).select('poNumber createdAt grandTotal amountPaid').lean(),
  ]);
  const rows = [];
  invoices.forEach((i) => rows.push({ date: i.invoiceDate || i.createdAt, type: 'Purchase invoice', reference: `${i.invoiceNumber}${i.vendorInvoiceNumber ? ` (${i.vendorInvoiceNumber})` : ''} / ${i.poNumber}`, debit: 0, credit: i.grandTotal }));
  legacy.forEach((p) => rows.push({ date: p.createdAt, type: 'Purchase (old order)', reference: p.poNumber, debit: 0, credit: p.grandTotal }));
  returns.forEach((r) => rows.push({ date: r.createdAt, type: 'Purchase return', reference: `${r.returnNumber} / ${r.invoiceNumber || ''}`, debit: r.totalAmount, credit: 0 }));
  payments.forEach((p) => rows.push({ date: p.paymentDate || p.createdAt, type: `Payment (${p.method.replace('_', ' ')})`, reference: `${p.voucherNumber}${p.referenceNumber ? ` / ${p.referenceNumber}` : ''}`, debit: p.amount, credit: 0 }));
  // Supplier view: balance = owed to the supplier, so flip the sign convention.
  return rows.map((r) => ({ ...r, debit: r.credit, credit: r.debit, _flipped: true }));
}

const LEDGER_COLUMNS = [
  { key: 'date', label: 'Date', type: 'date' }, { key: 'type', label: 'Type' }, { key: 'reference', label: 'Reference', weight: 2 },
  { key: 'debit', label: 'Debit', type: 'currency' }, { key: 'credit', label: 'Credit', type: 'currency' }, { key: 'balance', label: 'Balance', type: 'currency' },
];

export const partyLedger = catchAsync(async (req, res) => {
  const kind = oneOf(req.params.kind, ['customer', 'vendor'], 'Ledger type');
  const id = requireId(req.params.id, kind === 'customer' ? 'Customer' : 'Supplier');
  const party = kind === 'customer'
    ? await Customer.findById(id).select('name phone customerId outstanding').lean()
    : await Vendor.findById(id).select('name phone gstin verificationStatus').lean();
  if (!party) throw new ApiError(404, `${kind === 'customer' ? 'Customer' : 'Supplier'} not found.`);
  const raw = kind === 'customer' ? await customerLedgerRows(id) : await vendorLedgerRows(id);
  // Vendor rows were flipped: "debit" column = amount we owe more (invoice), "credit" = paid / returned.
  const result = withBalance(raw.map(({ _flipped, ...r }) => r), req.query.from, req.query.to); // eslint-disable-line no-unused-vars
  const labels = kind === 'customer'
    ? { debit: 'Sale / refund (Dr)', credit: 'Received / returned (Cr)', balance: 'Customer owes' }
    : { debit: 'Purchased (Cr)', credit: 'Paid / returned (Dr)', balance: 'We owe supplier' };

  if (req.query.format) {
    if (!EXPORT_FORMATS[req.query.format]) throw new ApiError(400, 'Format must be xlsx, pdf or csv.');
    const ds = {
      title: `${kind === 'customer' ? 'Customer' : 'Supplier'} Ledger - ${party.name}`,
      filtersText: `Period: ${req.query.from || 'start'} to ${req.query.to || 'today'}`,
      columns: LEDGER_COLUMNS.map((c) => ({ ...c, label: labels[c.key] || c.label })),
      rows: result.rows,
      summary: [
        { label: 'Opening balance', value: result.opening, type: 'currency' },
        { label: labels.debit, value: result.totals.debit, type: 'currency' },
        { label: labels.credit, value: result.totals.credit, type: 'currency' },
        { label: `Closing balance (${labels.balance})`, value: result.closing, type: 'currency' },
      ],
    };
    return sendExport(res, req.query.format, ds, `${kind}-ledger-${party.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
  }
  res.json({ success: true, data: { party, labels, ...result } });
});

// ---------- dashboard: sales & purchase summary ----------
const istDay = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

async function salesTotals(match) {
  const [r] = await Sale.aggregate([
    { $match: { status: { $nin: ['held', 'cancelled'] }, ...match } },
    {
      $project: {
        grandTotal: 1,
        credit: { $ifNull: ['$creditAmount', { $sum: { $map: { input: { $filter: { input: { $ifNull: ['$payments', []] }, cond: { $eq: ['$$this.method', 'credit'] } } }, in: '$$this.amount' } } }] },
      },
    },
    { $group: { _id: null, total: { $sum: '$grandTotal' }, credit: { $sum: '$credit' }, bills: { $sum: 1 } } },
  ]);
  const total = round2(r?.total || 0); const credit = round2(r?.credit || 0);
  return { total, credit, cash: round2(total - credit), bills: r?.bills || 0 };
}

async function purchaseTotals(from, to) {
  const range = (f) => ({ ...(from || to ? { [f]: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}) });
  const [inv, old] = await Promise.all([
    PurchaseInvoice.aggregate([
      { $match: { status: { $ne: 'cancelled' }, ...range('invoiceDate') } },
      { $project: { grandTotal: 1, atEntry: { $sum: { $map: { input: { $filter: { input: { $ifNull: ['$payments', []] }, cond: { $eq: ['$$this.atEntry', true] } } }, in: '$$this.amount' } } } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, cash: { $sum: '$atEntry' }, bills: { $sum: 1 } } },
    ]),
    Purchase.aggregate([
      { $match: { invoicedAmount: { $exists: false }, status: { $in: PAYABLE_STATUSES }, ...range('createdAt') } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, bills: { $sum: 1 } } },
    ]),
  ]);
  const total = round2((inv[0]?.total || 0) + (old[0]?.total || 0));
  const cash = round2(inv[0]?.cash || 0);
  return { total, cash, credit: round2(total - cash), bills: (inv[0]?.bills || 0) + (old[0]?.bills || 0) };
}

export const tradeSummary = catchAsync(async (req, res) => {
  const from = req.query.from ? istStart(req.query.from) : null;
  const to = req.query.to ? istEnd(req.query.to) : null;
  const created = from || to ? { createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {};
  const today = istDay();
  const tStart = istStart(today); const tEnd = istEnd(today);

  const [sales, purchases, salesToday, purchasesToday, returnsAgg, custOut, suppOut, stock] = await Promise.all([
    salesTotals(created),
    purchaseTotals(from, to),
    salesTotals({ createdAt: { $gte: tStart, $lte: tEnd } }),
    purchaseTotals(tStart, tEnd),
    SalesReturn.aggregate([{ $match: created }, { $group: { _id: null, v: { $sum: '$totalRefund' } } }]),
    Customer.aggregate([{ $match: { outstanding: { $gt: 0.005 } } }, { $group: { _id: null, v: { $sum: '$outstanding' }, n: { $addToSet: '$_id' } } }]),
    Purchase.aggregate([
      { $match: { status: { $in: [...PAYABLE_STATUSES, 'approved'] } } },
      { $project: { vendor: 1, bal: { $subtract: [BILLED_EXPR, { $ifNull: ['$amountPaid', 0] }] } } },
      { $match: { bal: { $gt: 0.005 } } },
      { $group: { _id: null, v: { $sum: '$bal' }, n: { $addToSet: '$vendor' } } },
    ]),
    Inventory.aggregate([
      { $group: { _id: '$product', qty: { $sum: '$currentStock' } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p', pipeline: [{ $project: { purchasePrice: 1, reorderLevel: 1, status: 1 } }] } },
      { $unwind: '$p' },
      { $match: { 'p.status': { $ne: 'discontinued' } } },
      { $lookup: { from: 'batches', let: { pid: '$_id' }, as: 'b', pipeline: [{ $match: { $expr: { $eq: ['$product', '$$pid'] } } }, { $sort: { createdAt: -1 } }, { $limit: 1 }, { $project: { purchasePrice: 1 } }] } },
      {
        $group: {
          _id: null,
          units: { $sum: { $max: ['$qty', 0] } },
          value: { $sum: { $multiply: [{ $max: ['$qty', 0] }, { $cond: [{ $gt: ['$p.purchasePrice', 0] }, '$p.purchasePrice', { $ifNull: [{ $first: '$b.purchasePrice' }, 0] }] }] } },
          inStock: { $sum: { $cond: [{ $gt: ['$qty', 0] }, 1, 0] } },
          low: { $sum: { $cond: [{ $and: [{ $gt: ['$qty', 0] }, { $lte: ['$qty', { $ifNull: ['$p.reorderLevel', 10] }] }] }, 1, 0] } },
          out: { $sum: { $cond: [{ $lte: ['$qty', 0] }, 1, 0] } },
        },
      },
    ]),
  ]);

  // Monthly sales vs purchases (last 12 months, or the chosen range).
  const mFrom = from || new Date(Date.now() - 365 * 86400e3);
  const month = (f) => ({ $dateToString: { format: '%Y-%m', date: f, timezone: 'Asia/Kolkata' } });
  const [mSales, mInv, mRet] = await Promise.all([
    Sale.aggregate([{ $match: { status: { $nin: ['held', 'cancelled'] }, createdAt: { $gte: mFrom, ...(to ? { $lte: to } : {}) } } }, { $group: { _id: month('$createdAt'), v: { $sum: '$grandTotal' }, credit: { $sum: { $ifNull: ['$creditAmount', 0] } } } }]),
    PurchaseInvoice.aggregate([{ $match: { status: { $ne: 'cancelled' }, invoiceDate: { $gte: mFrom, ...(to ? { $lte: to } : {}) } } }, { $group: { _id: month('$invoiceDate'), v: { $sum: '$grandTotal' } } }]),
    Purchase.aggregate([{ $match: { invoicedAmount: { $exists: false }, status: { $in: PAYABLE_STATUSES }, createdAt: { $gte: mFrom, ...(to ? { $lte: to } : {}) } } }, { $group: { _id: month('$createdAt'), v: { $sum: '$grandTotal' } } }]),
  ]);
  const months = new Map();
  const add = (k, field, v) => { const m = months.get(k) || { month: k, sales: 0, purchases: 0, creditSales: 0 }; m[field] = round2(m[field] + v); months.set(k, m); };
  mSales.forEach((r) => { add(r._id, 'sales', r.v); add(r._id, 'creditSales', r.credit); });
  mInv.forEach((r) => add(r._id, 'purchases', r.v));
  mRet.forEach((r) => add(r._id, 'purchases', r.v));
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));

  const st = stock[0] || {};
  res.json({
    success: true,
    data: {
      period: { from: req.query.from || null, to: req.query.to || null },
      sales: { ...sales, returns: round2(returnsAgg[0]?.v || 0), net: round2(sales.total - (returnsAgg[0]?.v || 0)) },
      purchases,
      today: { sales: salesToday.total, salesBills: salesToday.bills, purchases: purchasesToday.total, purchaseBills: purchasesToday.bills, date: today },
      customerOutstanding: { value: round2(custOut[0]?.v || 0), customers: (custOut[0]?.n || []).filter(Boolean).length },
      supplierOutstanding: { value: round2(suppOut[0]?.v || 0), suppliers: (suppOut[0]?.n || []).length },
      stock: { value: round2(st.value || 0), units: round2(st.units || 0), inStock: st.inStock || 0, lowStock: st.low || 0, outOfStock: st.out || 0 },
      monthly,
    },
  });
});

export default { resolveSaleCustomer, receiveSalePayment, saleProductBrands, partyLedger, tradeSummary };
