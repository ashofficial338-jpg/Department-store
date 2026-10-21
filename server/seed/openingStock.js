import mongoose from 'mongoose';
import connectDB from '../config/db.js';

import Store from '../models/Store.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';
import Inventory from '../models/Inventory.js';
import InventoryTransaction from '../models/InventoryTransaction.js';

import { CATEGORY_TREE } from './indianCatalog.js';
import { randomInt, daysAgo } from './seedConstants.js';

// Gives every active product opening stock in every store: one batch, the inventory position and an
// 'opening_stock' ledger entry, so Stock Overview, Batches and Stock Ledger all agree.
// Product-store pairs that already hold stock are skipped, so re-running never doubles stock.
const DEFAULT_META = { shelf: [270, 365], stock: [20, 60] };
const LOW_STOCK_SHARE = 0.06; // a few items start near their reorder level so Low Stock has something to show

async function run() {
  await connectDB();

  let stores = await Store.find({ isActive: { $ne: false } });
  if (!stores.length) {
    stores = [await Store.create({ code: 'ST01', name: 'AURELIA Chennai', address: 'No. 24, Usman Road, T. Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600017', gstin: '33AAAAA0000A1Z1', phone: '9840012345' })];
    console.log(`[seed:stock] No store found - created ${stores[0].name} (${stores[0].code}).`);
  }

  const metaBySub = {};
  Object.values(CATEGORY_TREE).forEach((def) => Object.assign(metaBySub, def.subs));
  const subNames = Object.fromEntries((await Category.find({ parent: { $ne: null } }).select('name')).map((c) => [String(c._id), c.name]));

  const products = await Product.find({ status: 'active' });
  const existing = new Set(
    (await Inventory.find({ store: { $in: stores.map((s) => s._id) }, currentStock: { $gt: 0 } }).select('product store'))
      .map((i) => `${i.product}:${i.store}`)
  );

  let batchSeq = (await Batch.countDocuments()) + 1;
  let added = 0;
  let skipped = 0;
  let units = 0;
  let value = 0;

  for (const p of products) {
    const meta = metaBySub[subNames[String(p.subcategory)]] || DEFAULT_META;
    for (const store of stores) {
      if (existing.has(`${p._id}:${store._id}`)) { skipped += 1; continue; }

      const qty = Math.random() < LOW_STOCK_SHARE
        ? randomInt(1, Math.max(1, p.reorderLevel))
        : randomInt(meta.stock[0], meta.stock[1]);
      const shelfLife = randomInt(meta.shelf[0], meta.shelf[1]);
      const manufactured = randomInt(3, Math.max(6, Math.floor(shelfLife * 0.3)));
      const perishable = shelfLife < 1500;

      const batch = await Batch.create({
        batchNumber: `OPEN${String(batchSeq++).padStart(6, '0')}`, product: p._id, supplier: p.primarySupplier,
        manufacturingDate: daysAgo(manufactured), ...(perishable ? { expiryDate: daysAgo(manufactured - shelfLife) } : {}),
        purchasePrice: p.purchasePrice, sellingPrice: p.sellingPrice, quantity: qty, availableQuantity: qty, store: store._id,
      });
      await Inventory.findOneAndUpdate(
        { product: p._id, store: store._id },
        { $inc: { currentStock: qty, openingStock: qty }, $setOnInsert: { product: p._id, store: store._id } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      await InventoryTransaction.create({
        product: p._id, batch: batch._id, quantity: qty, type: 'opening_stock',
        destination: store._id, destinationModel: 'Store', referenceNumber: batch.batchNumber, notes: 'Opening stock',
      });

      added += 1;
      units += qty;
      value += qty * p.purchasePrice;
    }
  }

  console.log(`[seed:stock] Opening stock added for ${added} product-store pairs across ${stores.length} store(s): ${stores.map((s) => s.name).join(', ')}.`);
  console.log(`             ${units.toLocaleString('en-IN')} units, stock value ₹${Math.round(value).toLocaleString('en-IN')} at cost.`);
  if (skipped) console.log(`             ${skipped} already had stock and were left unchanged.`);
}

run()
  .then(() => mongoose.connection.close())
  .catch(async (err) => {
    console.error('[seed:stock] Failed:', err);
    await mongoose.connection.close();
    process.exit(1);
  });
