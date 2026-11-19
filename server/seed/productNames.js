// Adds the starter Product Master list: product NAMES only (no price, size, unit or GST - the Billing
// screen takes quantity in g/kg and the rate per kg). Groceries (rice, flours, sugar & salt, dals, spices)
// and fresh vegetables. Safe to run again: names already in the list are skipped.
//   npm run seed:names
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Product from '../models/Product.js';
import { escapeRegex } from '../utils/validate.js';

export const PRODUCT_NAMES = [
  // Groceries - rice & grains
  'Basmati Rice', 'Sona Masoori Rice', 'Ponni Raw Rice', 'Idli Rice', 'Brown Rice', 'Poha (Flattened Rice)',
  // Groceries - flours
  'Wheat Flour (Atta)', 'Maida (Refined Flour)', 'Rava (Sooji)', 'Besan (Gram Flour)', 'Rice Flour', 'Ragi Flour',
  // Groceries - sugar & salt
  'Sugar', 'Jaggery', 'Iodised Salt', 'Rock Salt',
  // Groceries - dals & pulses
  'Toor Dal', 'Moong Dal', 'Urad Dal', 'Chana Dal', 'Masoor Dal', 'Rajma (Kidney Beans)', 'Kabuli Chana',
  // Groceries - spices & masalas
  'Turmeric Powder', 'Red Chilli Powder', 'Coriander Powder', 'Garam Masala', 'Sambar Powder', 'Cumin Seeds (Jeera)', 'Mustard Seeds', 'Black Pepper',
  // Vegetables
  'Tomato', 'Onion', 'Small Onion (Shallots)', 'Green Chilli', 'Ginger', 'Garlic', 'Lemon', 'Brinjal', 'Beans', 'Ladies Finger (Okra)',
  'Capsicum', 'Cauliflower', 'Cabbage', 'Cucumber', 'Bottle Gourd', 'Bitter Gourd', 'Drumstick', 'Spinach', 'Coriander Leaves', 'Curry Leaves',
  'Potato', 'Carrot', 'Beetroot', 'Radish', 'Sweet Potato',
];

const autoSku = (i) => `P${Date.now().toString(36).toUpperCase()}${String(i).padStart(3, '0')}`;

async function run() {
  await connectDB();
  let added = 0;
  let skipped = 0;
  for (const [i, name] of PRODUCT_NAMES.entries()) {
    const exists = await Product.exists({ name: new RegExp(`^${escapeRegex(name)}$`, 'i'), status: { $ne: 'discontinued' } });
    if (exists) { skipped += 1; continue; }
    await Product.create({ name, sku: autoSku(i), gstRate: 0, status: 'active' });
    added += 1;
  }
  console.log(`[seed:names] added ${added}, already in list ${skipped}, total names ${PRODUCT_NAMES.length}`);
}

run()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => mongoose.connection.close());
