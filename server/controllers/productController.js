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
  if (req.query.brand) filter.brand = req.query.brand;
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

  const [docs, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name')
      .populate('brand', 'name')
      .populate('primarySupplier', 'name')
      .sort({ name: 1 })
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
const BILLING_FIELDS = 'name sku barcode mrp sellingPrice discountPercent gstRate unit productType sellingUnit baseUnit unitOptions packUnit packQuantity packQuantityUnit';

// Every active product name (for the Billing dropdown), A-Z, with its unit / price setup.
export const productNames = catchAsync(async (req, res) => {
  const rows = await Product.find({ status: 'active' }).select(BILLING_FIELDS).sort({ name: 1 }).collation({ locale: 'en' }).lean();
  res.json({ success: true, data: rows });
});

export const getProduct = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('category brand primarySupplier primaryVendor taxRate');
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
  for (const k of ['mrp', 'sellingPrice']) {
    if (body[k] === undefined) continue;
    if (body[k] === '' || body[k] === null) { body[k] = 0; continue; }
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < 0 || v > 10000000) throw new ApiError(400, `${k === 'mrp' ? 'MRP' : 'Selling price'} must be a number of 0 or more.`);
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
export const listUnits = catchAsync(async (req, res) => {
  const custom = await loadCustomUnits();
  res.json({ success: true, data: [...unitMap(custom).values()] });
});

// POST /products/units { label, family: 'pack' | 'mass' | 'volume', factor (g or ml in one unit) }
export const createUnit = catchAsync(async (req, res) => {
  const label = String(req.body?.label || '').trim().replace(/\s+/g, ' ');
  if (!label || label.length > 30 || !/^[a-zA-Z][a-zA-Z _-]*$/.test(label)) throw new ApiError(400, 'Unit name must start with a letter and use only letters, spaces or dashes (max 30).');
  const code = normCode(label);
  const family = ['mass', 'volume', 'pack'].includes(req.body?.family) ? req.body.family : 'pack';
  let factor;
  if (family !== 'pack') {
    factor = Number(req.body?.factor);
    if (!(factor > 0) || factor > 1e9) throw new ApiError(400, `Enter how many ${family === 'mass' ? 'grams' : 'millilitres'} one ${label} is.`);
  }
  const custom = await loadCustomUnits();
  if (unitMap(custom).has(code)) throw new ApiError(409, `The unit "${label}" already exists.`);
  const unit = { code, label, short: label.toLowerCase(), family, ...(factor ? { factor } : {}) };
  await Settings.updateOne({}, { $push: { customUnits: unit } }, { upsert: true });
  await recordAudit({ req, action: 'unit.create', entity: 'Settings', newValue: unit });
  res.status(201).json({ success: true, data: [...unitMap([...custom, unit]).values()].find((u) => u.code === code) });
});

// Validates / normalises the unit fields of a product body (only the fields that were sent).
async function applyUnits(body, before) {
  const keys = ['productType', 'sellingUnit', 'baseUnit', 'purchaseUnit', 'unitOptions', 'packUnit', 'packQuantity', 'packQuantityUnit'];
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
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  // The setup after this change, to check that the units fit together.
  const merged = { ...(before?.toObject?.() || {}), ...body };
  for (const k of keys) if (merged[k] === '') merged[k] = undefined;
  if (merged.packUnit && merged.packQuantity > 0) {
    const inner = units.get(merged.packQuantityUnit);
    if (!inner || !['mass', 'volume'].includes(inner.family)) throw new ApiError(400, 'Net content per pack must be a weight or volume unit (g, kg, ml, L...).');
  }
  const pack = merged.packUnit ? { packUnit: merged.packUnit, packQuantity: merged.packQuantity, packQuantityUnit: merged.packQuantityUnit } : {};
  const { sellingUnit, baseUnit } = productUnits(merged, units);
  if (!compatible(sellingUnit, baseUnit, units, pack)) {
    throw new ApiError(400, `Selling unit ${units.get(sellingUnit).short} and stock unit ${units.get(baseUnit).short} do not convert. Use the same kind of unit, or set the net content of the pack.`);
  }
  for (const t of merged.unitOptions || []) {
    const o = parseOption(t, units);
    if (o && !compatible(o.unit, sellingUnit, units, pack)) throw new ApiError(400, `Unit option "${t}" cannot be priced from the selling unit ${units.get(sellingUnit).short}.`);
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

const autoSku = () => `P${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;

export const createProduct = catchAsync(async (req, res) => {
  const body = { ...req.body, createdBy: req.user._id };
  // The Product Master only needs a name; SKU and GST are optional extras.
  body.name = await assertNameFree(body.name);
  if (!body.sku || !String(body.sku).trim()) body.sku = autoSku();
  await applyBarcode(body);
  await applyUnits(body);
  await applyCategoryName(body);
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
