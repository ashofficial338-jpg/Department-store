import mongoose from 'mongoose';
import connectDB from '../config/db.js';

import Settings from '../models/Settings.js';
import TaxRate from '../models/TaxRate.js';
import RolePermission from '../models/RolePermission.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Supplier from '../models/Supplier.js';
import Product from '../models/Product.js';

import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';
import { round2 } from '../utils/gstCalculator.js';
import { CATEGORY_TREE, BRANDS, BRAND_DISPLAY, PRODUCTS } from './indianCatalog.js';
import { productArt } from './productArt.js';

// Loads only the Indian product catalog - tax rates, categories, brands, manufacturers and products -
// with no stock, sales or purchases. Everything is upserted on a stable key, so re-running is safe and
// does not clear existing data (unlike `npm run seed`).
const slugify = (v) => v.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const brandName = (key) => BRAND_DISPLAY[key] || key;
const upsert = (Model, filter, doc) => Model.findOneAndUpdate(filter, { $set: doc }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });

const TAX_RATES = [
  { name: 'GST 0% (Exempt)', ratePercent: 0, hsnCodes: ['0401', '2501', '9619'] },
  { name: 'GST 5%', ratePercent: 5, hsnCodes: ['1006', '1101', '0713', '0902', '0910', '1507'] },
  { name: 'GST 12%', ratePercent: 12, hsnCodes: ['0405', '2009', '2106', '4820', '7615', '3004'] },
  { name: 'GST 18%', ratePercent: 18, hsnCodes: ['1905', '1806', '3305', '3306', '3401', '3402'], isDefault: true },
  { name: 'GST 28%', ratePercent: 28, hsnCodes: ['2202'] },
];

async function run() {
  await connectDB();

  if (!(await Settings.exists({}))) {
    await Settings.create({ companyName: 'AURELIA Department Store', gstin: '33AAAAA0000A1Z5', pan: 'AAAAA0000A', address: '145 Anna Salai, Chennai, Tamil Nadu 600002' });
  }
  for (const [role, v] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (!(await RolePermission.exists({ role }))) await RolePermission.create({ role, label: v.label, permissions: v.permissions, isSystem: true, version: 2 });
  }

  const gstByRate = {};
  for (const t of TAX_RATES) gstByRate[t.ratePercent] = await upsert(TaxRate, { ratePercent: t.ratePercent }, t);

  const categoryDocs = {};
  const subMeta = {};
  for (const [main, def] of Object.entries(CATEGORY_TREE)) {
    const parent = await upsert(Category, { slug: slugify(main) }, { name: main, slug: slugify(main), description: def.description });
    categoryDocs[main] = parent;
    for (const [sub, meta] of Object.entries(def.subs)) {
      const slug = slugify(`${main}-${sub}`);
      categoryDocs[sub] = await upsert(Category, { slug }, { name: sub, slug, parent: parent._id });
      subMeta[sub] = { ...meta, parent: main };
    }
  }

  const brandByName = {};
  for (const [key, b] of Object.entries(BRANDS)) {
    const name = brandName(key);
    if (!brandByName[name]) brandByName[name] = await upsert(Brand, { name }, { name, description: `${name} by ${b.maker}.` });
  }

  const supplierByMaker = {};
  for (const maker of new Set(Object.values(BRANDS).map((b) => b.maker))) {
    supplierByMaker[maker] = await upsert(Supplier, { name: maker }, { name: maker, paymentTerms: 'Net 30' });
  }

  let count = 0;
  for (const [index, [name, brandKey, sub, size, unit, mrp, gstRate, hsn, pack, highlight, offer]] of PRODUCTS.entries()) {
    const meta = subMeta[sub];
    if (!meta) throw new Error(`Unknown subcategory "${sub}" for ${name}`);
    const bName = brandName(brandKey);
    // Indian MRPs include GST; price ex-GST so the POS bills at exactly MRP.
    const sellingPrice = round2(mrp / (1 + gstRate / 100));
    const margin = (meta.margin[0] + meta.margin[1]) / 2;
    const purchasePrice = round2(sellingPrice * (1 - offer / 100) * (1 - margin));
    const typicalStock = (meta.stock[0] + meta.stock[1]) / 2;
    const sku = `AUR${10001 + index}`;
    // Skip the brand prefix when the item name already carries it ("Thums Up", "Fevicol MR").
    const fullName = name.toLowerCase().startsWith(bName.toLowerCase()) ? name : `${bName} ${name}`;
    await upsert(Product, { sku }, {
      name: fullName, sku, barcode: `890${String(5000000000 + index * 7919).padStart(10, '0')}`,
      category: categoryDocs[meta.parent]._id, subcategory: categoryDocs[sub]._id, brand: brandByName[bName]._id,
      description: `${fullName} (${size}): ${highlight}.`,
      hsn, taxRate: gstByRate[gstRate]._id, gstRate,
      purchasePrice, sellingPrice, mrp, discountPercent: offer,
      unit, reorderLevel: Math.max(3, Math.round(typicalStock * 0.2)), maxStock: meta.stock[1] * 3, minStock: Math.max(1, Math.round(typicalStock * 0.05)),
      primarySupplier: supplierByMaker[BRANDS[brandKey].maker]._id,
      images: [{ url: productArt({ brand: bName, name, size, pack, color: BRANDS[brandKey].color, category: meta.parent }), isPrimary: true }],
      status: 'active',
    });
    count += 1;
  }

  console.log('[seed:catalog] Indian catalog ready:');
  console.log(`  Tax rates   ${TAX_RATES.length}`);
  console.log(`  Categories  ${Object.keys(categoryDocs).length} (${Object.keys(CATEGORY_TREE).length} main)`);
  console.log(`  Brands      ${Object.keys(brandByName).length}`);
  console.log(`  Suppliers   ${Object.keys(supplierByMaker).length}`);
  console.log(`  Products    ${count}`);
}

run()
  .then(() => mongoose.connection.close())
  .catch(async (err) => {
    console.error('[seed:catalog] Failed:', err);
    await mongoose.connection.close();
    process.exit(1);
  });
