import mongoose from 'mongoose';
import connectDB from '../config/db.js';

import User from '../models/User.js';
import Settings from '../models/Settings.js';
import TaxRate from '../models/TaxRate.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Store from '../models/Store.js';
import Vendor from '../models/Vendor.js';
import Account from '../models/Account.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';
import Purchase from '../models/Purchase.js';
import LedgerEntry from '../models/LedgerEntry.js';
import InventoryTransaction from '../models/InventoryTransaction.js';

import { generateDocNumber } from '../utils/docNumber.js';
import { round2 } from '../utils/gstCalculator.js';
import { postLedgerPair } from '../utils/ledger.js';
import { applyStockDelta, recordInventoryTransaction } from '../controllers/inventoryController.js';
import { daysAgo } from './seedConstants.js';

// Adds one fully connected sample: a vendor, one product it supplies, and a purchase
// order that is ordered -> received -> invoiced -> part-paid, which creates the batch,
// store stock, inventory transaction and ledger entries exactly as the app's own flow does.
// Additive and safe to re-run: existing data is never deleted.

const VENDOR = {
  name: 'Sri Lakshmi Home Appliances',
  companyName: 'Sri Lakshmi Home Appliances Distributors Pvt Ltd',
  gstin: '33AAKCS4821M1Z7',
  pan: 'AAKCS4821M',
  contactPerson: 'Ramesh Venkatesan',
  phone: '9840123456',
  email: 'orders@srilakshmiappliances.example',
  address: '42, Ranganathan Street, T. Nagar, Chennai, Tamil Nadu 600017',
  paymentTerms: 'Net 30',
  creditLimit: 500000,
  bankDetails: {
    accountName: 'Sri Lakshmi Home Appliances Distributors Pvt Ltd',
    accountNumber: '50200041827365',
    ifsc: 'HDFC0001234',
    bankName: 'HDFC Bank, T. Nagar Branch',
  },
};

const PRODUCT = {
  name: 'Solstice Home Turbo 750W Mixer Grinder (3 Jars)',
  sku: 'SH-MG750-3J',
  barcode: '8906012345678',
  description:
    '750W copper-motor mixer grinder with three stainless-steel jars (1.5 L liquidiser, 1.0 L dry grinding, 0.4 L chutney), '
    + '3-speed control with pulse, overload protection and anti-skid feet. Colour: Graphite Grey. '
    + 'Includes a 2-year product warranty and 5-year motor warranty.',
  hsn: '8509',
  gstRate: 18,
  purchasePrice: 2150,
  sellingPrice: 2899,
  mrp: 3450,
  discountPercent: 0,
  unit: 'PCS',
  reorderLevel: 8,
  maxStock: 60,
  minStock: 3,
};

const ORDER_QTY = 40;
const VENDOR_INVOICE = 'SLHA/26-27/0418';
const BATCH_NUMBER = 'SH-MG750-B2509';
const AMOUNT_PAID = 60000;

async function upsert(Model, filter, data) {
  return Model.findOneAndUpdate(filter, { $setOnInsert: data }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function run() {
  await connectDB();

  if (await Vendor.exists({ gstin: VENDOR.gstin })) {
    console.log(`[seed:sample] Vendor ${VENDOR.gstin} already exists - sample data is already loaded. Nothing to do.`);
    return;
  }

  const admin = await User.findOne({ role: 'super_admin' });
  if (!admin) throw new Error('No super_admin user found. Run "npm run seed:admin" first.');

  // ---------- Reference data the sample depends on ----------
  if (!(await Settings.exists({}))) {
    await Settings.create({ companyName: 'AURELIA Department Store', gstin: '33AAAAA0000A1Z5', pan: 'AAAAA0000A', address: '145 Anna Salai, Chennai, Tamil Nadu 600002' });
  }
  const taxRate = await upsert(TaxRate, { ratePercent: 18 }, { name: 'GST 18%', ratePercent: 18, hsnCodes: ['8509', '8517', '8471'], isDefault: true });
  const home = await upsert(Category, { slug: 'home' }, { name: 'Home', slug: 'home', description: 'Furniture, kitchen and decor for the home.' });
  const kitchen = await upsert(Category, { slug: 'home-kitchen' }, { name: 'Kitchen', slug: 'home-kitchen', parent: home._id, description: 'Cookware and kitchen appliances.' });
  const brand = await upsert(Brand, { name: 'Solstice Home' }, { name: 'Solstice Home', description: 'Home and kitchen appliances.' });
  const store = await upsert(Store, { code: 'ST01' }, {
    code: 'ST01', name: 'AURELIA Chennai Flagship', address: '145 Anna Salai', city: 'Chennai',
    state: 'Tamil Nadu', pincode: '600002', gstin: '33AAAAA0000A1Z5', phone: '4428521234',
  });

  // Opening bank balance so the vendor payment doesn't leave the bank account negative.
  await upsert(Account, { name: 'Bank Account' }, { name: 'Bank Account', type: 'asset', accountGroup: 'bank', openingBalance: 500000, currentBalance: 500000 });

  // ---------- Vendor + product ----------
  const vendor = await Vendor.create(VENDOR);
  const product = await Product.create({
    ...PRODUCT, category: home._id, subcategory: kitchen._id, brand: brand._id,
    taxRate: taxRate._id, primaryVendor: vendor._id, createdBy: admin._id,
  });

  // ---------- Purchase order (same totals logic as purchaseController.createPurchase) ----------
  const taxableAmount = round2(ORDER_QTY * PRODUCT.purchasePrice);
  const taxAmount = round2((taxableAmount * PRODUCT.gstRate) / 100);
  const grandTotal = round2(taxableAmount + taxAmount);
  const orderedOn = daysAgo(12);
  const receivedOn = daysAgo(9);
  const paidOn = daysAgo(4);

  const purchase = await Purchase.create({
    poNumber: await generateDocNumber('purchase'),
    vendor: vendor._id, store: store._id,
    items: [{
      product: product._id, batchNumber: BATCH_NUMBER, quantity: ORDER_QTY, unitPrice: PRODUCT.purchasePrice,
      gstRate: PRODUCT.gstRate, manufacturingDate: daysAgo(45), taxableAmount, taxAmount, totalAmount: grandTotal,
      receivedQuantity: ORDER_QTY,
    }],
    subtotal: taxableAmount, taxAmount, grandTotal, amountPaid: AMOUNT_PAID,
    status: 'invoiced', invoiceNumber: VENDOR_INVOICE, orderedBy: admin._id,
    notes: 'Festive-season stock for the Chennai flagship. Delivered in 4 cartons of 10; all units inspected, no damage.',
  });
  await Purchase.collection.updateOne({ _id: purchase._id }, { $set: { createdAt: orderedOn, updatedAt: paidOn } });

  // ---------- Goods receipt (same steps as purchaseController.receiveGoods) ----------
  const batch = await Batch.create({
    batchNumber: BATCH_NUMBER, product: product._id, supplier: vendor._id, purchaseInvoice: purchase._id,
    manufacturingDate: daysAgo(45), purchasePrice: PRODUCT.purchasePrice, sellingPrice: PRODUCT.sellingPrice,
    quantity: ORDER_QTY, availableQuantity: ORDER_QTY, store: store._id,
  });
  await applyStockDelta({ product: product._id, store: store._id, delta: ORDER_QTY });
  const txn = await recordInventoryTransaction({
    product: product._id, batch: batch._id, quantity: ORDER_QTY, type: 'purchase_receipt',
    destination: store._id, destinationModel: 'Store', referenceType: 'Purchase', referenceId: purchase._id,
    referenceNumber: purchase.poNumber, user: admin._id,
  });
  await InventoryTransaction.collection.updateOne({ _id: txn._id }, { $set: { createdAt: receivedOn, updatedAt: receivedOn } });

  // ---------- Accounting: invoice booked as payable, then a part payment by bank transfer ----------
  await postLedgerPair({
    debitKey: 'purchases', creditKey: 'payable', amount: grandTotal,
    narration: `Purchase ${purchase.poNumber}`, referenceType: 'Purchase', referenceId: purchase._id, userId: admin._id,
  });
  await postLedgerPair({
    debitKey: 'payable', creditKey: 'bank', amount: AMOUNT_PAID,
    narration: `Payment for ${purchase.poNumber}`, referenceType: 'Purchase', referenceId: purchase._id, userId: admin._id,
  });
  const entries = await LedgerEntry.find({ referenceId: purchase._id });
  for (const e of entries) {
    const when = e.narration.startsWith('Payment') ? paidOn : receivedOn;
    await LedgerEntry.collection.updateOne({ _id: e._id }, { $set: { createdAt: when, updatedAt: when } });
  }

  console.log('[seed:sample] Sample vendor + product loaded:');
  console.log(`  Vendor    ${vendor.name} (${vendor.gstin})`);
  console.log(`  Product   ${product.name} [${product.sku}]  cost ₹${PRODUCT.purchasePrice}  sell ₹${PRODUCT.sellingPrice}  MRP ₹${PRODUCT.mrp}`);
  console.log(`  Purchase  ${purchase.poNumber}  ${ORDER_QTY} pcs  taxable ₹${taxableAmount} + GST ₹${taxAmount} = ₹${grandTotal}`);
  console.log(`            vendor invoice ${VENDOR_INVOICE}, paid ₹${AMOUNT_PAID}, balance due ₹${round2(grandTotal - AMOUNT_PAID)}`);
  console.log(`  Stock     ${ORDER_QTY} pcs at ${store.name} (batch ${BATCH_NUMBER})`);
}

run()
  .then(() => mongoose.connection.close())
  .catch(async (err) => {
    console.error('[seed:sample] Failed:', err);
    await mongoose.connection.close();
    process.exit(1);
  });
