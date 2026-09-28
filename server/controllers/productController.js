import Product from '../models/Product.js';
import TaxRate from '../models/TaxRate.js';
import Inventory from '../models/Inventory.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { extractProductInfoFromImage } from '../services/aiImageService.js';

export const listProducts = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.search) {
    filter.$or = [
      { name: new RegExp(req.query.search, 'i') },
      { sku: new RegExp(req.query.search, 'i') },
      { barcode: new RegExp(req.query.search, 'i') },
    ];
  }
  if (req.query.category) filter.category = req.query.category;
  if (req.query.brand) filter.brand = req.query.brand;
  if (req.query.supplier) filter.primarySupplier = req.query.supplier;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.letter && req.query.letter !== 'ALL') {
    filter.name = new RegExp(`^${req.query.letter}`, 'i');
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
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  if (req.query.withStock === 'true') {
    const ids = docs.map((d) => d._id);
    const inv = await Inventory.aggregate([
      { $match: { product: { $in: ids } } },
      { $group: { _id: '$product', stock: { $sum: '$currentStock' } } },
    ]);
    const stockMap = new Map(inv.map((i) => [String(i._id), i.stock]));
    docs.forEach((d) => { d._doc.stock = stockMap.get(String(d._id)) || 0; });
  }

  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
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

export const createProduct = catchAsync(async (req, res) => {
  const body = { ...req.body, createdBy: req.user._id };

  if (body.taxRate) {
    const tax = await TaxRate.findById(body.taxRate);
    if (!tax) throw new ApiError(400, 'Selected GST rate was not found.');
    body.gstRate = tax.ratePercent;
  } else if (body.gstRate === undefined) {
    throw new ApiError(400, 'GST calculation requires a valid GST rate.');
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
    oldValue: { sellingPrice: before.sellingPrice, mrp: before.mrp, status: before.status },
    newValue: { sellingPrice: product.sellingPrice, mrp: product.mrp, status: product.status },
  });

  res.json({ success: true, data: product });
});

export const deleteProduct = catchAsync(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { status: 'discontinued' }, { new: true });
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
