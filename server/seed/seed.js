import mongoose from 'mongoose';
import connectDB from '../config/db.js';

import User from '../models/User.js';
import RolePermission from '../models/RolePermission.js';
import Settings from '../models/Settings.js';
import TaxRate from '../models/TaxRate.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Store from '../models/Store.js';
import DistributionCenter from '../models/DistributionCenter.js';
import Vendor from '../models/Vendor.js';
import Supplier from '../models/Supplier.js';
import Customer from '../models/Customer.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';
import Inventory from '../models/Inventory.js';
import InventoryTransaction from '../models/InventoryTransaction.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Expense from '../models/Expense.js';
import Payment from '../models/Payment.js';
import Account from '../models/Account.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Counter from '../models/Counter.js';
import AuditLog from '../models/AuditLog.js';

import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';
import { calculateLineGst, summarizeInvoice, round2 } from '../utils/gstCalculator.js';
import {
  CATEGORY_TREE, BRANDS, PRODUCT_ADJECTIVES, PRODUCT_NOUNS, UNITS,
  FIRST_NAMES, LAST_NAMES, CITIES, EXPENSE_DESCRIPTIONS,
  randomInt, randomFloat, pick, pickMany, daysAgo,
} from './seedConstants.js';

// Clears every collection in the database, so models added later are never missed.
async function clearAllCollections() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const { name } of collections) {
    if (!name.startsWith('system.')) await mongoose.connection.db.collection(name).deleteMany({});
  }
}

async function destroy() {
  await connectDB();
  console.log('[seed] Dropping all collections...');
  await clearAllCollections();
  console.log('[seed] Done. Database is empty.');
  await mongoose.connection.close();
  process.exit(0);
}

async function run() {
  await connectDB();
  console.log('[seed] Clearing existing data...');
  await clearAllCollections();

  // ---------- Settings ----------
  await Settings.create({ companyName: 'AURELIA Department Store', gstin: '33AAAAA0000A1Z5', pan: 'AAAAA0000A', address: '145 Anna Salai, Chennai, Tamil Nadu 600002' });

  // ---------- Tax Rates ----------
  const taxRates = await TaxRate.insertMany([
    { name: 'GST 0%', ratePercent: 0, hsnCodes: ['0000'] },
    { name: 'GST 5%', ratePercent: 5, hsnCodes: ['6109', '2106'] },
    { name: 'GST 12%', ratePercent: 12, hsnCodes: ['6203', '4202'] },
    { name: 'GST 18%', ratePercent: 18, hsnCodes: ['8517', '8471', '3304'], isDefault: true },
    { name: 'GST 28%', ratePercent: 28, hsnCodes: ['8703'] },
  ]);
  console.log(`[seed] Tax rates: ${taxRates.length}`);

  // ---------- Role Permissions ----------
  await RolePermission.insertMany(Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, v]) => ({ role, label: v.label, permissions: v.permissions })));

  // ---------- Categories ----------
  const categoryDocs = {};
  for (const [main, subs] of Object.entries(CATEGORY_TREE)) {
    const parent = await Category.create({ name: main, slug: main.toLowerCase().replace(/[^a-z]/g, '') });
    categoryDocs[main] = parent;
    for (const sub of subs) {
      const child = await Category.create({ name: sub, slug: `${main}-${sub}`.toLowerCase().replace(/[^a-z-]/g, ''), parent: parent._id });
      categoryDocs[sub] = child;
    }
  }
  console.log(`[seed] Categories: ${Object.keys(categoryDocs).length}`);

  // ---------- Brands ----------
  const brandDocs = await Brand.insertMany(BRANDS.map((name) => ({ name })));
  console.log(`[seed] Brands: ${brandDocs.length}`);

  // ---------- Stores & DCs ----------
  const stores = await Store.insertMany(CITIES.slice(0, 3).map((c, i) => ({
    code: `ST${String(i + 1).padStart(2, '0')}`, name: `AURELIA ${c.city} Flagship`,
    address: `${randomInt(1, 200)} Main Road`, city: c.city, state: c.state, pincode: `${randomInt(500000, 699999)}`,
    gstin: `33AAAAA0000A1Z${i + 1}`, phone: `9${randomInt(100000000, 999999999)}`,
  })));
  const distributionCenters = await DistributionCenter.insertMany(CITIES.slice(3, 5).map((c, i) => ({
    code: `DC${String(i + 1).padStart(2, '0')}`, name: `AURELIA ${c.city} Distribution Center`,
    address: `${randomInt(1, 200)} Industrial Estate`, city: c.city, state: c.state,
    contactPhone: `9${randomInt(100000000, 999999999)}`, contactEmail: `dc${i + 1}@aurelia.example`,
  })));
  console.log(`[seed] Stores: ${stores.length}, DCs: ${distributionCenters.length}`);

  // ---------- Users (demo logins) ----------
  const DEMO_PASSWORD = 'Password@123';
  const demoUsers = [
    { name: 'Ashwin Kumar', email: 'ashwinlav@gmail.com', role: 'super_admin', password: 'Admin@123' },
    { name: 'Priya Sundaram', email: 'admin@aurelia.test', role: 'admin' },
    { name: 'Rahul Menon', email: 'storemanager@aurelia.test', role: 'store_manager', store: stores[0]._id },
    { name: 'Divya Rao', email: 'dcmanager@aurelia.test', role: 'dc_manager', distributionCenter: distributionCenters[0]._id },
    { name: 'Karthik Iyer', email: 'cashier@aurelia.test', role: 'cashier', store: stores[0]._id },
    { name: 'Meera Nair', email: 'accountant@aurelia.test', role: 'accountant' },
    { name: 'Sanjay Gupta', email: 'purchasemanager@aurelia.test', role: 'purchase_manager' },
    { name: 'Anjali Desai', email: 'inventorymanager@aurelia.test', role: 'inventory_manager' },
    { name: 'Vikram Chatterjee', email: 'salesmanager@aurelia.test', role: 'sales_manager', store: stores[0]._id },
    { name: 'Nisha Bhatt', email: 'auditor@aurelia.test', role: 'auditor' },
  ];
  const users = [];
  for (const u of demoUsers) {
    users.push(await User.create({ password: DEMO_PASSWORD, ...u }));
  }
  const cashier = users.find((u) => u.role === 'cashier');
  console.log(`[seed] Users: ${users.length}`);

  // ---------- Vendors & Suppliers ----------
  const vendors = await Vendor.insertMany(Array.from({ length: 12 }, (_, i) => {
    const c = pick(CITIES);
    return {
      name: `${pick(['Metro', 'Grand', 'Sunrise', 'National', 'Prime', 'United'])} ${pick(['Traders', 'Distributors', 'Wholesale Co', 'Supply Chain'])}`,
      companyName: `Vendor Enterprises ${i + 1} Pvt Ltd`,
      gstin: `29AAAAA${1000 + i}A1Z${i % 9}`, pan: `AAAAA${1000 + i}A`,
      contactPerson: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, phone: `9${randomInt(100000000, 999999999)}`,
      email: `vendor${i + 1}@example.com`, address: `${randomInt(1, 300)} Trade Center, ${c.city}`,
      paymentTerms: pick(['Net 15', 'Net 30', 'Net 45']), creditLimit: randomInt(50000, 500000),
    };
  }));
  const suppliers = await Supplier.insertMany(Array.from({ length: 10 }, (_, i) => ({
    name: `${pick(['Global', 'Coastal', 'Highland', 'Everbright', 'Zenith'])} Supplies ${i + 1}`,
    contactPerson: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, phone: `9${randomInt(100000000, 999999999)}`,
    email: `supplier${i + 1}@example.com`, address: `${pick(CITIES).city}`, rating: randomInt(3, 5),
  })));
  console.log(`[seed] Vendors: ${vendors.length}, Suppliers: ${suppliers.length}`);

  // ---------- Customers ----------
  const customers = [];
  for (let i = 0; i < 60; i++) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    customers.push(await Customer.create({
      customerId: `CUST${String(i + 1).padStart(5, '0')}`,
      name, phone: `9${randomInt(100000000, 999999999)}`,
      email: `${name.toLowerCase().replace(/\s/g, '.')}${i}@example.com`,
      address: `${pick(CITIES).city}`, customerType: pick(['retail', 'retail', 'retail', 'wholesale', 'corporate']),
      loyaltyPoints: randomInt(0, 500), loyaltyTier: pick(['bronze', 'bronze', 'silver', 'gold']),
    }));
  }
  console.log(`[seed] Customers: ${customers.length}`);

  // ---------- Products ----------
  const gstByRate = Object.fromEntries(taxRates.map((t) => [t.ratePercent, t]));
  const products = [];
  let skuCounter = 1000;
  for (const [subName, nouns] of Object.entries(PRODUCT_NOUNS)) {
    const category = categoryDocs[subName];
    const mainCategoryEntry = Object.entries(CATEGORY_TREE).find(([, subs]) => subs.includes(subName));
    const mainCategory = categoryDocs[mainCategoryEntry[0]];
    for (const noun of nouns) {
      for (let v = 0; v < 2; v++) {
        const brand = pick(brandDocs);
        const adjective = pick(PRODUCT_ADJECTIVES);
        const name = `${brand.name} ${adjective} ${noun}`;
        const purchasePrice = randomFloat(150, 8000);
        const marginPct = randomFloat(20, 45);
        const sellingPrice = round2(purchasePrice * (1 + marginPct / 100));
        const mrp = round2(sellingPrice * randomFloat(1.05, 1.2));
        const gstRate = pick([5, 12, 18, 18, 28]);
        skuCounter += 1;

        products.push(await Product.create({
          name, sku: `SKU${skuCounter}`, barcode: `8901${randomInt(100000000, 999999999)}`,
          category: mainCategory._id, subcategory: category._id, brand: brand._id,
          description: `${adjective} ${noun.toLowerCase()} from ${brand.name}. A department-store favorite designed for everyday quality and comfort.`,
          hsn: pick(gstByRate[gstRate].hsnCodes), taxRate: gstByRate[gstRate]._id, gstRate,
          purchasePrice, sellingPrice, mrp, discountPercent: pick([0, 0, 5, 10]),
          unit: pick(UNITS), reorderLevel: randomInt(5, 20), maxStock: randomInt(200, 500), minStock: randomInt(0, 5),
          primarySupplier: pick(suppliers)._id, primaryVendor: pick(vendors)._id,
          images: [],
        }));
      }
    }
  }
  console.log(`[seed] Products: ${products.length}`);

  // ---------- Opening Batches + Inventory (per store) ----------
  let batchSeq = 1;
  for (const product of products) {
    for (const store of stores) {
      const openingQty = randomInt(30, 150);
      const soldSoFar = randomInt(0, Math.floor(openingQty * 0.6));
      const available = openingQty - soldSoFar;
      const isNearExpiry = Math.random() < 0.08; // ~8% of batches expiring soon, for the Expiry Management demo
      const expiryDate = isNearExpiry ? daysAgo(-randomInt(3, 25)) : daysAgo(-randomInt(120, 540));

      const batch = await Batch.create({
        batchNumber: `BATCH${String(batchSeq++).padStart(6, '0')}`,
        product: product._id, supplier: product.primarySupplier,
        manufacturingDate: daysAgo(randomInt(60, 300)), expiryDate,
        purchasePrice: product.purchasePrice, sellingPrice: product.sellingPrice,
        quantity: openingQty, availableQuantity: available, store: store._id, status: 'active',
      });

      await Inventory.create({ product: product._id, store: store._id, currentStock: available, openingStock: openingQty });
      await InventoryTransaction.create({
        product: product._id, batch: batch._id, quantity: openingQty, type: 'opening_stock',
        destination: store._id, destinationModel: 'Store', referenceType: 'OpeningStock', referenceNumber: 'OPEN-STOCK',
      });
    }
  }
  console.log('[seed] Opening batches + inventory created for all stores.');

  // ---------- System Accounts (pre-create with opening balances) ----------
  const accountSeeds = [
    { name: 'Cash Account', type: 'asset', accountGroup: 'cash', openingBalance: 250000, currentBalance: 250000 },
    { name: 'Bank Account', type: 'asset', accountGroup: 'bank', openingBalance: 800000, currentBalance: 800000 },
    { name: 'UPI Collections', type: 'asset', accountGroup: 'bank', openingBalance: 0, currentBalance: 0 },
    { name: 'Sales Account', type: 'income', accountGroup: 'sales' },
    { name: 'Purchases Account', type: 'expense', accountGroup: 'purchase' },
    { name: 'Accounts Receivable', type: 'asset', accountGroup: 'receivable' },
    { name: 'Accounts Payable', type: 'liability', accountGroup: 'payable' },
    { name: 'GST Output Tax', type: 'liability', accountGroup: 'other' },
    { name: 'GST Input Tax Credit', type: 'asset', accountGroup: 'other' },
    { name: 'Operating Expenses', type: 'expense', accountGroup: 'expense' },
  ];
  const accounts = {};
  for (const seed of accountSeeds) accounts[seed.name] = await Account.create(seed);
  console.log('[seed] Chart of accounts created.');

  // ---------- Historical Sales (last 60 days) ----------
  const methodChoice = () => pick(['cash', 'cash', 'upi', 'upi', 'card', 'credit']);
  let saleCount = 0;
  for (let d = 60; d >= 0; d--) {
    const dailySales = randomInt(3, 9);
    for (let s = 0; s < dailySales; s++) {
      const store = pick(stores);
      const lineCount = randomInt(1, 5);
      const cartProducts = pickMany(products, lineCount);
      const withCustomer = Math.random() < 0.7;
      const customer = withCustomer ? pick(customers) : null;

      const lines = cartProducts.map((p) => {
        const quantity = randomInt(1, 4);
        const discountPercent = pick([0, 0, 0, 5, 10]);
        const calc = calculateLineGst({ quantity, unitPrice: p.sellingPrice, discountPercent, gstRate: p.gstRate, isInterState: false });
        return { product: p._id, productName: p.name, sku: p.sku, quantity, unitPrice: p.sellingPrice, discountPercent, gstRate: p.gstRate, ...calc };
      });
      const summary = summarizeInvoice(lines);
      const method = methodChoice();
      const saleDate = daysAgo(d);
      saleDate.setHours(randomInt(9, 20), randomInt(0, 59));

      const payments = method === 'credit' && customer
        ? [{ method: 'credit', amount: summary.grandTotal }]
        : [{ method, amount: summary.grandTotal, referenceId: method === 'upi' ? `UPI${randomInt(100000000, 999999999)}` : undefined, cashReceived: method === 'cash' ? summary.grandTotal : undefined, changeReturned: 0 }];

      saleCount += 1;
      const sale = await Sale.create({
        invoiceNumber: `INV/2526/${String(saleCount).padStart(6, '0')}`,
        store: store._id, customer: customer?._id, items: lines, ...summary,
        amountPaid: summary.grandTotal, payments, status: 'completed', cashier: cashier._id, createdAt: saleDate,
      });
      // backdate manually since Sale schema timestamps would otherwise use "now"
      await Sale.updateOne({ _id: sale._id }, { createdAt: saleDate, updatedAt: saleDate });

      if (customer && method === 'credit') {
        await Customer.findByIdAndUpdate(customer._id, { $inc: { outstanding: summary.grandTotal, loyaltyPoints: Math.floor(summary.grandTotal / 100) } });
      } else if (customer) {
        await Customer.findByIdAndUpdate(customer._id, { $inc: { loyaltyPoints: Math.floor(summary.grandTotal / 100) } });
      }
    }
  }
  console.log(`[seed] Historical sales: ${saleCount}`);

  // ---------- Historical Purchases ----------
  let poCount = 0;
  for (let d = 45; d >= 0; d -= 3) {
    const vendor = pick(vendors);
    const store = pick(stores);
    const lineCount = randomInt(2, 6);
    const cartProducts = pickMany(products, lineCount);
    const items = cartProducts.map((p) => {
      const quantity = randomInt(10, 60);
      const taxableAmount = round2(quantity * p.purchasePrice);
      const taxAmount = round2((taxableAmount * p.gstRate) / 100);
      return { product: p._id, quantity, unitPrice: p.purchasePrice, gstRate: p.gstRate, taxableAmount, taxAmount, totalAmount: round2(taxableAmount + taxAmount), receivedQuantity: quantity };
    });
    const subtotal = round2(items.reduce((s, i) => s + i.taxableAmount, 0));
    const taxAmount = round2(items.reduce((s, i) => s + i.taxAmount, 0));
    const grandTotal = round2(subtotal + taxAmount);
    const status = pick(['received', 'received', 'invoiced', 'invoiced', 'partially_received']);
    const amountPaid = status === 'invoiced' ? (Math.random() < 0.6 ? grandTotal : round2(grandTotal * randomFloat(0.3, 0.8))) : 0;

    poCount += 1;
    const poDate = daysAgo(d);
    const purchase = await Purchase.create({
      poNumber: `PO/2526/${String(poCount).padStart(6, '0')}`, vendor: vendor._id, store: store._id,
      items, subtotal, taxAmount, grandTotal, amountPaid, status,
      invoiceNumber: status === 'invoiced' ? `VINV-${randomInt(10000, 99999)}` : undefined,
      orderedBy: users.find((u) => u.role === 'purchase_manager')._id, createdAt: poDate,
    });
    await Purchase.updateOne({ _id: purchase._id }, { createdAt: poDate, updatedAt: poDate });
  }
  console.log(`[seed] Historical purchases: ${poCount}`);

  // ---------- Expenses ----------
  let expenseCount = 0;
  for (let d = 60; d >= 0; d -= randomInt(2, 5)) {
    const category = pick(Object.keys(EXPENSE_DESCRIPTIONS));
    const expenseDate = daysAgo(d);
    await Expense.create({
      category, description: pick(EXPENSE_DESCRIPTIONS[category]), amount: randomFloat(500, 45000),
      paymentMethod: pick(['cash', 'bank_transfer', 'upi']), store: pick(stores)._id,
      expenseDate, recordedBy: users.find((u) => u.role === 'accountant')._id,
    });
    expenseCount += 1;
  }
  console.log(`[seed] Expenses: ${expenseCount}`);

  console.log('\n[seed] Demo data seeded successfully.');
  console.log('[seed] Demo logins:');
  demoUsers.forEach((u) => console.log(`         ${u.role.padEnd(18)} ${u.email.padEnd(32)} ${u.password || DEMO_PASSWORD}`));

  await mongoose.connection.close();
  process.exit(0);
}

const shouldDestroy = process.argv.includes('--destroy');
(shouldDestroy ? destroy() : run()).catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
