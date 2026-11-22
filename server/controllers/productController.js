import mongoose from 'mongoose';
import Product from '../models/Product.js';
import TaxRate from '../models/TaxRate.js';
import Category from '../models/Category.js';
import Settings from '../models/Settings.js';
import { unitMap, normCode, parseOption, formatOption, compatible, productUnits } from '../utils/units.js';
import Inventory from '../models/Inventory.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { extractProductInfoFromImage } from '../services/aiImageService.js';
import { literalRegex, escapeRegex } from '../utils/validate.js';
import Batch from '../models/Batch.js';
import Sale from '../models/Sale.js';
import Vendor from '../models/Vendor.js';
import InventoryTransaction from '../models/InventoryTransaction.js';
import { findOrCreateBrand } from '../utils/masters.js';
import { queryLines } from './purchaseAnalysisController.js';
import { requireFields } from '../utils/fieldRules.js';

export const listProducts = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.search) {
    filter.$or = [
      { name: literalRegex(req.query.search) },
      { sku: literalRegex(req.query.search) },
      { barcode: literalRegex(req.query.search) },
    ];
  }
  if (req.query.category) filter.category = req.query.category;
  // Brand: the product's main brand or any brand it has been bought under.
  if (req.query.brand) filter.$and = [...(filter.$and || []), { $or: [{ brand: req.query.brand }, { brands: req.query.brand }] }];
  if (req.query.supplier) filter.primarySupplier = req.query.supplier;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.letter && req.query.letter !== 'ALL') {
    filter.name = new RegExp(`^${escapeRegex(String(req.query.letter).slice(0, 1))}`, 'i');
  }
  if (req.query.minPrice || req.query.maxPrice) {
    filter.sellingPrice = {};
    if (req.query.minPrice) filter.sellingPrice.$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) filter.sellingPrice.$lte = Number(req.query.maxPrice);
  }

  // Stock availability: in (stock > 0), low (at or below reorder level), out (none).
  if (req.query.stock) {
    const want = String(req.query.stock);
    if (!['in', 'low', 'out'].includes(want)) throw new ApiError(400, 'Stock filter must be in, low or out.');
    const rows = await Inventory.aggregate([
      { $group: { _id: '$product', stock: { $sum: '$currentStock' } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p', pipeline: [{ $project: { reorderLevel: 1 } }] } },
      { $unwind: '$p' },
      { $project: { stock: 1, reorderLevel: { $ifNull: ['$p.reorderLevel', 10] } } },
    ]);
    const inStock = rows.filter((r) => r.stock > 0);
    if (want === 'out') filter._id = { $nin: inStock.map((r) => r._id) };
    else if (want === 'in') filter._id = { $in: inStock.map((r) => r._id) };
    else filter._id = { $in: inStock.filter((r) => r.stock <= r.reorderLevel).map((r) => r._id) };
  }
  const SORTS = { name: 'name', createdAt: 'createdAt', updatedAt: 'updatedAt', sellingPrice: 'sellingPrice', purchasePrice: 'purchasePrice', gstRate: 'gstRate' };
  const sortKey = SORTS[req.query.sort] || 'name';
  const sortDir = req.query.order === 'desc' ? -1 : 1;

  const [docs, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name')
      .populate('brand', 'name')
      .populate('brands', 'name')
      .populate('primarySupplier', 'name')
      .sort({ [sortKey]: sortDir, _id: 1 })
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  if (req.query.withStock === 'true') {
    const ids = docs.map((d) => d._id);
    // Single store: one central stock per product - the same quantity the Inventory pages show and the
    // quantity POS billing deducts from. (`?store=` is accepted but no longer splits stock by location.)
    const inv = await Inventory.aggregate([
      { $match: { product: { $in: ids } } },
      { $group: { _id: '$product', stock: { $sum: '$currentStock' } } },
    ]);
    const stockMap = new Map(inv.map((i) => [String(i._id), i.stock]));
    docs.forEach((d) => { d._doc.stock = stockMap.get(String(d._id)) || 0; });
  }

  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

// Unit fields the Billing screen needs to price a line.
const BILLING_FIELDS = 'name sku barcode mrp sellingPrice purchasePrice discountPercent gstRate unit productType sellingUnit baseUnit purchaseUnit unitOptions packUnit packQuantity packQuantityUnit conversions unitPrices';

// Every active product name (for the Billing dropdown), A-Z, with its unit / price setup.
export const productNames = catchAsync(async (req, res) => {
  const rows = await Product.find({ status: 'active' }).select(BILLING_FIELDS).sort({ name: 1 }).collation({ locale: 'en' }).lean();
  res.json({ success: true, data: rows });
});

export const getProduct = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('category subcategory brand brands primarySupplier taxRate').populate('primaryVendor', 'name verificationStatus');
  if (!product) throw new ApiError(404, 'Product not found.');
  const stock = await Inventory.aggregate([
    { $match: { product: product._id } },
    { $group: { _id: null, total: { $sum: '$currentStock' } } },
  ]);
  res.json({ success: true, data: { ...product.toObject(), stock: stock[0]?.total || 0 } });
});

// Product names are unique (ignoring case and extra spaces) among products that are not deleted.
async function assertNameFree(name, exceptId) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) throw new ApiError(400, 'Product name is required.');
  if (clean.length > 120) throw new ApiError(400, 'Product name is too long (max 120 characters).');
  const dup = await Product.findOne({
    name: new RegExp(`^${escapeRegex(clean)}$`, 'i'), status: { $ne: 'discontinued' }, ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).select('_id').lean();
  if (dup) throw new ApiError(409, `"${clean}" is already in the product list.`);
  return clean;
}

export const GST_SLABS = [0, 5, 12, 18, 28];

// Barcode stored on the product (e.g. from the Excel import): any printable code, no spaces.
// Empty -> removed. Must be unique among products that are not deleted.
const BARCODE_RE = /^[!-~]{1,48}$/;
export function cleanCode(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, '');
}
async function applyBarcode(body, exceptId) {
  if (body.barcode === undefined) return;
  const code = cleanCode(body.barcode);
  if (!code) { delete body.barcode; body.$unset = { ...(body.$unset || {}), barcode: 1 }; return; }
  if (!BARCODE_RE.test(code)) throw new ApiError(400, 'Barcode can only contain letters, numbers and symbols (no spaces), max 48 characters.');
  const dup = await Product.findOne({ barcode: code, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('name status').lean();
  if (dup) throw new ApiError(409, `Barcode ${code} is already used by "${dup.name}"${dup.status === 'discontinued' ? ' (deleted product)' : ''}.`);
  body.barcode = code;
}
function applyPrices(body, before) {
  for (const k of ['mrp', 'sellingPrice', 'purchasePrice']) {
    if (body[k] === undefined) continue;
    if (body[k] === '' || body[k] === null) { body[k] = 0; continue; }
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < 0 || v > 10000000) throw new ApiError(400, `${{ mrp: 'MRP', sellingPrice: 'Selling price', purchasePrice: 'Purchase price' }[k]} must be a number of 0 or more.`);
    body[k] = Math.round(v * 100) / 100;
  }
  const mrp = body.mrp ?? before?.mrp ?? 0;
  const sp = body.sellingPrice ?? before?.sellingPrice ?? 0;
  if (mrp > 0 && sp > mrp) throw new ApiError(400, 'Selling price cannot be more than the MRP.');
}

// ---------- Units ----------
export async function loadCustomUnits() {
  return (await Settings.findOne().select('customUnits').lean())?.customUnits || [];
}

// GET /products/units -> built-in + custom units.
// Products that use a unit anywhere in their setup (so a custom unit is not removed from under them).
async function productsUsingUnit(code) {
  return Product.countDocuments({
    status: { $ne: 'discontinued' },
    $or: [{ sellingUnit: code }, { baseUnit: code }, { purchaseUnit: code }, { packUnit: code }, { packQuantityUnit: code },
      { 'conversions.unit': code }, { 'conversions.ofUnit': code }, { 'unitPrices.unit': code }, { unitOptions: new RegExp(`(^|\\s)${escapeRegex(code)}$`, 'i') }],
  });
}

// PUT /products/units/:code (administrators): rename / change the size of a custom unit. Built-in units are fixed.
// The kind (weight / count ...) cannot change while products use the unit, because their stock would mean something else.
export const updateUnit = catchAsync(async (req, res) => {
  const code = normCode(req.params.code);
  const custom = await loadCustomUnits();
  const i = custom.findIndex((u) => u.code === code);
  if (i < 0) throw new ApiError(400, unitMap([]).has(code) ? 'Built-in units cannot be changed.' : 'Unit not found.');
  const old = custom[i];
  const label = req.body?.label !== undefined ? String(req.body.label).trim().replace(/\s+/g, ' ') : old.label;
  if (!label || label.length > 30) throw new ApiError(400, 'Unit name is required (max 30 characters).');
  const family = req.body?.family !== undefined ? req.body.family : old.family;
  if (!['mass', 'volume', 'pack', 'each', 'length'].includes(family)) throw new ApiError(400, 'Unknown unit kind.');
  const used = await productsUsingUnit(code);
  if (used && (family !== old.family || (req.body?.factor !== undefined && Number(req.body.factor) !== Number(old.factor)))) {
    throw new ApiError(400, `${used} product(s) use ${old.label}; its kind and size cannot change while they do (stock would change meaning). Change the name only, or create a new unit.`);
  }
  const factor = unitFactor(family, req.body?.factor !== undefined ? req.body.factor : old.factor, label);
  const updated = { code, label, short: String(req.body?.short ?? old.short ?? label.toLowerCase()).trim().slice(0, 12) || label.toLowerCase(), family, ...(factor ? { factor } : {}) };
  custom[i] = updated;
  await Settings.updateOne({}, { $set: { customUnits: custom } });
  await recordAudit({ req, action: 'unit.update', entity: 'Settings', oldValue: old, newValue: updated });
  res.json({ success: true, data: unitMap(custom).get(code) });
});

// DELETE /products/units/:code (administrators): only when no product uses it.
export const deleteUnit = catchAsync(async (req, res) => {
  const code = normCode(req.params.code);
  const custom = await loadCustomUnits();
  const old = custom.find((u) => u.code === code);
  if (!old) throw new ApiError(400, unitMap([]).has(code) ? 'Built-in units cannot be deleted.' : 'Unit not found.');
  const used = await productsUsingUnit(code);
  if (used) throw new ApiError(400, `${used} product(s) still use ${old.label}. Change those products first.`);
  await Settings.updateOne({}, { $pull: { customUnits: { code } } });
  await recordAudit({ req, action: 'unit.delete', entity: 'Settings', oldValue: old });
  res.json({ success: true, message: `${old.label} removed.` });
});

// Units with how many products use each (Products > Units page).
export const unitUsage = catchAsync(async (req, res) => {
  const units = [...unitMap(await loadCustomUnits()).values()];
  const rows = await Product.aggregate([
    { $match: { status: { $ne: 'discontinued' } } },
    { $project: { u: { $setUnion: [[{ $ifNull: ['$sellingUnit', ''] }, { $ifNull: ['$baseUnit', ''] }, { $ifNull: ['$purchaseUnit', ''] }, { $ifNull: ['$packUnit', ''] }], { $ifNull: ['$conversions.unit', []] }, { $ifNull: ['$unitPrices.unit', []] }] } } },
    { $unwind: '$u' }, { $group: { _id: '$u', n: { $sum: 1 } } },
  ]);
  const used = new Map(rows.map((r) => [r._id, r.n]));
  res.json({ success: true, data: units.map((u) => ({ ...u, products: used.get(u.code) || 0 })) });
});

export const listUnits = catchAsync(async (req, res) => {
  const custom = await loadCustomUnits();
  res.json({ success: true, data: [...unitMap(custom).values()] });
});

// POST /products/units { label, family: 'pack' | 'mass' | 'volume' | 'each' | 'length', factor, short }
// factor = how many g / ml / pieces / cm one unit is (global conversion rule, e.g. quintal = 100000 g, score = 20 pcs).
const UNIT_FACTOR_NAME = { mass: 'grams', volume: 'millilitres', each: 'pieces', length: 'centimetres' };
function unitFactor(family, raw, label) {
  if (family === 'pack') return undefined;
  const factor = Number(raw);
  if (!(factor > 0) || factor > 1e9) throw new ApiError(400, `Enter how many ${UNIT_FACTOR_NAME[family]} one ${label} is.`);
  return factor;
}
export const createUnit = catchAsync(async (req, res) => {
  const label = String(req.body?.label || '').trim().replace(/\s+/g, ' ');
  if (!label || label.length > 30 || !/^[a-zA-Z][a-zA-Z _-]*$/.test(label)) throw new ApiError(400, 'Unit name must start with a letter and use only letters, spaces or dashes (max 30).');
  const code = normCode(label);
  const family = ['mass', 'volume', 'pack', 'each', 'length'].includes(req.body?.family) ? req.body.family : 'pack';
  const factor = unitFactor(family, req.body?.factor, label);
  const custom = await loadCustomUnits();
  if (unitMap(custom).has(code)) throw new ApiError(409, `The unit "${label}" already exists.`);
  const short = String(req.body?.short || '').trim().slice(0, 12) || label.toLowerCase();
  const unit = { code, label, short, family, ...(factor ? { factor } : {}) };
  await Settings.updateOne({}, { $push: { customUnits: unit } }, { upsert: true });
  await recordAudit({ req, action: 'unit.create', entity: 'Settings', newValue: unit });
  res.status(201).json({ success: true, data: [...unitMap([...custom, unit]).values()].find((u) => u.code === code) });
});

// Validates / normalises the unit fields of a product body (only the fields that were sent).
async function applyUnits(body, before) {
  const keys = ['productType', 'sellingUnit', 'baseUnit', 'purchaseUnit', 'unitOptions', 'packUnit', 'packQuantity', 'packQuantityUnit', 'conversions', 'unitPrices'];
  if (!keys.some((k) => body[k] !== undefined)) return;
  const units = unitMap(await loadCustomUnits());
  const code = (v, label) => {
    if (v === undefined) return undefined;
    if (v === '' || v === null) return '';
    const c = normCode(v);
    if (!units.has(c)) throw new ApiError(400, `${label}: unknown unit "${v}".`);
    return c;
  };
  if (body.productType === null) body.productType = '';
  if (body.productType !== undefined && !['loose', 'packed', ''].includes(body.productType)) throw new ApiError(400, 'Product type must be loose or packed.');
  body.sellingUnit = code(body.sellingUnit, 'Selling unit');
  body.baseUnit = code(body.baseUnit, 'Base (stock) unit');
  body.purchaseUnit = code(body.purchaseUnit, 'Purchase unit');
  body.packUnit = code(body.packUnit, 'Pack unit');
  body.packQuantityUnit = code(body.packQuantityUnit, 'Net content unit');
  if (body.packQuantity !== undefined) {
    if (body.packQuantity === '' || body.packQuantity === null) body.packQuantity = 0;
    body.packQuantity = Number(body.packQuantity);
    if (!(body.packQuantity >= 0) || body.packQuantity > 1e7) throw new ApiError(400, 'Net content must be a number of 0 or more.');
  }
  if (body.unitOptions !== undefined) {
    if (!Array.isArray(body.unitOptions)) throw new ApiError(400, 'Unit options must be a list.');
    const seen = new Set();
    body.unitOptions = body.unitOptions.slice(0, 40).map((t) => {
      const o = parseOption(t, units);
      if (!o) throw new ApiError(400, `Unit option "${t}" is not a unit or a size like "500 g".`);
      return formatOption(o, units);
    }).filter((t) => !seen.has(t) && seen.add(t));
  }
  // Conversion rules: 1 <pack-type unit> = <quantity> <a weight / volume / length / count unit>.
  if (body.conversions !== undefined) {
    if (!Array.isArray(body.conversions)) throw new ApiError(400, 'Unit conversions must be a list.');
    const seen = new Set();
    body.conversions = body.conversions.slice(0, 20).filter((c) => c && (c.unit || c.ofUnit || c.quantity)).map((c) => {
      const unit = code(c.unit, 'Conversion unit');
      const ofUnit = code(c.ofUnit, 'Conversion "equals" unit');
      const quantity = Number(c.quantity);
      if (!unit || !ofUnit) throw new ApiError(400, 'Each conversion needs both units, e.g. 1 box = 24 pcs.');
      if (!units.get(unit).family.startsWith('pack:')) throw new ApiError(400, `${units.get(unit).label} already has a fixed size - conversions are for units like box, bundle, packet.`);
      if (units.get(ofUnit).family.startsWith('pack:')) throw new ApiError(400, `Convert ${units.get(unit).short} into pieces, weight, volume or length (not into another pack unit).`);
      if (!(quantity > 0) || quantity > 1e7) throw new ApiError(400, `Enter how many ${units.get(ofUnit).short} are in 1 ${units.get(unit).short}.`);
      if (seen.has(unit)) throw new ApiError(400, `${units.get(unit).short} has two conversion rules - keep one.`);
      seen.add(unit);
      return { unit, quantity, ofUnit };
    });
  }
  if (body.unitPrices !== undefined) {
    if (!Array.isArray(body.unitPrices)) throw new ApiError(400, 'Unit rates must be a list.');
    const seen = new Set();
    body.unitPrices = body.unitPrices.slice(0, 20).filter((r) => r && r.unit).map((r) => {
      const unit = code(r.unit, 'Rate unit');
      const price = (v, label) => {
        if (v === undefined || v === null || v === '') return 0;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 1e7) throw new ApiError(400, `${label} for ${units.get(unit).short} must be 0 or more.`);
        return Math.round(n * 100) / 100;
      };
      if (seen.has(unit)) throw new ApiError(400, `${units.get(unit).short} has two rates - keep one.`);
      seen.add(unit);
      return { unit, sellingPrice: price(r.sellingPrice, 'Selling rate'), purchasePrice: price(r.purchasePrice, 'Purchase rate') };
    }).filter((r) => r.sellingPrice > 0 || r.purchasePrice > 0);
  }
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  // The setup after this change, to check that the units fit together.
  const merged = { ...(before?.toObject?.() || {}), ...body };
  for (const k of keys) if (merged[k] === '') merged[k] = undefined;
  if (merged.packUnit && merged.packQuantity > 0) {
    const inner = units.get(merged.packQuantityUnit);
    if (!inner || !['mass', 'volume'].includes(inner.family)) throw new ApiError(400, 'Net content per pack must be a weight or volume unit (g, kg, ml, L...).');
  }
  const pack = { ...(merged.packUnit ? { packUnit: merged.packUnit, packQuantity: merged.packQuantity, packQuantityUnit: merged.packQuantityUnit } : {}), conversions: merged.conversions || [] };
  const { sellingUnit, baseUnit } = productUnits(merged, units);
  if (!compatible(sellingUnit, baseUnit, units, pack)) {
    throw new ApiError(400, `Selling unit ${units.get(sellingUnit).short} and stock unit ${units.get(baseUnit).short} do not convert. Use the same kind of unit, or set the net content of the pack.`);
  }
  for (const t of merged.unitOptions || []) {
    const o = parseOption(t, units);
    if (o && !compatible(o.unit, sellingUnit, units, pack)) throw new ApiError(400, `Unit option "${t}" cannot be priced from the selling unit ${units.get(sellingUnit).short}.`);
  }
  for (const r of merged.unitPrices || []) {
    if (!compatible(r.unit, baseUnit, units, pack)) throw new ApiError(400, `A rate is set per ${units.get(r.unit)?.short || r.unit}, but ${units.get(r.unit)?.short || r.unit} does not convert to the stock unit ${units.get(baseUnit).short}. Add a conversion rule (e.g. 1 box = 24 pcs).`);
  }
  // Stock numbers are kept in the base unit, so it cannot change while the product holds stock.
  if (before && productUnits(before, units).baseUnit !== baseUnit) {
    const inv = await Inventory.aggregate([{ $match: { product: before._id } }, { $group: { _id: null, total: { $sum: '$currentStock' } } }]);
    if ((inv[0]?.total || 0) !== 0) throw new ApiError(400, `The stock unit cannot change while ${before.name} has stock (${inv[0].total} ${units.get(productUnits(before, units).baseUnit)?.short}). Bring the stock to 0 first.`);
  }
  // Keep the old `unit` field in step for screens that still show it.
  if (body.sellingUnit) body.unit = body.sellingUnit.toUpperCase();
  for (const k of keys) {
    if (body[k] === '') { delete body[k]; body.$unset = { ...(body.$unset || {}), [k]: 1 }; }
  }
}

// `categoryName` -> the Category with that name (created if it does not exist yet). Empty -> no category.
async function applyCategoryName(body) {
  if (body.categoryName === undefined) return;
  const name = String(body.categoryName || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  delete body.categoryName;
  if (!name) { body.$unset = { ...(body.$unset || {}), category: 1 }; delete body.category; return; }
  let cat = await Category.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') }).select('_id').lean();
  if (!cat) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
    let slug = base;
    for (let i = 2; await Category.exists({ slug }); i += 1) slug = `${base}-${i}`;
    cat = await Category.create({ name, slug });
  }
  body.category = cat._id;
}

function applyDiscount(body) {
  if (body.discountPercent === undefined) return;
  const v = body.discountPercent === '' || body.discountPercent === null ? 0 : Number(body.discountPercent);
  if (!(v >= 0 && v <= 100)) throw new ApiError(400, 'Discount must be between 0 and 100 %.');
  body.discountPercent = v;
}

// Full product details (Product Master > New / Edit product): brands by name (find-or-create, no duplicates),
// a sub-category under the category, SKU, HSN, description, preferred supplier, stock limits, shelf life and
// free-form attributes. Every field is optional except the name.
async function applyDetails(body, before) {
  if (body.brandNames !== undefined || body.brandName !== undefined) {
    const names = [...new Set((Array.isArray(body.brandNames) ? body.brandNames : []).map((n) => String(n || '').trim()).filter(Boolean))];
    const primaryName = body.brandName !== undefined ? String(body.brandName || '').trim() : undefined;
    if (primaryName && !names.some((n) => n.toLowerCase() === primaryName.toLowerCase())) names.unshift(primaryName);
    if (names.length > 30) throw new ApiError(400, 'A product can have at most 30 brands.');
    const ids = [];
    for (const n of names) ids.push((await findOrCreateBrand(n)).doc._id);
    if (body.brandNames !== undefined) body.brands = ids;
    if (primaryName !== undefined) {
      if (primaryName) body.brand = ids[names.findIndex((n) => n.toLowerCase() === primaryName.toLowerCase())];
      else { body.$unset = { ...(body.$unset || {}), brand: 1 }; delete body.brand; }
    } else if (ids.length && !before?.brand) body.brand = ids[0];
  }
  delete body.brandNames; delete body.brandName;

  if (body.subcategoryName !== undefined) {
    const name = String(body.subcategoryName || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    delete body.subcategoryName;
    const parent = body.category || before?.category;
    if (!name) { body.$unset = { ...(body.$unset || {}), subcategory: 1 }; delete body.subcategory; }
    else {
      if (!parent) throw new ApiError(400, 'Choose the category before the sub-category.');
      let sub = await Category.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i'), parent }).select('_id').lean();
      if (!sub) {
        const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sub-category';
        let slug = base;
        for (let i = 2; await Category.exists({ slug }); i += 1) slug = `${base}-${i}`;
        sub = await Category.create({ name, slug, parent });
      }
      body.subcategory = sub._id;
    }
  }

  if (body.attributes !== undefined) {
    if (!Array.isArray(body.attributes)) throw new ApiError(400, 'Attributes must be a list.');
    body.attributes = body.attributes
      .map((a) => ({ name: String(a?.name || '').trim().slice(0, 40), value: String(a?.value ?? '').trim().slice(0, 120) }))
      .filter((a) => a.name && a.value);
    if (body.attributes.length > 30) throw new ApiError(400, 'At most 30 attributes per product.');
  }
  for (const [k, label] of [['reorderLevel', 'Reorder level'], ['minStock', 'Minimum stock'], ['maxStock', 'Maximum stock'], ['shelfLifeDays', 'Shelf life (days)']]) {
    if (body[k] === undefined) continue;
    if (body[k] === '' || body[k] === null) { if (k === 'shelfLifeDays') { body.$unset = { ...(body.$unset || {}), shelfLifeDays: 1 }; delete body[k]; } else body[k] = 0; continue; }
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < 0 || v > 1e9) throw new ApiError(400, `${label} must be a number of 0 or more.`);
    body[k] = v;
  }
  const max = body.maxStock ?? before?.maxStock; const min = body.minStock ?? before?.minStock;
  if (max > 0 && min > max) throw new ApiError(400, 'Minimum stock cannot be more than the maximum stock.');

  if (body.primaryVendor !== undefined) {
    if (!body.primaryVendor) { body.$unset = { ...(body.$unset || {}), primaryVendor: 1 }; delete body.primaryVendor; }
    else if (!mongoose.isValidObjectId(body.primaryVendor) || !(await Vendor.exists({ _id: body.primaryVendor }))) throw new ApiError(400, 'Preferred supplier was not found.');
  }
  for (const k of ['hsn', 'description']) if (typeof body[k] === 'string') body[k] = body[k].trim().slice(0, k === 'hsn' ? 12 : 1000);
  if (body.hsn && !/^[0-9]{4,8}$/.test(body.hsn)) throw new ApiError(400, 'HSN code must be 4 to 8 digits.');
  if (body.status !== undefined && !['active', 'inactive'].includes(body.status)) throw new ApiError(400, 'Status must be active or inactive.');
  if (before && body.sku !== undefined) {
    const sku = String(body.sku || '').trim().toUpperCase();
    if (!sku) delete body.sku;
    else {
      if (await Product.exists({ sku, _id: { $ne: before._id } })) throw new ApiError(409, `SKU ${sku} is already used by another product.`);
      body.sku = sku;
    }
  }
}

// Values checked against Settings > Mandatory Fields (Product Master). A price of 0 counts as "not entered".
const RULE_SOURCE = {
  category: ['categoryName', 'category'], brand: ['brandName', 'brandNames', 'brand'], sku: ['sku'], barcode: ['barcode'], hsn: ['hsn'],
  description: ['description'], sellingUnit: ['sellingUnit'], purchasePrice: ['purchasePrice'], sellingPrice: ['sellingPrice'], mrp: ['mrp'],
  gstRate: ['gstRate', 'taxRate'], primaryVendor: ['primaryVendor'],
};
function productRuleValues(raw = {}, body = {}) {
  const num = (v) => (v === undefined || v === null || v === '' || Number(v) === 0 ? '' : v);
  return {
    category: body.category || '', brand: body.brand || (body.brands || [])[0] || '', sku: raw.sku || '', barcode: body.barcode || '',
    hsn: body.hsn || '', description: body.description || '', sellingUnit: body.sellingUnit || '',
    purchasePrice: num(body.purchasePrice), sellingPrice: num(body.sellingPrice), mrp: num(body.mrp),
    gstRate: raw.gstRate === undefined || raw.gstRate === '' ? (raw.taxRate ? 'set' : '') : 'set', primaryVendor: body.primaryVendor || '',
  };
}

const autoSku = () => `P${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;

export const createProduct = catchAsync(async (req, res) => {
  const body = { ...req.body, createdBy: req.user._id };
  // The Product Master only needs a name; SKU and GST are optional extras.
  body.name = await assertNameFree(body.name);
  if (!body.sku || !String(body.sku).trim()) body.sku = autoSku();
  await applyBarcode(body);
  await applyUnits(body);
  await applyCategoryName(body);
  await applyDetails(body);
  await requireFields('product', productRuleValues(req.body, body));
  delete body.$unset; // nothing to remove on a new product
  applyPrices(body);
  applyDiscount(body);

  if (body.taxRate) {
    const tax = await TaxRate.findById(body.taxRate);
    if (!tax) throw new ApiError(400, 'Selected GST rate was not found.');
    body.gstRate = tax.ratePercent;
  } else if (body.gstRate === undefined) {
    body.gstRate = 0;
  }

  const existing = await Product.findOne({ sku: body.sku?.toUpperCase() });
  if (existing) throw new ApiError(409, 'A product with this SKU already exists.');

  const product = await Product.create(body);
  await recordAudit({ req, action: 'product.create', entity: 'Product', entityId: product._id, newValue: { sku: product.sku, name: product.name } });
  res.status(201).json({ success: true, data: product });
});

export const updateProduct = catchAsync(async (req, res) => {
  const before = await Product.findById(req.params.id);
  if (!before) throw new ApiError(404, 'Product not found.');

  const body = { ...req.body };
  if (body.name !== undefined) body.name = await assertNameFree(body.name, before._id);
  delete body.$unset; // never taken from the client
  await applyBarcode(body, before._id);
  await applyUnits(body, before);
  await applyCategoryName(body);
  await applyDetails(body, before);
  // Only the fields being changed are checked (an edit never fails because an untouched optional field is empty).
  await requireFields('product', Object.fromEntries(Object.entries(productRuleValues(req.body, body)).filter(([k]) => RULE_SOURCE[k].some((f) => f in req.body))), { partial: true });
  applyPrices(body, before);
  applyDiscount(body);
  if (body.gstRate !== undefined) {
    body.gstRate = Number(body.gstRate);
    if (!GST_SLABS.includes(body.gstRate)) throw new ApiError(400, `GST % must be one of ${GST_SLABS.join(', ')}.`);
  }
  if (body.taxRate) {
    const tax = await TaxRate.findById(body.taxRate);
    if (!tax) throw new ApiError(400, 'Selected GST rate was not found.');
    body.gstRate = tax.ratePercent;
  }

  const priceChanged = body.sellingPrice !== undefined && Number(body.sellingPrice) !== before.sellingPrice;
  const product = await Product.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });

  await recordAudit({
    req,
    action: priceChanged ? 'product.price_change' : 'product.update',
    entity: 'Product',
    entityId: product._id,
    oldValue: { sellingPrice: before.sellingPrice, mrp: before.mrp, barcode: before.barcode, status: before.status },
    newValue: { sellingPrice: product.sellingPrice, mrp: product.mrp, barcode: product.barcode, status: product.status },
  });

  res.json({ success: true, data: product });
});

// One product's full picture for the Product view page: details, stock (total, per brand, batches), purchase
// and rate history, sales, recent stock movements. Everything is read live from purchases, DCs, bills and stock.
export const productOverview = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('category subcategory brand brands taxRate', 'name ratePercent').populate('primaryVendor', 'name verificationStatus').lean();
  if (!product) throw new ApiError(404, 'Product not found.');
  const id = product._id;
  const [inv, batches, purchases, salesAgg, sales, moves] = await Promise.all([
    Inventory.aggregate([{ $match: { product: id } }, { $group: { _id: null, current: { $sum: '$currentStock' }, reserved: { $sum: '$reservedStock' }, damaged: { $sum: '$damagedStock' } } }]),
    Batch.find({ product: id }).populate('brand', 'name').populate('supplier', 'name').sort({ createdAt: -1 }).limit(50).lean(),
    queryLines({ product: String(id), sort: 'date', order: 'desc' }, { page: 1, limit: 25 }),
    Sale.aggregate([
      { $match: { 'items.product': id, status: { $nin: ['held', 'cancelled'] } } },
      { $unwind: '$items' }, { $match: { 'items.product': id } },
      { $group: { _id: null, bills: { $addToSet: '$_id' }, qty: { $sum: { $ifNull: ['$items.baseQty', '$items.quantity'] } }, value: { $sum: '$items.totalAmount' }, last: { $max: '$createdAt' } } },
    ]),
    Sale.find({ 'items.product': id, status: { $ne: 'held' } }).sort({ createdAt: -1 }).limit(15)
      .select('invoiceNumber createdAt status items customer amountDue').populate('customer', 'name').lean(),
    InventoryTransaction.find({ product: id }).sort({ createdAt: -1 }).limit(20).select('type quantity referenceNumber createdAt notes').lean(),
  ]);
  const byBrand = new Map();
  for (const b of batches) {
    const key = b.brand?._id ? String(b.brand._id) : '';
    const row = byBrand.get(key) || { brandId: key || null, brandName: b.brand?.name || 'No brand', stock: 0, batches: 0, lastRate: null };
    row.stock += b.availableQuantity || 0; row.batches += 1;
    if (row.lastRate === null) row.lastRate = b.purchasePrice;
    byBrand.set(key, row);
  }
  [product.brand, ...(product.brands || [])].filter(Boolean).forEach((b) => {
    if (!byBrand.has(String(b._id))) byBrand.set(String(b._id), { brandId: String(b._id), brandName: b.name, stock: 0, batches: 0, lastRate: null });
  });
  const s = salesAgg[0] || {};
  const stock = inv[0]?.current || 0;
  const reorder = product.reorderLevel ?? 10;
  res.json({
    success: true,
    data: {
      product,
      stock: {
        current: stock, reserved: inv[0]?.reserved || 0, damaged: inv[0]?.damaged || 0,
        status: stock <= 0 ? 'out_of_stock' : (stock <= reorder ? 'low_stock' : 'in_stock'),
        value: Math.round(stock * (product.purchasePrice || batches[0]?.purchasePrice || 0) * 100) / 100,
        byBrand: [...byBrand.values()].sort((a, b) => b.stock - a.stock),
      },
      batches: batches.map((b) => ({ _id: b._id, batchNumber: b.batchNumber, brand: b.brand?.name, supplier: b.supplier?.name, quantity: b.quantity, available: b.availableQuantity, purchasePrice: b.purchasePrice, expiryDate: b.expiryDate, createdAt: b.createdAt, status: b.status })),
      purchases: { rows: purchases.rows, totals: purchases.totals },
      sales: {
        bills: s.bills?.length || 0, qty: Math.round((s.qty || 0) * 1000) / 1000, value: Math.round((s.value || 0) * 100) / 100, last: s.last || null,
        recent: sales.map((x) => {
          const lines = x.items.filter((i) => String(i.product) === String(id));
          return { _id: x._id, invoiceNumber: x.invoiceNumber, date: x.createdAt, status: x.status, customer: x.customer?.name || 'Walk-in', amountDue: x.amountDue || 0,
            qty: lines.reduce((t, i) => t + i.quantity, 0), unit: lines[0]?.unit, brand: lines.map((i) => i.brandName).filter(Boolean).join(', '), amount: lines.reduce((t, i) => t + (i.totalAmount || 0), 0) };
        }),
      },
      movements: moves,
    },
  });
});

export const deleteProduct = catchAsync(async (req, res) => {
  // Deleting frees the product's barcode so it can be given to another product.
  const product = await Product.findByIdAndUpdate(req.params.id, { status: 'discontinued', $unset: { barcode: 1 } }, { new: true });
  if (!product) throw new ApiError(404, 'Product not found.');
  await recordAudit({ req, action: 'product.discontinue', entity: 'Product', entityId: product._id });
  res.json({ success: true, message: 'Product marked as discontinued.' });
});

export const uploadProductImages = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found.');
  const files = req.files || [];
  if (!files.length) throw new ApiError(400, 'No images were uploaded.');

  const newImages = files.map((f, i) => ({
    url: f.url,
    isPrimary: product.images.length === 0 && i === 0,
  }));
  product.images.push(...newImages);
  await product.save();
  res.status(201).json({ success: true, data: product.images });
});

export const setPrimaryImage = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found.');
  product.images.forEach((img) => { img.isPrimary = String(img._id) === req.params.imageId; });
  await product.save();
  res.json({ success: true, data: product.images });
});

export const deleteProductImage = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found.');
  product.images = product.images.filter((img) => String(img._id) !== req.params.imageId);
  await product.save();
  res.json({ success: true, data: product.images });
});

// Section 11: AI/image-based product creation. Uses a clean service abstraction;
// only ever returns real extraction results, never fabricated data.
export const extractFromImage = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Please upload an image to extract product information from.');
  const imageUrl = req.file.url;
  const result = await extractProductInfoFromImage(imageUrl);
  res.json({ success: true, imageUrl, ...result });
});

export default {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
  uploadProductImages, setPrimaryImage, deleteProductImage, extractFromImage,
};
