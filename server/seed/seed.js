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
  FIRST_NAMES, LAST_NAMES, CITIES,
  randomInt, randomFloat, pick, daysAgo,
} from './seedConstants.js';
import {
  CATEGORY_TREE, BRANDS, BRAND_DISPLAY, PRODUCTS, VENDORS, EXPENSE_DESCRIPTIONS,
} from './indianCatalog.js';
import { productArt } from './productArt.js';
import { getFinancialYearCode } from '../utils/financialYear.js';

const slugify = (v) => v.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Picks `n` distinct items, favouring higher `weight` (everyday staples sell far more often than cookware).
function weightedPickMany(items, weights, n) {
  const pool = items.map((item, i) => ({ item, w: weights[i] }));
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((sum, x) => sum + x.w, 0);
    let r = Math.random() * total;
    const idx = pool.findIndex((x) => (r -= x.w) <= 0);
    out.push(pool.splice(idx === -1 ? pool.length - 1 : idx, 1)[0].item);
  }
  return out;
}

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
    { name: 'GST 0% (Exempt)', ratePercent: 0, hsnCodes: ['0401', '2501', '9619'] },
    { name: 'GST 5%', ratePercent: 5, hsnCodes: ['1006', '1101', '0713', '0902', '0910', '1507'] },
    { name: 'GST 12%', ratePercent: 12, hsnCodes: ['0405', '2009', '2106', '4820', '7615', '3004'] },
    { name: 'GST 18%', ratePercent: 18, hsnCodes: ['1905', '1806', '3305', '3306', '3401', '3402'], isDefault: true },
    { name: 'GST 28%', ratePercent: 28, hsnCodes: ['2202'] },
  ]);
  console.log(`[seed] Tax rates: ${taxRates.length}`);

  // ---------- Role Permissions ----------
  await RolePermission.insertMany(Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, v]) => ({ role, label: v.label, permissions: v.permissions, isSystem: true, version: 2 })));

  // ---------- Categories ----------
  const categoryDocs = {};
  const subMeta = {}; // subcategory name -> { parent, shelf, stock, margin }
  for (const [main, def] of Object.entries(CATEGORY_TREE)) {
    const parent = await Category.create({ name: main, slug: slugify(main), description: def.description });
    categoryDocs[main] = parent;
    for (const [sub, meta] of Object.entries(def.subs)) {
      categoryDocs[sub] = await Category.create({ name: sub, slug: slugify(`${main}-${sub}`), parent: parent._id });
      subMeta[sub] = { ...meta, parent: main };
    }
  }
  console.log(`[seed] Categories: ${Object.keys(categoryDocs).length}`);

  // ---------- Brands ----------
  const brandName = (key) => BRAND_DISPLAY[key] || key;
  const brandByName = {};
  for (const key of Object.keys(BRANDS)) {
    const name = brandName(key);
    if (!brandByName[name]) brandByName[name] = await Brand.create({ name, description: `${name} by ${BRANDS[key].maker}.` });
  }
  console.log(`[seed] Brands: ${Object.keys(brandByName).length}`);

  // ---------- Stores & DCs ----------
  const stores = await Store.insertMany(CITIES.slice(0, 3).map((c, i) => ({
    code: `ST${String(i + 1).padStart(2, '0')}`, name: `AURELIA ${c.city}`,
    address: pick(['No. 24, Usman Road, T. Nagar', 'No. 112, 100 Feet Road, Indiranagar', 'Shop 5, Linking Road, Bandra West', 'Plot 18, Road No. 36, Jubilee Hills', 'FC Road, Shivajinagar', 'Cross Cut Road, Gandhipuram']), city: c.city, state: c.state, pincode: `${randomInt(500000, 699999)}`,
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

  // ---------- Vendors (distributors) & Suppliers (manufacturers) ----------
  const STATE_CODE = { 'Tamil Nadu': '33', Karnataka: '29', Maharashtra: '27', Telangana: '36' };
  const vendors = await Vendor.insertMany(VENDORS.map((v, i) => {
    const pan = `${['AAB', 'AAC', 'AAF', 'ABC'][i % 4]}${String.fromCharCode(70 + i)}${String(4100 + i * 37).slice(0, 4)}${String.fromCharCode(75 + (i % 10))}`;
    return {
      name: v.name, companyName: `${v.name} Pvt Ltd`,
      gstin: `${STATE_CODE[v.state] || '33'}${pan}1Z${(i % 9) + 1}`, pan,
      contactPerson: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, phone: `9${randomInt(100000000, 999999999)}`,
      email: `orders@${slugify(v.name).replace(/-/g, '')}.example.in`, address: `${randomInt(2, 98)}, Market Road, ${v.city}, ${v.state}`,
      paymentTerms: pick(['Net 15', 'Net 30', 'Net 30', 'Net 45']), creditLimit: pick([200000, 300000, 500000, 750000]),
    };
  }));
  const makers = Array.from(new Set(Object.values(BRANDS).map((b) => b.maker)));
  const supplierDocs = await Supplier.insertMany(makers.map((maker) => ({
    name: maker, contactPerson: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} (Area Sales Manager)`,
    phone: `1800${randomInt(1000000, 9999999)}`, email: `trade@${slugify(maker).replace(/-/g, '').slice(0, 18)}.example.in`,
    address: pick(['Mumbai', 'Gurugram', 'Kolkata', 'Bengaluru', 'Chennai', 'New Delhi', 'Anand']),
    paymentTerms: pick(['Net 30', 'Net 45']), rating: pick([4, 4, 5]),
  })));
  const supplierByMaker = Object.fromEntries(supplierDocs.map((d) => [d.name, d]));
  // Each brand is stocked through one distributor, so a product always comes from the same vendor.
  const vendorForBrand = {};
  console.log(`[seed] Vendors: ${vendors.length}, Suppliers: ${supplierDocs.length}`);

  // ---------- Customers ----------
  const customers = [];
  for (let i = 0; i < 60; i++) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    customers.push(await Customer.create({
      customerId: `CUST${String(i + 1).padStart(5, '0')}`,
      name, phone: `9${randomInt(100000000, 999999999)}`,
      email: `${name.toLowerCase().replace(/\s/g, '.')}${i}@example.com`,
      address: `${randomInt(1, 220)}, ${pick(['Gandhi Nagar', 'Anna Nagar', 'Koramangala', 'Andheri East', 'Banjara Hills', 'Kothrud', 'Velachery', 'Malleswaram', 'Saibaba Colony'])}, ${pick(CITIES).city}`, customerType: pick(['retail', 'retail', 'retail', 'wholesale', 'corporate']),
      loyaltyPoints: randomInt(0, 500), loyaltyTier: pick(['bronze', 'bronze', 'silver', 'gold']),
    }));
  }
  console.log(`[seed] Customers: ${customers.length}`);

  // ---------- Products ----------
  const gstByRate = Object.fromEntries(taxRates.map((t) => [t.ratePercent, t]));
  const products = [];
  let skuCounter = 10000;
  for (const [name, brandKey, sub, size, unit, mrp, gstRate, hsn, pack, highlight, offer] of PRODUCTS) {
    const meta = subMeta[sub];
    if (!meta) throw new Error(`Unknown subcategory "${sub}" for ${name}`);
    const bName = brandName(brandKey);
    const brand = brandByName[bName];
    vendorForBrand[bName] = vendorForBrand[bName] || pick(vendors);
    // Indian MRPs include GST; the POS adds GST on top of the selling price, so price ex-GST bills at exactly MRP.
    const sellingPrice = round2(mrp / (1 + gstRate / 100));
    // Offers are brand-funded, so the retailer keeps its margin on the offer price.
    const purchasePrice = round2(sellingPrice * (1 - offer / 100) * (1 - randomFloat(meta.margin[0], meta.margin[1], 3)));
    const typicalStock = (meta.stock[0] + meta.stock[1]) / 2;
    skuCounter += 1;
    products.push(await Product.create({
      name: `${bName} ${name}`, sku: `AUR${skuCounter}`, barcode: `890${randomInt(1000000000, 9999999999)}`,
      category: categoryDocs[meta.parent]._id, subcategory: categoryDocs[sub]._id, brand: brand._id,
      description: `${bName} ${name} (${size}): ${highlight}. ${meta.parent === 'Kitchen Essentials' ? 'Comes with manufacturer warranty.' : 'Sealed pack, sourced directly from authorised distributors.'}`,
      hsn, taxRate: gstByRate[gstRate]._id, gstRate,
      purchasePrice, sellingPrice, mrp, discountPercent: offer,
      unit, reorderLevel: Math.max(3, Math.round(typicalStock * 0.2)), maxStock: meta.stock[1] * 3, minStock: Math.max(1, Math.round(typicalStock * 0.05)),
      primarySupplier: supplierByMaker[BRANDS[brandKey].maker]._id, primaryVendor: vendorForBrand[bName]._id,
      images: [{ url: productArt({ brand: bName, name, size, pack, color: BRANDS[brandKey].color, category: meta.parent }), isPrimary: true }],
    }));
    products[products.length - 1].$seed = { sub, meta };
  }
  console.log(`[seed] Products: ${products.length}`);

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

  // ---------- 12-month trading simulation ----------
  // Simulates a year of trading day by day so stock, sales, purchases and InventoryTransactions reconcile:
  // every sale and every goods receipt moves stock, which keeps opening/closing inventory (and so ITR) honest
  // for any window up to 12 months. Demand varies by product pace, a slow year-long trend and Indian seasonality.
  const HISTORY_DAYS = 365;
  const LEAD_DAYS = 3;
  const dayStart = (d) => { const x = daysAgo(d); x.setHours(0, 0, 0, 0); return x; };
  const at = (d, h, m) => { const x = dayStart(d); x.setHours(h, m, randomInt(0, 59), 0); return x; };

  // Calendar seasonality: festive Oct-Nov, wedding/winter Dec-Jan, Holi in March, summer Apr-Jun, monsoon lull Jul.
  const MONTH_FACTOR = [1.05, 0.95, 1.05, 1.0, 1.0, 0.95, 0.9, 1.0, 1.05, 1.35, 1.3, 1.1];
  const SEASONAL_SUB = {
    'Chocolates & Sweets': { 9: 1.9, 10: 1.7, 2: 1.3 },
    'Pooja Needs': { 7: 1.4, 8: 1.6, 9: 2.0, 10: 1.8 },
    'Juices & Soft Drinks': { 3: 1.6, 4: 1.8, 5: 1.5 },
    'Health Drinks': { 11: 1.3, 0: 1.3 },
    'Health & Wellness': { 11: 1.5, 0: 1.5, 6: 1.3 },
    'Pest Control': { 5: 1.6, 6: 1.8, 7: 1.8, 8: 1.5 },
    'Notebooks & Paper': { 4: 2.2, 5: 2.4, 0: 1.2 },
    'Pens & Writing': { 4: 1.9, 5: 2.1, 0: 1.2 },
    'Air Fresheners': { 9: 1.4, 10: 1.4 },
    Cookware: { 9: 1.7, 10: 1.5 },
  };
  // Days of stock each store aims to hold after a reorder (fast-moving FMCG is kept lean, durables deep).
  const COVER_DAYS = {
    Dairy: [6, 9], 'Atta & Flours': [18, 26], 'Rice & Grains': [25, 35], 'Dals & Pulses': [22, 32],
    'Edible Oils & Ghee': [20, 30], 'Salt, Sugar & Jaggery': [20, 28], 'Instant & Ready-to-Cook': [18, 26],
    'Biscuits & Cookies': [14, 21], 'Namkeen & Chips': [12, 18], Cookware: [90, 140], 'Storage & Bottles': [70, 110],
    'Kitchen Tools': [70, 110], 'Art & Office Supplies': [60, 90], 'Batteries & Electricals': [55, 80],
  };

  const seasonal = (p, month) => MONTH_FACTOR[month] * ((SEASONAL_SUB[p.$seed.sub] || {})[month] || 1);
  const baseWeight = (p) => (p.mrp <= 100 ? 6 : p.mrp <= 300 ? 4 : p.mrp <= 700 ? 2 : 0.5);
  products.forEach((p) => {
    // Product pace (skewed: a few stars, a long tail, a handful of slow lines) and a slow growth/decline trend.
    const r = Math.random();
    p.$seed.pace = r < 0.08 ? randomFloat(0.08, 0.25) : r < 0.85 ? randomFloat(0.6, 1.3) : randomFloat(1.5, 2.4);
    p.$seed.trend = randomFloat(-0.45, 0.6); // multiplier drifts from (1 - t/2) a year ago to (1 + t/2) today
    p.$seed.cover = COVER_DAYS[p.$seed.sub] || [28, 42];
    p.$seed.avgQty = p.mrp <= 100 ? 2.5 : p.mrp <= 500 ? 1.5 : 1;
    // ~6% of lines hit a supply problem in the last three weeks and run low chain-wide (Low Stock demo).
    p.$seed.supplyIssue = Math.random() < 0.06;
  });
  // A handful of durable/slow lines stopped selling ~4 months ago (replaced by a newer variant): their stock
  // stays on the shelf, giving the ITR analysis genuine non-moving inventory to flag.
  products.filter((p) => p.mrp > 150).sort(() => Math.random() - 0.5).slice(0, 4).forEach((p) => { p.$seed.fadeOut = true; });
  const demandWeight = (p, d, month) => (p.$seed.fadeOut && d < 120 ? 0 : 1) * baseWeight(p) * p.$seed.pace * (1 + p.$seed.trend * (0.5 - d / HISTORY_DAYS)) * seasonal(p, month);

  // Expected chain-wide line volume per day sets each product's initial demand estimate per store.
  const AVG_BILLS = 72;
  const AVG_LINES = 5;
  const w0 = products.map((p) => demandWeight(p, HISTORY_DAYS, dayStart(HISTORY_DAYS).getMonth()));
  const w0Total = w0.reduce((a, b) => a + b, 0);
  const S = stores.length;
  const stock = products.map(() => new Array(S).fill(0));
  const demand = products.map((p, i) => new Array(S).fill(Math.max(0.05, ((AVG_BILLS * AVG_LINES * w0[i]) / w0Total) * p.$seed.avgQty / S)));
  const pendingOrders = []; // { arriveDay, storeIdx, productIdx, qty, vendorId, poKey }
  const txns = [];
  const saleDocs = [];
  const purchaseDocs = new Map(); // poKey -> purchase doc being built
  const customerDelta = new Map();
  const fyCounters = {};
  const nextNo = (prefix, type, date) => {
    const fy = getFinancialYearCode(date);
    const key = `${type}:${fy}`;
    fyCounters[key] = (fyCounters[key] || 0) + 1;
    return `${prefix}/${fy}/${String(fyCounters[key]).padStart(6, '0')}`;
  };
  const storeRef = (i) => ({ id: stores[i]._id });

  // Opening stock a year ago: roughly one cover-period of stock per store.
  products.forEach((p, i) => {
    for (let s = 0; s < S; s++) {
      const qty = Math.max(2, Math.round(demand[i][s] * randomInt(p.$seed.cover[0], p.$seed.cover[1])));
      stock[i][s] = qty;
      txns.push({
        product: p._id, quantity: qty, type: 'opening_stock', destination: stores[s]._id, destinationModel: 'Store',
        referenceType: 'OpeningStock', referenceNumber: 'OPEN-STOCK', createdAt: at(HISTORY_DAYS + 1, 8, 0),
      });
    }
  });
  const openingStock = stock.map((row) => [...row]);

  const methodChoice = () => pick(['cash', 'cash', 'upi', 'upi', 'upi', 'card', 'credit']);
  const purchaseManager = users.find((u) => u.role === 'purchase_manager');

  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const today = dayStart(d);
    const month = today.getMonth();

    // 1. Goods arriving today.
    for (let k = pendingOrders.length - 1; k >= 0; k--) {
      const o = pendingOrders[k];
      if (o.arriveDay !== d) continue;
      pendingOrders.splice(k, 1);
      stock[o.productIdx][o.storeIdx] += o.qty;
      const po = purchaseDocs.get(o.poKey);
      txns.push({
        product: products[o.productIdx]._id, quantity: o.qty, type: 'purchase_receipt', destination: stores[o.storeIdx]._id,
        destinationModel: 'Store', referenceType: 'Purchase', referenceId: po._id, referenceNumber: po.poNumber, user: purchaseManager._id,
        createdAt: at(d, 9, randomInt(0, 50)),
      });
      po.receivedLines += 1;
    }

    // 2. Customers shop.
    const weekend = [0, 6].includes(today.getDay());
    const bills = Math.round(randomInt(weekend ? 80 : 55, weekend ? 100 : 75) * MONTH_FACTOR[month] / 1.04);
    const weights = products.map((p) => demandWeight(p, d, month));
    const soldToday = products.map(() => new Array(S).fill(0));
    // Bill times are drawn up front and sorted so invoice numbers run in time order through the day.
    const billTimes = Array.from({ length: bills }, () => at(d, randomInt(9, 21), randomInt(0, 59))).sort((x, y) => x - y);
    for (let b = 0; b < bills; b++) {
      const s = randomInt(0, S - 1);
      const cart = weightedPickMany(products.map((_, i) => i), weights, randomInt(2, 8));
      const lines = [];
      for (const i of cart) {
        const p = products[i];
        const want = p.mrp <= 100 ? randomInt(1, 4) : p.mrp <= 500 ? randomInt(1, 2) : 1;
        const quantity = Math.min(want, stock[i][s]);
        if (quantity <= 0) continue; // out of stock: the customer goes without
        stock[i][s] -= quantity;
        soldToday[i][s] += quantity;
        const discountPercent = p.discountPercent || 0;
        const calc = calculateLineGst({ quantity, unitPrice: p.sellingPrice, discountPercent, gstRate: p.gstRate, isInterState: false });
        lines.push({ product: p._id, productName: p.name, sku: p.sku, quantity, unitPrice: p.sellingPrice, discountPercent, gstRate: p.gstRate, ...calc });
      }
      if (!lines.length) continue;
      const summary = summarizeInvoice(lines);
      const customer = Math.random() < 0.7 ? pick(customers) : null;
      const method = methodChoice();
      const createdAt = billTimes[b];
      const payments = method === 'credit' && customer
        ? [{ method: 'credit', amount: summary.grandTotal }]
        : [{ method: method === 'credit' ? 'cash' : method, amount: summary.grandTotal, ...(method === 'upi' ? { referenceId: `UPI${randomInt(100000000, 999999999)}` } : {}), ...(method === 'cash' ? { cashReceived: summary.grandTotal, changeReturned: 0 } : {}) }];
      const saleId = new mongoose.Types.ObjectId();
      const invoiceNumber = nextNo('INV', 'sale', createdAt);
      saleDocs.push({
        _id: saleId, invoiceNumber, store: stores[s]._id, ...(customer ? { customer: customer._id } : {}), items: lines, ...summary,
        amountPaid: summary.grandTotal, payments, isInterState: false, status: 'completed', cashier: cashier._id, createdAt, updatedAt: createdAt, __v: 0,
      });
      for (const l of lines) {
        txns.push({
          product: l.product, quantity: -l.quantity, type: 'sale', source: stores[s]._id, sourceModel: 'Store',
          referenceType: 'Sale', referenceId: saleId, referenceNumber: invoiceNumber, user: cashier._id, createdAt,
        });
      }
      if (customer) {
        const c = customerDelta.get(String(customer._id)) || { loyaltyPoints: 0, outstanding: 0 };
        c.loyaltyPoints += Math.floor(summary.grandTotal / 100);
        if (method === 'credit') c.outstanding += summary.grandTotal;
        customerDelta.set(String(customer._id), c);
      }
    }

    // 3. End-of-day replenishment review: learn demand, reorder below the reorder point, grouped into one PO per vendor & store.
    const ordersToday = new Map();
    products.forEach((p, i) => {
      for (let s = 0; s < S; s++) {
        demand[i][s] = demand[i][s] * 0.93 + soldToday[i][s] * 0.07;
        if (p.$seed.supplyIssue && d <= 21) continue;
        const inbound = pendingOrders.filter((o) => o.productIdx === i && o.storeIdx === s).reduce((a, o) => a + o.qty, 0);
        const position = stock[i][s] + inbound;
        const dmd = Math.max(demand[i][s], 0.03);
        const reorderPoint = dmd * (LEAD_DAYS + 4);
        if (position > reorderPoint) continue;
        const orderUpTo = dmd * randomInt(p.$seed.cover[0], p.$seed.cover[1]);
        const qty = Math.max(p.mrp > 700 ? 2 : 6, Math.round(orderUpTo - position));
        const vendorId = String(p.primaryVendor);
        const key = `${vendorId}:${s}`;
        if (!ordersToday.has(key)) ordersToday.set(key, []);
        ordersToday.get(key).push({ productIdx: i, storeIdx: s, qty });
      }
    });
    for (const [key, items] of ordersToday) {
      const [vendorId, s] = key.split(':');
      const createdAt = at(d, 19, randomInt(0, 50));
      const po = {
        _id: new mongoose.Types.ObjectId(), poNumber: nextNo('PO', 'purchase', createdAt), vendor: new mongoose.Types.ObjectId(vendorId),
        store: stores[Number(s)]._id, items: [], orderedBy: purchaseManager._id, createdAt, receivedLines: 0, arriveDay: d - randomInt(LEAD_DAYS - 1, LEAD_DAYS + 1),
      };
      for (const it of items) {
        const p = products[it.productIdx];
        const taxableAmount = round2(it.qty * p.purchasePrice);
        const taxAmount = round2((taxableAmount * p.gstRate) / 100);
        po.items.push({ product: p._id, quantity: it.qty, unitPrice: p.purchasePrice, gstRate: p.gstRate, taxableAmount, taxAmount, totalAmount: round2(taxableAmount + taxAmount), receivedQuantity: 0 });
        pendingOrders.push({ arriveDay: po.arriveDay, storeIdx: it.storeIdx, productIdx: it.productIdx, qty: it.qty, poKey: String(po._id) });
      }
      purchaseDocs.set(String(po._id), po);
    }
  }

  // Finalise purchases: received lines get their quantity; recent orders still in transit stay "ordered";
  // older received bills are paid, the last few weeks' are invoiced with part payment (Payables demo).
  const purchaseRows = [];
  for (const po of purchaseDocs.values()) {
    const received = po.arriveDay >= 0; // arrival day (days ago) already reached in the simulation
    po.items.forEach((it) => { it.receivedQuantity = received ? it.quantity : 0; });
    const subtotal = round2(po.items.reduce((a, i) => a + i.taxableAmount, 0));
    const taxAmount = round2(po.items.reduce((a, i) => a + i.taxAmount, 0));
    const grandTotal = round2(subtotal + taxAmount);
    const ageDays = Math.round((Date.now() - po.createdAt.getTime()) / 86400000);
    let status = 'ordered';
    let amountPaid = 0;
    if (received) {
      status = 'invoiced';
      amountPaid = ageDays > 30 ? grandTotal : ageDays > 12 ? round2(grandTotal * pick([0, 0.5, 1])) : 0;
    }
    purchaseRows.push({
      _id: po._id, poNumber: po.poNumber, vendor: po.vendor, store: po.store, items: po.items, subtotal, taxAmount, grandTotal, amountPaid, status,
      ...(received ? { invoiceNumber: `VINV-${randomInt(10000, 99999)}` } : {}), orderedBy: po.orderedBy, createdAt: po.createdAt, updatedAt: po.createdAt, __v: 0,
    });
  }

  const insertChunks = async (Model, rows) => {
    for (let k = 0; k < rows.length; k += 2000) await Model.collection.insertMany(rows.slice(k, k + 2000), { ordered: false });
  };
  await insertChunks(Sale, saleDocs);
  await insertChunks(Purchase, purchaseRows);
  await insertChunks(InventoryTransaction, txns.map((t) => ({ ...t, updatedAt: t.createdAt, __v: 0 })));
  await Customer.bulkWrite(Array.from(customerDelta, ([id, c]) => ({
    updateOne: { filter: { _id: new mongoose.Types.ObjectId(id) }, update: { $inc: { loyaltyPoints: c.loyaltyPoints, outstanding: round2(c.outstanding * 0.12) } } },
  })));
  // Keep live numbering in step with the seeded history (the next POS bill continues the sequence).
  await Counter.insertMany(Object.entries(fyCounters).map(([key, seq]) => ({ key, seq })));

  // Current position: inventory per store, and one live batch per product-store holding today's stock.
  let batchSeq = 1;
  const batchRows = [];
  const inventoryRows = [];
  products.forEach((p, i) => {
    const { meta } = p.$seed;
    for (let s = 0; s < S; s++) {
      const shelfLife = randomInt(meta.shelf[0], meta.shelf[1]);
      const manufactured = randomInt(3, Math.max(6, Math.floor(shelfLife * 0.3)));
      const perishable = shelfLife < 1500;
      const expiresIn = perishable && Math.random() < 0.08 ? randomInt(3, 25) : shelfLife - manufactured;
      batchRows.push({
        batchNumber: `BATCH${String(batchSeq++).padStart(6, '0')}`, product: p._id, supplier: p.primarySupplier,
        manufacturingDate: daysAgo(manufactured), ...(perishable ? { expiryDate: daysAgo(-expiresIn) } : {}),
        purchasePrice: p.purchasePrice, sellingPrice: p.sellingPrice, quantity: Math.max(stock[i][s], 1), availableQuantity: stock[i][s],
        store: stores[s]._id, status: stock[i][s] > 0 ? 'active' : 'exhausted', createdAt: daysAgo(manufactured), updatedAt: new Date(), __v: 0,
      });
      inventoryRows.push({
        product: p._id, store: stores[s]._id, currentStock: stock[i][s], openingStock: openingStock[i][s],
        reservedStock: 0, damagedStock: 0, returnedStock: 0, inTransitStock: 0, createdAt: daysAgo(HISTORY_DAYS + 1), updatedAt: new Date(), __v: 0,
      });
    }
  });
  await insertChunks(Batch, batchRows);
  await insertChunks(Inventory, inventoryRows);
  console.log(`[seed] Simulated ${HISTORY_DAYS} days: ${saleDocs.length} sales, ${purchaseRows.length} purchase orders, ${txns.length} stock movements.`);

  // ---------- Expenses (12 months) ----------
  // Monthly running costs for three stores, sized so EBITDA lands around 4-5% of sales, like a real grocery-led chain.
  const MONTHLY_COSTS = [
    { category: 'rent', amount: [92000, 98000], day: 2 },
    { category: 'salaries', amount: [138000, 152000], day: 1 },
    { category: 'utilities', amount: [26000, 38000], day: 8 },
    { category: 'marketing', amount: [8000, 14000], day: 12 },
    { category: 'logistics', amount: [8000, 12000], day: 15 },
    { category: 'maintenance', amount: [3000, 7000], day: 20 },
    { category: 'supplies', amount: [5500, 8500], day: 10 },
    { category: 'other', amount: [2500, 5000], day: 25 },
  ];
  const BELOW_THE_LINE = [
    { category: 'interest', description: 'Working capital loan interest', amount: 12000 },
    { category: 'depreciation', description: 'Store fixtures & equipment depreciation', amount: 18000 },
    { category: 'amortization', description: 'POS software licence amortization', amount: 4000 },
    { category: 'income_tax', description: 'Advance income tax provision', amount: 15000 },
  ];
  const accountant = users.find((u) => u.role === 'accountant');
  const expenseRows = [];
  for (let m = 11; m >= 0; m -= 1) {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setMonth(monthStart.getMonth() - m); monthStart.setHours(10, 0, 0, 0);
    const festive = [9, 10].includes(monthStart.getMonth());
    for (const c of MONTHLY_COSTS) {
      const expenseDate = new Date(monthStart); expenseDate.setDate(c.day);
      if (expenseDate > new Date()) continue;
      const boost = c.category === 'marketing' && festive ? 2.6 : c.category === 'utilities' && [3, 4, 5].includes(monthStart.getMonth()) ? 1.25 : 1;
      expenseRows.push({ category: c.category, description: pick(EXPENSE_DESCRIPTIONS[c.category]), amount: round2(randomFloat(c.amount[0], c.amount[1]) * boost), paymentMethod: pick(['bank_transfer', 'bank_transfer', 'upi', 'cash']), store: pick(stores)._id, expenseDate, recordedBy: accountant._id });
    }
    for (const item of BELOW_THE_LINE) {
      expenseRows.push({ ...item, paymentMethod: 'bank_transfer', store: stores[0]._id, expenseDate: monthStart, recordedBy: accountant._id });
    }
  }
  await Expense.insertMany(expenseRows);
  console.log(`[seed] Expenses: ${expenseRows.length}`);

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
