import mongoose from 'mongoose';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import ApiError from './ApiError.js';
import { escapeRegex } from './validate.js';

// Find-or-create helpers used from purchase entry, so typing a name that already exists (in any letter
// case or spacing) re-uses the existing record instead of creating a duplicate.

export const cleanName = (v, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const exactName = (name) => new RegExp(`^${escapeRegex(name)}$`, 'i');

export async function findOrCreateBrand(name) {
  const clean = cleanName(name, 80);
  if (!clean) throw new ApiError(400, 'Brand name is required.');
  const existing = await Brand.findOne({ name: exactName(clean) });
  if (existing) {
    if (existing.status === 'inactive') { existing.status = 'active'; await existing.save(); }
    return { doc: existing, created: false };
  }
  try {
    return { doc: await Brand.create({ name: clean }), created: true };
  } catch (err) {
    if (err?.code === 11000) return { doc: await Brand.findOne({ name: exactName(clean) }), created: false };
    throw err;
  }
}

export async function findOrCreateProduct(name, userId) {
  const clean = cleanName(name);
  if (!clean) throw new ApiError(400, 'Product name is required.');
  const existing = await Product.findOne({ name: exactName(clean), status: { $ne: 'discontinued' } });
  if (existing) return { doc: existing, created: false };
  const sku = `P${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;
  return { doc: await Product.create({ name: clean, sku, gstRate: 0, createdBy: userId }), created: true };
}

// Resolves a PO line's brand: an id, or a typed name (find-or-create). Returns the brand id or undefined.
export async function resolveBrand({ brand, brandName }) {
  if (brand) {
    if (!mongoose.isValidObjectId(brand)) throw new ApiError(400, 'Brand is not valid.');
    const doc = await Brand.findById(brand).select('_id').lean();
    if (!doc) throw new ApiError(400, 'A brand on this order was not found.');
    return doc._id;
  }
  if (brandName && cleanName(brandName)) return (await findOrCreateBrand(brandName)).doc._id;
  return undefined;
}

// Remembers that each product was bought under these brands (Product.brands), for the brand pickers.
export async function rememberBrands(lines) {
  const ops = lines.filter((l) => l.brand).map((l) => ({
    updateOne: { filter: { _id: l.product }, update: { $addToSet: { brands: l.brand } } },
  }));
  if (ops.length) await Product.bulkWrite(ops);
}

export default { cleanName, findOrCreateBrand, findOrCreateProduct, resolveBrand, rememberBrands };
