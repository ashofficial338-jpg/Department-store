import mongoose from 'mongoose';
import connectDB from '../config/db.js';

import TaxRate from '../models/TaxRate.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Store from '../models/Store.js';
import Inventory from '../models/Inventory.js';

import { round2 } from '../utils/gstCalculator.js';
import { CATEGORIES, PRODUCTS } from './productCatalog.js';
import { productArt } from './productArt.js';

// Product-only reset: removes every business record (suppliers, vendors, brands, customers, sales,
// purchases, stock, accounts, logs...) and loads a clean product catalog with no supplier data.
// Kept as-is: user accounts, System Settings, role permissions, tax rates, stores, distribution centers,
// saved report templates and the database job history.
// Take a backup first (Settings > Database Backup) - this cannot be undone.
const KEEP = new Set(['users', 'settings', 'rolepermissions', 'taxrates', 'stores', 'distributioncenters', 'reporttemplates', 'migrationruns']);

const TAX_RATES = [
  { name: 'GST 0% (Exempt)', ratePercent: 0 },
  { name: 'GST 5%', ratePercent: 5 },
  { name: 'GST 12%', ratePercent: 12 },
  { name: 'GST 18%', ratePercent: 18, isDefault: true },
  { name: 'GST 28%', ratePercent: 28 },
];

const slugify = (v) => v.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function run() {
  await connectDB();
  const { db } = mongoose.connection;

  // ---------- 1. Clear business data ----------
  const collections = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.') && !KEEP.has(n));
  for (const name of collections.sort()) {
    const { deletedCount } = await db.collection(name).deleteMany({});
    console.log(`[seed:products] cleared ${name.padEnd(22)} ${deletedCount}`);
  }

  // ---------- 2. Tax rates (kept; created only if missing) ----------
  const gstByRate = {};
  for (const t of TAX_RATES) {
    gstByRate[t.ratePercent] = (await TaxRate.findOne({ ratePercent: t.ratePercent })) || (await TaxRate.create(t));
  }

  // ---------- 3. Categories ----------
  const categoryDocs = {};
  const parentOf = {};
  for (const [main, def] of Object.entries(CATEGORIES)) {
    const parent = await Category.create({ name: main, slug: slugify(main), description: def.description });
    categoryDocs[main] = parent;
    for (const sub of def.subs) {
      categoryDocs[sub] = await Category.create({ name: sub, slug: slugify(`${main}-${sub}`), parent: parent._id });
      parentOf[sub] = main;
    }
  }

  // ---------- 4. Products (no brand, supplier or vendor) ----------
  const rows = PRODUCTS.map(([name, sub, size, unit, mrp, gstRate, hsn, pack], index) => {
    const main = parentOf[sub];
    if (!main) throw new Error(`Unknown subcategory "${sub}" for ${name}`);
    const fullName = `${name} ${size}`;
    // MRP includes GST; the POS adds GST on the selling price, so selling price ex-GST bills at exactly MRP.
    const sellingPrice = round2(mrp / (1 + gstRate / 100));
    const purchasePrice = round2(sellingPrice * (main === 'Vegetables' ? 0.78 : 0.85));
    const loose = unit === 'KG';
    return {
      name: fullName,
      sku: `AUR${10001 + index}`,
      barcode: `890${String(6000000000 + index * 7919).padStart(10, '0')}`,
      category: categoryDocs[main]._id,
      subcategory: categoryDocs[sub]._id,
      description: `${name} (${size}) - ${sub}, ${main}.`,
      hsn, taxRate: gstByRate[gstRate]._id, gstRate,
      purchasePrice, sellingPrice, mrp, discountPercent: 0,
      unit, reorderLevel: loose ? 10 : 12, minStock: loose ? 3 : 4, maxStock: loose ? 150 : 300,
      images: [{ url: productArt({ brand: sub, name, size, pack, color: CATEGORIES[main].color, category: main }), isPrimary: true }],
      status: 'active',
    };
  });
  const products = await Product.insertMany(rows);

  // ---------- 5. Inventory rows at zero stock, so every product appears in Inventory ----------
  const stores = await Store.find().select('_id').lean();
  await Inventory.insertMany(products.flatMap((p) => stores.map((s) => ({ product: p._id, store: s._id, currentStock: 0, openingStock: 0 }))));

  console.log('[seed:products] Product catalog ready:');
  for (const main of Object.keys(CATEGORIES)) {
    const count = rows.filter((r) => String(r.category) === String(categoryDocs[main]._id)).length;
    console.log(`  ${main.padEnd(20)} ${count} products`);
  }
  console.log(`  Total ${products.length} products, ${Object.keys(categoryDocs).length} categories, ${products.length * stores.length} inventory rows (stock 0) across ${stores.length} stores.`);
}

run()
  .then(() => mongoose.connection.close())
  .catch(async (err) => {
    console.error('[seed:products] Failed:', err);
    await mongoose.connection.close();
    process.exit(1);
  });
