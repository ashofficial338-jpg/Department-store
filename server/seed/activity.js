import mongoose from 'mongoose';
import connectDB from '../config/db.js';

import User from '../models/User.js';
import Store from '../models/Store.js';
import DistributionCenter from '../models/DistributionCenter.js';
import Customer from '../models/Customer.js';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import InventoryTransaction from '../models/InventoryTransaction.js';
import Sale from '../models/Sale.js';
import SalesReturn from '../models/SalesReturn.js';
import Purchase from '../models/Purchase.js';
import PurchaseReturn from '../models/PurchaseReturn.js';
import StockTransfer from '../models/StockTransfer.js';
import InwardDC from '../models/InwardDC.js';
import OutwardDC from '../models/OutwardDC.js';
import Payment from '../models/Payment.js';
import Expense from '../models/Expense.js';
import Account from '../models/Account.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Counter from '../models/Counter.js';

import { getSystemAccount, methodToAccountKey } from '../utils/ledger.js';
import { getFinancialYearCode } from '../utils/financialYear.js';
import { round2 } from '../utils/gstCalculator.js';
import { randomInt, pick, daysAgo } from './seedConstants.js';

// Fills the modules `npm run seed` leaves empty - sales/purchase returns, stock transfers, inward and
// outward DCs, payment vouchers and the full accounts ledger - on top of the existing sales and purchases.
// Nothing is cleared except the ledger, which is rebuilt from every sale, purchase, expense, return and
// payment so account balances always reconcile. Refuses to run twice (returns would double-count stock).

const oid = () => new mongoose.Types.ObjectId();
const PREFIXES = { saleReturn: 'SRT', purchaseReturn: 'PRT', inwardDC: 'IDC', outwardDC: 'ODC', stockTransfer: 'STF', paymentVoucher: 'PV', receiptVoucher: 'RV' };
const REASONS = ['Damaged packaging', 'Wrong size', 'Customer changed mind', 'Near expiry', 'Defective item'];
const VENDOR_RETURN_REASONS = ['Damaged in transit', 'Short expiry', 'Quality issue', 'Excess supply'];
const DRIVERS = ['Ramesh Kumar', 'Suresh Babu', 'Manoj Yadav', 'Arjun Pillai', 'Ganesh Patil'];

// Sequential FY-scoped numbers continuing from the app's counters, so later live documents never collide.
const seqs = {};
async function nextNumber(type, date) {
  const key = `${type}:${getFinancialYearCode(date)}`;
  if (seqs[key] === undefined) seqs[key] = (await Counter.findOne({ key }))?.seq || 0;
  seqs[key] += 1;
  return `${PREFIXES[type]}/${getFinancialYearCode(date)}/${String(seqs[key]).padStart(6, '0')}`;
}
async function saveCounters() {
  for (const [key, seq] of Object.entries(seqs)) await Counter.updateOne({ key }, { $max: { seq } }, { upsert: true });
}

const after = (date, hours) => new Date(date.getTime() + hours * 3600 * 1000);
const raw = (Model, rows) => (rows.length ? Model.collection.insertMany(rows, { ordered: false }) : null);

// Inventory deltas are collected and applied once at the end.
const stockDelta = new Map();
function moveStock(product, locField, loc, delta) {
  const k = `${product}|${locField}|${loc}`;
  stockDelta.set(k, (stockDelta.get(k) || 0) + delta);
}

// Rebuilds the whole ledger from the documents in the database, using the same postings as the controllers,
// plus month-end deposits of cash and UPI collections into the bank (vendors are paid from the bank).
// Balances are then reset to opening + debits - credits (the postLedgerPair convention).
async function rebuildLedger() {
  const acc = {};
  for (const k of ['cash', 'bank', 'upi', 'sales', 'purchases', 'receivable', 'payable', 'gstOutput', 'expenses']) acc[k] = (await getSystemAccount(k))._id;
  const moneyAcc = (method) => acc[methodToAccountKey(method)];
  const ledger = [];
  const post = (debit, credit, amount, narration, referenceType, referenceId, date, userId) => {
    amount = round2(amount);
    if (!amount || amount <= 0) return;
    const base = { amount, narration, referenceType, referenceId, entryDate: date, createdBy: userId, createdAt: date, updatedAt: date, __v: 0 };
    ledger.push({ _id: oid(), account: debit, entryType: 'debit', ...base }, { _id: oid(), account: credit, entryType: 'credit', ...base });
  };

  const [sales, purchases, expenses, salesReturns, purchaseReturns, payments] = await Promise.all([
    Sale.find({ status: { $ne: 'held' } }, 'invoiceNumber payments taxAmount cashier createdAt').lean(),
    Purchase.find({}, 'poNumber status grandTotal amountPaid orderedBy createdAt').lean(),
    Expense.find().lean(),
    SalesReturn.find().populate('sale', 'invoiceNumber').lean(),
    PurchaseReturn.find().populate('purchase', 'poNumber').lean(),
    Payment.find().lean(),
  ]);
  const voucherPOs = new Set(payments.filter((p) => p.referenceType === 'Purchase').map((p) => String(p.referenceId)));

  for (const sale of sales) {
    for (const p of sale.payments || []) post(moneyAcc(p.method), acc.sales, p.amount, `Sale ${sale.invoiceNumber}`, 'Sale', sale._id, sale.createdAt, sale.cashier);
    post(acc.sales, acc.gstOutput, sale.taxAmount, `GST on ${sale.invoiceNumber}`, 'Sale', sale._id, sale.createdAt, sale.cashier);
  }
  for (const po of purchases) {
    if (po.status === 'invoiced') post(acc.purchases, acc.payable, po.grandTotal, `Purchase ${po.poNumber}`, 'Purchase', po._id, po.createdAt, po.orderedBy);
    if (po.amountPaid > 0 && !voucherPOs.has(String(po._id))) post(acc.payable, acc.bank, po.amountPaid, `Payment for ${po.poNumber}`, 'Purchase', po._id, after(po.createdAt, 72), po.orderedBy);
  }
  for (const e of expenses) post(acc.expenses, moneyAcc(e.paymentMethod), e.amount, e.description, 'Expense', e._id, e.expenseDate || e.createdAt, e.recordedBy);
  for (const r of salesReturns) {
    post(acc.sales, r.refundMethod === 'store_credit' ? acc.receivable : moneyAcc(r.refundMethod), r.totalRefund, `Return against ${r.sale?.invoiceNumber}`, 'SalesReturn', r._id, r.createdAt, r.processedBy);
  }
  for (const r of purchaseReturns) post(acc.payable, acc.purchases, r.totalAmount, `Return against ${r.purchase?.poNumber}`, 'PurchaseReturn', r._id, r.createdAt, r.processedBy);
  for (const p of payments) {
    const date = p.paymentDate || p.createdAt;
    if (p.direction === 'incoming') post(moneyAcc(p.method), acc.receivable, p.amount, `Receipt ${p.voucherNumber}`, 'Payment', p._id, date, p.recordedBy);
    else post(acc.payable, moneyAcc(p.method), p.amount, `Payment ${p.voucherNumber}`, 'Payment', p._id, date, p.recordedBy);
  }

  // Month-end banking: deposit cash above a ₹2 lakh till float and sweep all UPI settlements into the bank.
  const accounts = await Account.find();
  const opening = new Map(accounts.map((a) => [String(a._id), a.openingBalance || 0]));
  const sign = (l) => (l.entryType === 'debit' ? l.amount : -l.amount);
  ledger.sort((a, b) => a.entryDate - b.entryDate);
  const deposits = [];
  if (ledger.length) {
    const bal = { cash: opening.get(String(acc.cash)), upi: opening.get(String(acc.upi)) };
    const admin = (await User.findOne({ role: 'accountant' }))?._id;
    let i = 0;
    const end = new Date();
    for (let m = new Date(ledger[0].entryDate.getFullYear(), ledger[0].entryDate.getMonth() + 1, 1); m <= end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      for (; i < ledger.length && ledger[i].entryDate < m; i++) {
        const id = String(ledger[i].account);
        if (id === String(acc.cash)) bal.cash += sign(ledger[i]);
        if (id === String(acc.upi)) bal.upi += sign(ledger[i]);
      }
      const at = new Date(m.getTime() - 60 * 60 * 1000); // last day of the month, 11 pm
      const cashDeposit = round2(bal.cash - 200000);
      const into = [];
      if (cashDeposit > 0) { into.push(['cash', cashDeposit, 'Cash deposited to bank']); bal.cash -= cashDeposit; }
      if (bal.upi > 0) { into.push(['upi', round2(bal.upi), 'UPI settlement to bank']); bal.upi = 0; }
      for (const [key, amount, narration] of into) {
        const base = { amount, narration, referenceType: 'Contra', entryDate: at, createdBy: admin, createdAt: at, updatedAt: at, __v: 0 };
        deposits.push({ _id: oid(), account: acc.bank, entryType: 'debit', ...base }, { _id: oid(), account: acc[key], entryType: 'credit', ...base });
      }
    }
  }
  ledger.push(...deposits);

  await LedgerEntry.deleteMany({});
  for (let k = 0; k < ledger.length; k += 5000) await raw(LedgerEntry, ledger.slice(k, k + 5000));
  const net = new Map();
  for (const l of ledger) net.set(String(l.account), (net.get(String(l.account)) || 0) + sign(l));
  for (const a of accounts) await Account.updateOne({ _id: a._id }, { $set: { currentBalance: round2((a.openingBalance || 0) + (net.get(String(a._id)) || 0)) } });
  return ledger.length;
}

async function run() {
  await connectDB();

  if (process.argv.includes('--ledger')) {
    console.log(`[seed:activity] Ledger rebuilt: ${await rebuildLedger()} entries.`);
    return;
  }

  const already = await Promise.all([SalesReturn, PurchaseReturn, StockTransfer, InwardDC, OutwardDC, Payment].map((M) => M.countDocuments()));
  if (already.some((n) => n > 0)) {
    console.log('[seed:activity] Activity data already exists - skipping so stock is not double-counted.');
    console.log('[seed:activity] For a fresh start run: npm run seed && npm run seed:activity');
    return;
  }

  const [users, stores, dcs, products] = await Promise.all([User.find(), Store.find(), DistributionCenter.find(), Product.find({}, 'name costPrice sellingPrice gstRate')]);
  if (!stores.length || !products.length) throw new Error('No stores/products found - run `npm run seed` first.');
  const byRole = (role) => users.find((u) => u.role === role)?._id || users[0]._id;
  const storeStock = new Map((await Inventory.find({ store: { $ne: null } }, 'product store currentStock').lean())
    .map((i) => [`${i.product}|${i.store}`, i.currentStock]));

  const invTx = [];
  // ---------- Sales returns: ~1% of the last 6 months of sales ----------
  const recentSales = await Sale.find({ status: 'completed', createdAt: { $gte: daysAgo(180) } }).lean();
  const returnSales = recentSales.filter(() => Math.random() < 0.01);
  const salesReturns = [];
  const saleStatus = [];
  for (const sale of returnSales) {
    const lines = sale.items.filter(() => Math.random() < 0.5);
    if (!lines.length) lines.push(sale.items[0]);
    const date = after(sale.createdAt, randomInt(24, 24 * 10));
    const items = lines.map((l) => {
      const qty = randomInt(1, l.quantity);
      const restockStatus = Math.random() < 0.8 ? 'restocked' : 'damaged';
      return { product: l.product, quantity: qty, unitPrice: l.unitPrice, refundAmount: round2((l.totalAmount / l.quantity) * qty), reason: pick(REASONS), restockStatus };
    });
    const totalRefund = round2(items.reduce((s, i) => s + i.refundAmount, 0));
    const refundMethod = sale.customer && Math.random() < 0.2 ? 'store_credit' : (sale.payments?.[0]?.method === 'credit' ? 'cash' : sale.payments?.[0]?.method || 'cash');
    const doc = { _id: oid(), returnNumber: await nextNumber('saleReturn', date), sale: sale._id, customer: sale.customer, items, refundMethod, totalRefund, processedBy: byRole('store_manager'), createdAt: date, updatedAt: date, __v: 0 };
    salesReturns.push(doc);
    const fullyReturned = items.reduce((s, i) => s + i.quantity, 0) >= sale.items.reduce((s, l) => s + l.quantity, 0);
    saleStatus.push({ updateOne: { filter: { _id: sale._id }, update: { $set: { status: fullyReturned ? 'returned' : 'partially_returned' } } } });
    for (const i of items) {
      if (i.restockStatus === 'restocked') moveStock(i.product, 'store', sale.store, i.quantity);
      invTx.push({ product: i.product, quantity: i.quantity, type: 'sale_return', destination: sale.store, destinationModel: 'Store', referenceType: 'SalesReturn', referenceId: doc._id, referenceNumber: sale.invoiceNumber, notes: i.reason, user: doc.processedBy, createdAt: date, updatedAt: date, __v: 0 });
    }
  }

  // ---------- Purchase returns: ~1% of invoiced purchases ----------
  const purchases = await Purchase.find().lean();
  const purchaseReturns = [];
  for (const po of purchases.filter((p) => p.status === 'invoiced' && Math.random() < 0.01)) {
    const date = after(po.createdAt, randomInt(48, 24 * 7));
    const items = [];
    for (const l of po.items.slice(0, randomInt(1, 2))) {
      const key = `${l.product}|${po.store}`;
      const qty = Math.min(randomInt(1, Math.max(1, Math.floor(l.quantity / 4))), storeStock.get(key) || 0);
      if (qty < 1) continue;
      storeStock.set(key, storeStock.get(key) - qty);
      items.push({ product: l.product, quantity: qty, unitPrice: l.unitPrice, reason: pick(VENDOR_RETURN_REASONS) });
    }
    if (!items.length) continue;
    const totalAmount = round2(items.reduce((s, i) => {
      const line = po.items.find((x) => String(x.product) === String(i.product));
      return s + i.quantity * i.unitPrice * (1 + (line.gstRate || 0) / 100);
    }, 0));
    const doc = { _id: oid(), returnNumber: await nextNumber('purchaseReturn', date), purchase: po._id, vendor: po.vendor, items, totalAmount, processedBy: byRole('purchase_manager'), createdAt: date, updatedAt: date, __v: 0 };
    purchaseReturns.push(doc);
    for (const i of items) {
      moveStock(i.product, 'store', po.store, -i.quantity);
      invTx.push({ product: i.product, quantity: -i.quantity, type: 'purchase_return', source: po.store, sourceModel: 'Store', referenceType: 'PurchaseReturn', referenceId: doc._id, referenceNumber: po.poNumber, notes: i.reason, user: doc.processedBy, createdAt: date, updatedAt: date, __v: 0 });
    }
  }

  // ---------- Inward DCs: vendor deliveries into the distribution centres ----------
  const inwardDCs = [];
  const dcStock = new Map(); // `${product}|${dc}` -> qty received, feeds outward DCs below
  const vendorPOs = purchases.filter((p) => p.status === 'invoiced');
  if (dcs.length) {
    for (let n = 0; n < 24; n++) {
      const po = pick(vendorPOs);
      const dc = dcs[n % dcs.length];
      const age = randomInt(1, 120);
      const date = daysAgo(age);
      const status = age <= 3 ? pick(['draft', 'pending']) : age <= 6 ? pick(['received', 'partially_received']) : (Math.random() < 0.07 ? 'rejected' : 'completed');
      const items = po.items.map((l) => {
        const expected = l.quantity * randomInt(3, 6);
        let received = 0;
        let qualityCheckPassed = null;
        let rejectReason;
        if (status === 'completed' || status === 'received') { received = expected; qualityCheckPassed = true; }
        if (status === 'partially_received') { received = Math.floor(expected * 0.7); qualityCheckPassed = true; }
        if (status === 'rejected') { qualityCheckPassed = false; rejectReason = pick(VENDOR_RETURN_REASONS); }
        return { product: l.product, expectedQuantity: expected, receivedQuantity: received, qualityCheckPassed, rejectReason };
      });
      const doc = { _id: oid(), docNumber: await nextNumber('inwardDC', date), distributionCenter: dc._id, sourceType: 'Purchase', sourceReference: po._id, vendor: po.vendor, items, status, notes: `Against ${po.poNumber}`, receivedBy: byRole('dc_manager'), createdAt: date, updatedAt: date, __v: 0 };
      inwardDCs.push(doc);
      for (const i of items) {
        if (!i.receivedQuantity) continue;
        moveStock(i.product, 'distributionCenter', dc._id, i.receivedQuantity);
        const k = `${i.product}|${dc._id}`;
        dcStock.set(k, (dcStock.get(k) || 0) + i.receivedQuantity);
        invTx.push({ product: i.product, quantity: i.receivedQuantity, type: 'inward_dc', destination: dc._id, destinationModel: 'DistributionCenter', referenceType: 'InwardDC', referenceId: doc._id, referenceNumber: doc.docNumber, user: doc.receivedBy, createdAt: date, updatedAt: date, __v: 0 });
      }
    }
  }

  // ---------- Outward DCs: DC -> store replenishment, drawn from what the DCs received ----------
  const outwardDCs = [];
  const dcAvailable = [...dcStock.entries()].map(([k, qty]) => { const [product, dc] = k.split('|'); return { product, dc, qty }; });
  for (let n = 0; n < 20 && dcAvailable.some((x) => x.qty > 5); n++) {
    const dcId = pick(dcAvailable.filter((x) => x.qty > 5)).dc;
    const pool = dcAvailable.filter((x) => x.dc === dcId && x.qty > 5);
    const picks = pool.sort(() => Math.random() - 0.5).slice(0, randomInt(1, 4));
    const age = randomInt(0, 90);
    const status = age <= 2 ? pick(['draft', 'approved', 'picking', 'packed']) : age <= 5 ? 'dispatched' : (Math.random() < 0.06 ? 'cancelled' : 'received');
    const store = pick(stores);
    const created = daysAgo(age + 1);
    const items = picks.map((x) => ({ product: new mongoose.Types.ObjectId(x.product), quantity: randomInt(5, Math.min(x.qty, 40)) }));
    const moved = ['dispatched', 'received'].includes(status);
    const dispatchedAt = moved ? after(created, 6) : undefined;
    const receivedAt = status === 'received' ? after(created, 30) : undefined;
    const doc = {
      _id: oid(), docNumber: await nextNumber('outwardDC', created), sourceDC: new mongoose.Types.ObjectId(dcId), destinationType: 'Store', destination: store._id, items, status,
      transportDetails: { vehicleNumber: `${pick(['TS', 'MH', 'TN', 'KA'])} ${randomInt(10, 99)} ${pick(['AB', 'CK', 'EF', 'MX'])} ${randomInt(1000, 9999)}`, driverName: pick(DRIVERS), driverPhone: `9${randomInt(100000000, 999999999)}` },
      responsibleEmployee: byRole('dc_manager'), approvedBy: status === 'draft' ? undefined : byRole('admin'), dispatchedAt, receivedAt, createdAt: created, updatedAt: receivedAt || dispatchedAt || created, __v: 0,
    };
    outwardDCs.push(doc);
    if (!moved) continue;
    for (const i of items) {
      const src = picks.find((x) => x.product === String(i.product));
      src.qty -= i.quantity;
      moveStock(i.product, 'distributionCenter', dcId, -i.quantity);
      invTx.push({ product: i.product, quantity: -i.quantity, type: 'outward_dc', source: doc.sourceDC, sourceModel: 'DistributionCenter', destination: store._id, destinationModel: 'Store', referenceType: 'OutwardDC', referenceId: doc._id, referenceNumber: doc.docNumber, user: doc.responsibleEmployee, createdAt: dispatchedAt, updatedAt: dispatchedAt, __v: 0 });
      if (status === 'received') {
        moveStock(i.product, 'store', store._id, i.quantity);
        invTx.push({ product: i.product, quantity: i.quantity, type: 'stock_transfer_in', source: doc.sourceDC, sourceModel: 'DistributionCenter', destination: store._id, destinationModel: 'Store', referenceType: 'OutwardDC', referenceId: doc._id, referenceNumber: doc.docNumber, user: doc.responsibleEmployee, createdAt: receivedAt, updatedAt: receivedAt, __v: 0 });
      }
    }
  }

  // ---------- Stock transfers between stores ----------
  const transfers = [];
  for (let n = 0; n < 25 && stores.length > 1; n++) {
    const [src, dest] = [...stores].sort(() => Math.random() - 0.5);
    const age = randomInt(0, 100);
    const status = age <= 2 ? 'pending' : age <= 4 ? 'in_transit' : (Math.random() < 0.08 ? 'cancelled' : 'completed');
    const date = daysAgo(age);
    const items = [];
    for (const p of [...products].sort(() => Math.random() - 0.5).slice(0, randomInt(1, 4))) {
      const key = `${p._id}|${src._id}`;
      const qty = Math.min(randomInt(3, 15), Math.floor((storeStock.get(key) || 0) / 3));
      if (qty < 1) continue;
      if (['in_transit', 'completed'].includes(status)) storeStock.set(key, storeStock.get(key) - qty);
      items.push({ product: p._id, quantity: qty });
    }
    if (!items.length) continue;
    const doc = { _id: oid(), transferNumber: await nextNumber('stockTransfer', date), sourceType: 'Store', source: src._id, destinationType: 'Store', destination: dest._id, items, status, notes: `Rebalancing stock ${src.code} -> ${dest.code}`, requestedBy: byRole('store_manager'), createdAt: date, updatedAt: date, __v: 0 };
    transfers.push(doc);
    if (!['in_transit', 'completed'].includes(status)) continue;
    for (const i of items) {
      moveStock(i.product, 'store', src._id, -i.quantity);
      invTx.push({ product: i.product, quantity: -i.quantity, type: 'stock_transfer_out', source: src._id, sourceModel: 'Store', destination: dest._id, destinationModel: 'Store', referenceType: 'StockTransfer', referenceId: doc._id, referenceNumber: doc.transferNumber, user: doc.requestedBy, createdAt: date, updatedAt: date, __v: 0 });
      if (status === 'completed') {
        const done = after(date, 20);
        moveStock(i.product, 'store', dest._id, i.quantity);
        invTx.push({ product: i.product, quantity: i.quantity, type: 'stock_transfer_in', source: src._id, sourceModel: 'Store', destination: dest._id, destinationModel: 'Store', referenceType: 'StockTransfer', referenceId: doc._id, referenceNumber: doc.transferNumber, user: doc.requestedBy, createdAt: done, updatedAt: done, __v: 0 });
      }
    }
  }

  // ---------- Payment vouchers ----------
  const payments = [];
  const customerPaid = [];
  // Receipts: customers settling part of their credit balance.
  for (const c of await Customer.find({ outstanding: { $gt: 500 } }).lean()) {
    const amount = round2(c.outstanding * (Math.random() < 0.3 ? 1 : randomInt(30, 70) / 100));
    const date = daysAgo(randomInt(1, 60));
    const method = pick(['cash', 'upi', 'upi', 'bank_transfer']);
    const doc = { _id: oid(), voucherNumber: await nextNumber('receiptVoucher', date), direction: 'incoming', purpose: 'customer_receipt', party: c._id, partyModel: 'Customer', method, amount, transactionRef: method === 'cash' ? undefined : `TXN${randomInt(10000000, 99999999)}`, paymentDate: date, recordedBy: byRole('accountant'), notes: 'Credit settlement', createdAt: date, updatedAt: date, __v: 0 };
    payments.push(doc);
    customerPaid.push({ updateOne: { filter: { _id: c._id }, update: { $inc: { outstanding: -amount } } } });
  }
  // Vendor payments: the latest invoiced purchases are settled through vouchers; older ones post directly below.
  for (const po of vendorPOs.filter((p) => p.amountPaid > 0).sort((a, b) => b.createdAt - a.createdAt).slice(0, 150)) {
    const date = after(po.createdAt, randomInt(24, 24 * 15));
    const method = pick(['bank_transfer', 'bank_transfer', 'upi', 'cash']);
    const doc = { _id: oid(), voucherNumber: await nextNumber('paymentVoucher', date), direction: 'outgoing', purpose: 'vendor_payment', party: po.vendor, partyModel: 'Vendor', referenceType: 'Purchase', referenceId: po._id, method, amount: po.amountPaid, transactionRef: method === 'cash' ? undefined : `NEFT${randomInt(10000000, 99999999)}`, paymentDate: date, recordedBy: byRole('accountant'), notes: `Payment for ${po.poNumber}`, createdAt: date, updatedAt: date, __v: 0 };
    payments.push(doc);
  }

  // ---------- Write everything ----------
  await raw(SalesReturn, salesReturns);
  if (saleStatus.length) await Sale.bulkWrite(saleStatus);
  await raw(PurchaseReturn, purchaseReturns);
  await raw(InwardDC, inwardDCs);
  await raw(OutwardDC, outwardDCs);
  await raw(StockTransfer, transfers);
  await raw(Payment, payments);
  if (customerPaid.length) await Customer.bulkWrite(customerPaid);
  for (let k = 0; k < invTx.length; k += 2000) await raw(InventoryTransaction, invTx.slice(k, k + 2000));

  const invOps = [...stockDelta.entries()].map(([k, delta]) => {
    const [product, field, loc] = k.split('|');
    const filter = { product: new mongoose.Types.ObjectId(product), [field]: new mongoose.Types.ObjectId(loc) };
    return { updateOne: { filter, update: { $inc: { currentStock: delta }, $setOnInsert: { createdAt: new Date() }, $set: { updatedAt: new Date() } }, upsert: true } };
  });
  if (invOps.length) await Inventory.bulkWrite(invOps);

  await saveCounters();
  const ledgerCount = await rebuildLedger();

  console.log(`[seed:activity] Sales returns:     ${salesReturns.length}`);
  console.log(`[seed:activity] Purchase returns:  ${purchaseReturns.length}`);
  console.log(`[seed:activity] Inward DCs:        ${inwardDCs.length}`);
  console.log(`[seed:activity] Outward DCs:       ${outwardDCs.length}`);
  console.log(`[seed:activity] Stock transfers:   ${transfers.length}`);
  console.log(`[seed:activity] Payment vouchers:  ${payments.length}`);
  console.log(`[seed:activity] Stock movements:   ${invTx.length}`);
  console.log(`[seed:activity] Ledger entries:    ${ledgerCount}`);
}

run()
  .catch((err) => { console.error('[seed:activity] Failed:', err); process.exitCode = 1; })
  .finally(() => mongoose.connection.close());
