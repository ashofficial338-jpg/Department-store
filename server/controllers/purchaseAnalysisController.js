import mongoose from 'mongoose';
import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Inventory from '../models/Inventory.js';
import Batch from '../models/Batch.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import { requireId, literalRegex, oneOf } from '../utils/validate.js';
import { round2 } from '../utils/gstCalculator.js';
import { BILLED_EXPR } from '../utils/payables.js';
import { purchaseListFilter } from './purchaseController.js';
import { sendExport, EXPORT_FORMATS } from '../utils/exporters.js';

// Purchase Analysis: every figure is computed live from the purchase orders, batches and stock, so the
// reports always show what was entered on Purchase Orders, Invoices and Inward DCs - nothing is copied.
// Filters (all optional, all combine): from, to, vendor, product, brand, category, user, status,
// paymentStatus, minQty/maxQty, minRate/maxRate (rate per piece), minAmount/maxAmount (line amount),
// stock (in | low | out, on grouped views), search, sort, order.

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const DAY = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: 'Asia/Kolkata' } });

const PAYMENT_STATUS = {
  $let: {
    vars: { billed: BILLED_EXPR, paid: { $ifNull: ['$amountPaid', 0] } },
    in: {
      $switch: {
        branches: [
          { case: { $lte: ['$$billed', 0] }, then: 'not_billed' },
          { case: { $gte: ['$$paid', { $subtract: ['$$billed', 0.005] }] }, then: 'paid' },
          { case: { $gt: ['$$paid', 0] }, then: 'partial' },
        ],
        default: 'unpaid',
      },
    },
  },
};

// Order-level + line-level stages shared by every view; ends with one document per purchase line carrying
// ids and numbers only. Names are attached afterwards from small lookup maps (see `nameMaps`), which keeps
// the aggregation fast: no join per line.
async function linePipeline(q) {
  const docQuery = { ...q };
  ['minAmount', 'maxAmount', 'search', 'product', 'brand', 'category'].forEach((k) => delete docQuery[k]);
  const match = await purchaseListFilter(docQuery);
  if (!q.status) match.status = { $ne: 'cancelled' };

  const lineMatch = {};
  const and = [];
  if (q.product) lineMatch['items.product'] = oid(requireId(q.product, 'Product'));
  if (q.brand === 'none') lineMatch['items.brand'] = null;
  else if (q.brand) lineMatch['items.brand'] = oid(requireId(q.brand, 'Brand'));
  const range = (field, min, max) => {
    const a = num(min); const b = num(max);
    if (a === null && b === null) return;
    lineMatch[field] = {};
    if (a !== null) lineMatch[field].$gte = a;
    if (b !== null) lineMatch[field].$lte = b;
  };
  range('items.quantity', q.minQty, q.maxQty);
  range('items.unitPrice', q.minRate, q.maxRate);
  range('items.totalAmount', q.minAmount, q.maxAmount);

  if (q.category) {
    const ids = await Product.find({ category: oid(requireId(q.category, 'Category')) }).distinct('_id');
    and.push({ 'items.product': { $in: ids } });
    match['items.product'] = { $in: ids };
  }
  if (q.search) {
    const rx = literalRegex(q.search);
    const [pIds, vIds, bIds] = await Promise.all([
      Product.find({ name: rx }).distinct('_id'), Vendor.find({ name: rx }).distinct('_id'), Brand.find({ name: rx }).distinct('_id'),
    ]);
    // Order level (cheap pre-filter), then line level: the line's product / brand, the supplier or the PO number.
    match.$and = [...(match.$and || []), { $or: [{ poNumber: rx }, { vendor: { $in: vIds } }, { 'items.product': { $in: pIds } }, { 'items.brand': { $in: bIds } }] }];
    and.push({ $or: [{ poNumber: rx }, { vendor: { $in: vIds } }, { 'items.product': { $in: pIds } }, { 'items.brand': { $in: bIds } }] });
  }
  if (and.length) lineMatch.$and = and;

  return [
    { $match: match },
    { $unwind: { path: '$items', includeArrayIndex: 'lineNo' } },
    ...(Object.keys(lineMatch).length ? [{ $match: lineMatch }] : []),
    {
      $project: {
        _id: { $concat: [{ $toString: '$_id' }, '-', { $toString: '$lineNo' }] },
        purchaseId: '$_id', date: '$createdAt', day: DAY('$createdAt'), poNumber: 1, status: 1, paymentStatus: PAYMENT_STATUS,
        vendorId: '$vendor', productId: '$items.product', brandId: { $ifNull: ['$items.brand', null] }, userId: '$orderedBy',
        quantity: '$items.quantity', rate: '$items.unitPrice', unit: { $ifNull: ['$items.unit', null] },
        // Quantity in the product's stock unit (a line in kg / box converts with its baseFactor), so totals add up.
        baseQty: { $multiply: ['$items.quantity', { $ifNull: ['$items.baseFactor', 1] }] }, gstRate: { $ifNull: ['$items.gstRate', 0] },
        amount: { $ifNull: ['$items.taxableAmount', { $multiply: ['$items.quantity', '$items.unitPrice'] }] },
        tax: { $ifNull: ['$items.taxAmount', 0] },
        total: { $ifNull: ['$items.totalAmount', { $multiply: ['$items.quantity', '$items.unitPrice'] }] },
        invoicedQty: { $ifNull: ['$items.invoicedQuantity', 0] }, receivedQty: { $ifNull: ['$items.receivedQuantity', 0] },
      },
    },
  ];
}

// Name lookups for the ids found (products, brands, suppliers, users, categories).
async function nameMaps({ products = [], brands = [], vendors = [], users = [] }) {
  const ids = (xs) => [...new Set(xs.filter(Boolean).map(String))].map(oid);
  const [p, b, v, u] = await Promise.all([
    Product.find({ _id: { $in: ids(products) } }).select('name sku category reorderLevel unit sellingUnit baseUnit').lean(),
    Brand.find({ _id: { $in: ids(brands) } }).select('name').lean(),
    Vendor.find({ _id: { $in: ids(vendors) } }).select('name verificationStatus').lean(),
    User.find({ _id: { $in: ids(users) } }).select('name').lean(),
  ]);
  const c = await Category.find({ _id: { $in: ids(p.map((x) => x.category)) } }).select('name').lean();
  const m = (xs) => new Map(xs.map((x) => [String(x._id), x]));
  return { product: m(p), brand: m(b), vendor: m(v), user: m(u), category: m(c) };
}

function nameLine(r, maps) {
  const p = maps.product.get(String(r.productId));
  const v = maps.vendor.get(String(r.vendorId));
  return {
    ...r,
    productName: p?.name || '-', sku: p?.sku, unit: r.unit || p?.baseUnit || p?.sellingUnit || (p?.unit ? String(p.unit).toLowerCase() : null), reorderLevel: p?.reorderLevel, categoryId: p?.category || null,
    categoryName: (p?.category && maps.category.get(String(p.category))?.name) || 'Uncategorised',
    brandName: (r.brandId && maps.brand.get(String(r.brandId))?.name) || 'No brand',
    vendorName: v?.name || '-', vendorStatus: v?.verificationStatus,
    userName: maps.user.get(String(r.userId))?.name || '-',
    amount: round2(r.amount), total: round2(r.total), tax: round2(r.tax),
  };
}

const LINE_SORTS = { date: 'date', qty: 'quantity', quantity: 'quantity', rate: 'rate', amount: 'total', total: 'total', poNumber: 'poNumber' };
// Sorting by a name needs that one name in the pipeline (a single lookup, only when asked for).
const NAME_SORTS = {
  product: [{ $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: '_s' } }],
  brand: [{ $lookup: { from: 'brands', localField: 'brandId', foreignField: '_id', as: '_s' } }],
  vendor: [{ $lookup: { from: 'vendors', localField: 'vendorId', foreignField: '_id', as: '_s' } }],
  category: [
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: '_p' } },
    { $lookup: { from: 'categories', localField: '_p.category', foreignField: '_id', as: '_s' } },
  ],
};

export async function queryLines(q, { page = 1, limit = 50 } = {}) {
  const dir = q.order === 'asc' ? 1 : -1;
  const byName = NAME_SORTS[q.sort];
  const sortStages = byName
    ? [...byName, { $addFields: { _sortName: { $toLower: { $ifNull: [{ $first: '$_s.name' }, ''] } } } }, { $sort: { _sortName: dir, _id: dir } }, { $project: { _s: 0, _p: 0, _sortName: 0 } }]
    : [{ $sort: { [LINE_SORTS[q.sort] || 'date']: dir, _id: dir } }];
  const pipeline = await linePipeline(q);
  const [out] = await Purchase.aggregate([
    ...pipeline,
    {
      $facet: {
        rows: [...sortStages, { $skip: (page - 1) * limit }, { $limit: limit }],
        totals: [{ $group: { _id: null, lines: { $sum: 1 }, qty: { $sum: '$baseQty' }, amount: { $sum: '$amount' }, tax: { $sum: '$tax' }, total: { $sum: '$total' }, orders: { $addToSet: '$purchaseId' }, products: { $addToSet: '$productId' }, vendors: { $addToSet: '$vendorId' } } }],
      },
    },
  ]);
  const maps = await nameMaps({
    products: out.rows.map((r) => r.productId), brands: out.rows.map((r) => r.brandId),
    vendors: out.rows.map((r) => r.vendorId), users: out.rows.map((r) => r.userId),
  });
  const t = out.totals[0] || {};
  return {
    rows: out.rows.map((r) => nameLine(r, maps)),
    totals: {
      lines: t.lines || 0, qty: t.qty || 0, amount: round2(t.amount || 0), tax: round2(t.tax || 0), total: round2(t.total || 0),
      orders: t.orders?.length || 0, products: t.products?.length || 0, vendors: t.vendors?.length || 0,
      avgRate: t.qty ? round2((t.amount || 0) / t.qty) : 0,
    },
  };
}

export const GROUPS = {
  product: { label: 'Product-wise', key: { productId: '$productId' } },
  brand: { label: 'Brand-wise', key: { brandId: '$brandId' } },
  productBrand: { label: 'Product + Brand', key: { productId: '$productId', brandId: '$brandId' } },
  vendor: { label: 'Supplier-wise', key: { vendorId: '$vendorId' } },
  date: { label: 'Date-wise', key: { day: '$day' } },
  // Grouped by product in the database, then rolled up to the product's category (see below).
  category: { label: 'Category-wise', key: { productId: '$productId' } },
  user: { label: 'User-wise', key: { userId: '$userId' } },
};

// Merges product rows into one category row.
function rollUp(rows, keyOf) {
  const out = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    const a = out.get(k);
    if (!a) { out.set(k, { ...r, orders: [...r.orders], products: [...r.products], brands: [...r.brands], vendors: [...r.vendors] }); continue; }
    a.lines += r.lines; a.qty += r.qty; a.amount += r.amount; a.total += r.total; a.received += r.received;
    a.minRate = Math.min(a.minRate, r.minRate); a.maxRate = Math.max(a.maxRate, r.maxRate);
    if (+new Date(r.lastDate) > +new Date(a.lastDate)) { a.lastDate = r.lastDate; a.lastRate = r.lastRate; a.lastVendorId = r.lastVendorId; }
    if (+new Date(r.firstDate) < +new Date(a.firstDate)) a.firstDate = r.firstDate;
    const union = (x, y) => [...new Map([...x, ...y].map((v) => [String(v), v])).values()];
    a.orders = union(a.orders, r.orders); a.products = union(a.products, r.products); a.brands = union(a.brands, r.brands); a.vendors = union(a.vendors, r.vendors);
  }
  return [...out.values()];
}

async function queryGroups(q, groupBy) {
  const g = GROUPS[groupBy];
  if (!g) throw new ApiError(400, `Group by must be one of ${Object.keys(GROUPS).join(', ')}.`);
  const pipeline = await linePipeline(q);
  let groups = await Purchase.aggregate([
    ...pipeline,
    { $sort: { date: -1 } },
    {
      $group: {
        _id: g.key,
        lines: { $sum: 1 }, qty: { $sum: '$baseQty' }, amount: { $sum: '$amount' }, total: { $sum: '$total' },
        lastUnit: { $first: '$unit' },
        minRate: { $min: '$rate' }, maxRate: { $max: '$rate' }, lastRate: { $first: '$rate' },
        lastDate: { $first: '$date' }, firstDate: { $last: '$date' }, lastVendorId: { $first: '$vendorId' },
        orders: { $addToSet: '$purchaseId' }, products: { $addToSet: '$productId' }, brands: { $addToSet: '$brandId' }, vendors: { $addToSet: '$vendorId' },
        received: { $sum: '$receivedQty' },
      },
    },
  ]).allowDiskUse(true);

  const maps = await nameMaps({
    products: groups.flatMap((r) => r.products), brands: groups.flatMap((r) => r.brands),
    vendors: groups.flatMap((r) => [...r.vendors, r.lastVendorId]), users: groups.map((r) => r._id.userId),
  });
  if (groupBy === 'category') {
    groups = rollUp(groups, (r) => String(maps.product.get(String(r._id.productId))?.category || 'none'))
      .map((r) => ({ ...r, _id: { categoryId: maps.product.get(String(r._id.productId))?.category || null } }));
  }

  // Available stock: product level from central Inventory, brand level from the batches received per brand.
  const productIds = [...new Set(groups.flatMap((r) => r.products.map(String)))].map(oid);
  const [inv, batches] = await Promise.all([
    ['product', 'category'].includes(groupBy)
      ? Inventory.aggregate([{ $match: { product: { $in: productIds } } }, { $group: { _id: '$product', stock: { $sum: '$currentStock' } } }])
      : [],
    ['brand', 'productBrand'].includes(groupBy)
      ? Batch.aggregate([{ $match: { product: { $in: productIds }, availableQuantity: { $gt: 0 } } }, { $group: { _id: { p: '$product', b: '$brand' }, stock: { $sum: '$availableQuantity' } } }])
      : [],
  ]);
  const invMap = new Map(inv.map((i) => [String(i._id), i.stock]));
  const batchMap = new Map(batches.map((b) => [`${b._id.p}:${b._id.b || ''}`, b.stock]));
  const productName = (id) => maps.product.get(String(id))?.name || '-';
  const brandLabel = (id) => (id && maps.brand.get(String(id))?.name) || 'No brand';

  return groups.map((r) => {
    const id = r._id;
    let label; let stock = null;
    switch (groupBy) {
      case 'product': label = productName(id.productId); stock = invMap.get(String(id.productId)) || 0; break;
      case 'brand': label = brandLabel(id.brandId); stock = r.products.reduce((s, p) => s + (batchMap.get(`${p}:${id.brandId || ''}`) || 0), 0); break;
      case 'productBrand': label = `${productName(id.productId)} - ${brandLabel(id.brandId)}`; stock = batchMap.get(`${id.productId}:${id.brandId || ''}`) || 0; break;
      case 'vendor': label = maps.vendor.get(String(id.vendorId))?.name || '-'; break;
      case 'date': label = id.day; break;
      case 'category': label = (id.categoryId && maps.category.get(String(id.categoryId))?.name) || 'Uncategorised'; stock = r.products.reduce((s, p) => s + (invMap.get(String(p)) || 0), 0); break;
      default: label = maps.user.get(String(id.userId))?.name || '-';
    }
    const reorder = groupBy === 'product' ? (maps.product.get(String(id.productId))?.reorderLevel ?? 10) : null;
    const stockStatus = stock === null ? null : (stock <= 0 ? 'out' : (reorder !== null && stock <= reorder ? 'low' : 'in'));
    return {
      _id: Object.values(id).map((v) => String(v ?? 'none')).join(':'), ...Object.fromEntries(Object.entries(id).map(([k, v]) => [k, v ?? null])),
      label: label || '-',
      productName: id.productId ? productName(id.productId) : undefined, brandName: 'brandId' in id ? brandLabel(id.brandId) : undefined,
      lines: r.lines, orders: r.orders.length, productCount: r.products.length, brandCount: r.brands.filter(Boolean).length, vendorCount: r.vendors.length,
      qty: r.qty, received: r.received, amount: round2(r.amount), total: round2(r.total),
      avgRate: r.qty ? round2(r.amount / r.qty) : 0, minRate: r.minRate, maxRate: r.maxRate, lastRate: r.lastRate,
      lastUnit: r.lastUnit || null,
      unit: id.productId ? (maps.product.get(String(id.productId))?.baseUnit || maps.product.get(String(id.productId))?.sellingUnit || null) : null,
      lastDate: r.lastDate, firstDate: r.firstDate, lastVendor: maps.vendor.get(String(r.lastVendorId))?.name || '-', stock, stockStatus,
      ...(groupBy === 'vendor' ? { orderIds: r.orders } : {}),
    };
  });
}

const GROUP_SORTS = ['label', 'qty', 'total', 'amount', 'avgRate', 'lastRate', 'lastDate', 'stock', 'lines', 'orders'];

function sortAndFilterGroups(rows, q, groupBy) {
  let out = rows;
  if (q.stock) {
    const want = oneOf(q.stock, ['in', 'low', 'out'], 'Stock filter');
    out = out.filter((r) => r.stockStatus !== null && (want === 'in' ? r.stock > 0 : r.stockStatus === want));
  }
  const key = GROUP_SORTS.includes(q.sort) ? q.sort : (groupBy === 'date' ? 'label' : 'total');
  const dir = q.order === 'asc' ? 1 : -1;
  return [...out].sort((a, b) => {
    const x = a[key]; const y = b[key];
    if (typeof x === 'string' || typeof y === 'string') return String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true }) * dir;
    if (x instanceof Date || y instanceof Date) return ((x ? +new Date(x) : 0) - (y ? +new Date(y) : 0)) * dir;
    return ((x ?? -Infinity) - (y ?? -Infinity)) * dir;
  });
}

// Supplier-wise: what is billed, paid and still due on exactly the orders in each supplier's row.
async function addVendorBalances(rows) {
  const ids = [...new Set(rows.flatMap((r) => r.orderIds || []).map(String))].map(oid);
  const sums = ids.length
    ? await Purchase.aggregate([
      { $match: { _id: { $in: ids } } },
      { $group: { _id: '$vendor', billed: { $sum: BILLED_EXPR }, paid: { $sum: { $ifNull: ['$amountPaid', 0] } } } },
    ])
    : [];
  const map = new Map(sums.map((x) => [String(x._id), x]));
  return rows.map(({ orderIds, ...r }) => { // eslint-disable-line no-unused-vars
    const x = map.get(String(r.vendorId)) || {};
    return { ...r, billed: round2(x.billed || 0), paid: round2(x.paid || 0), balance: round2((x.billed || 0) - (x.paid || 0)) };
  });
}

function pageOf(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(q.limit, 10) || 50));
  return { page, limit };
}

export const lines = catchAsync(async (req, res) => {
  const { page, limit } = pageOf(req.query);
  const { rows, totals } = await queryLines(req.query, { page, limit });
  res.json({ success: true, data: rows, totals, pagination: { page, limit, total: totals.lines, totalPages: Math.max(1, Math.ceil(totals.lines / limit)) } });
});

export const summary = catchAsync(async (req, res) => {
  const groupBy = String(req.query.groupBy || 'product');
  let rows = sortAndFilterGroups(await queryGroups(req.query, groupBy), req.query, groupBy);
  if (groupBy === 'vendor') rows = await addVendorBalances(rows);
  const { page, limit } = pageOf(req.query);
  const totals = {
    groups: rows.length, qty: rows.reduce((s, r) => s + r.qty, 0), total: round2(rows.reduce((s, r) => s + r.total, 0)),
    amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
    stock: rows.some((r) => r.stock !== null) ? rows.reduce((s, r) => s + (r.stock || 0), 0) : null,
  };
  res.json({ success: true, data: rows.slice((page - 1) * limit, page * limit), totals, pagination: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) } });
});

// Brands a product has been bought under, with each brand's own rate, supplier and stock.
export const productBrands = catchAsync(async (req, res) => {
  const productId = requireId(req.params.productId, 'Product');
  const product = await Product.findById(productId).select('name brand brands').populate('brand', 'name').populate('brands', 'name status').lean();
  if (!product) throw new ApiError(404, 'Product not found.');
  const rows = await queryGroups({ product: productId }, 'productBrand');
  const byId = new Map(rows.map((r) => [String(r.brandId || ''), r]));
  const known = [product.brand, ...(product.brands || [])].filter(Boolean);
  for (const b of known) {
    if (!byId.has(String(b._id))) byId.set(String(b._id), { brandId: b._id, brandName: b.name, qty: 0, total: 0, stock: 0, lastRate: null, lastVendor: null, lastDate: null });
  }
  const data = [...byId.values()].map((r) => ({
    brandId: r.brandId, brandName: r.brandName, purchasedQty: r.qty, purchaseValue: r.total, stock: r.stock ?? 0,
    lastRate: r.lastRate, avgRate: r.avgRate ?? null, lastVendor: r.lastVendor, lastDate: r.lastDate, vendorCount: r.vendorCount ?? 0,
  })).sort((a, b) => String(a.brandName).localeCompare(String(b.brandName)));
  res.json({ success: true, data, product: { _id: product._id, name: product.name } });
});

export const options = catchAsync(async (req, res) => {
  const [vendors, products, brands, categories, userIds] = await Promise.all([
    Vendor.find().select('name verificationStatus status').sort({ name: 1 }).collation({ locale: 'en' }).lean(),
    Product.find({ status: { $ne: 'discontinued' } }).select('name').sort({ name: 1 }).collation({ locale: 'en' }).lean(),
    Brand.find().select('name status').sort({ name: 1 }).collation({ locale: 'en' }).lean(),
    Category.find().select('name status').sort({ name: 1 }).collation({ locale: 'en' }).lean(),
    Purchase.distinct('orderedBy'),
  ]);
  const users = await User.find({ _id: { $in: userIds } }).select('name').sort({ name: 1 }).lean();
  res.json({ success: true, data: { vendors, products, brands, categories, users } });
});

// ---------- export ----------
const LINE_COLUMNS = [
  { key: 'date', label: 'Date', type: 'date' }, { key: 'poNumber', label: 'PO #' }, { key: 'vendorName', label: 'Supplier', weight: 1.4 },
  { key: 'productName', label: 'Product', weight: 1.6 }, { key: 'brandName', label: 'Brand' }, { key: 'categoryName', label: 'Category' },
  { key: 'quantity', label: 'Qty', type: 'int' }, { key: 'rate', label: 'Rate / piece', type: 'currency' }, { key: 'amount', label: 'Amount', type: 'currency' },
  { key: 'gstRate', label: 'GST %', type: 'number' }, { key: 'total', label: 'Total', type: 'currency' }, { key: 'paymentStatus', label: 'Payment' },
  { key: 'status', label: 'Status' }, { key: 'userName', label: 'Entered by' },
];
const groupColumns = (groupBy) => {
  const head = { product: 'Product', brand: 'Brand', productBrand: 'Product - Brand', vendor: 'Supplier', date: 'Date', category: 'Category', user: 'User' }[groupBy];
  const cols = [
    { key: 'label', label: head, weight: 1.8 }, { key: 'orders', label: 'Orders', type: 'int' }, { key: 'qty', label: 'Qty purchased', type: 'int' },
    { key: 'total', label: 'Purchase value', type: 'currency' }, { key: 'avgRate', label: 'Avg rate', type: 'currency' },
    { key: 'minRate', label: 'Min rate', type: 'currency' }, { key: 'maxRate', label: 'Max rate', type: 'currency' }, { key: 'lastRate', label: 'Last rate', type: 'currency' },
  ];
  if (['product', 'brand', 'productBrand', 'category'].includes(groupBy)) cols.push({ key: 'stock', label: 'Available stock', type: 'int' });
  if (groupBy === 'vendor') cols.push({ key: 'billed', label: 'Billed', type: 'currency' }, { key: 'paid', label: 'Paid', type: 'currency' }, { key: 'balance', label: 'Balance', type: 'currency' });
  if (groupBy !== 'date') cols.push({ key: 'lastDate', label: 'Last purchase', type: 'date' });
  return cols;
};

async function filtersText(q) {
  const parts = [];
  if (q.from || q.to) parts.push(`Dates: ${q.from || '...'} to ${q.to || '...'}`);
  const name = async (Model, id, field = 'name') => (mongoose.isValidObjectId(id) ? (await Model.findById(id).select(field).lean())?.[field] : null);
  if (q.vendor) parts.push(`Supplier: ${await name(Vendor, q.vendor)}`);
  if (q.product) parts.push(`Product: ${await name(Product, q.product)}`);
  if (q.brand) parts.push(`Brand: ${q.brand === 'none' ? 'No brand' : await name(Brand, q.brand)}`);
  if (q.category) parts.push(`Category: ${await name(Category, q.category)}`);
  if (q.user) parts.push(`User: ${await name(User, q.user)}`);
  if (q.status) parts.push(`Status: ${q.status}`);
  if (q.paymentStatus) parts.push(`Payment: ${q.paymentStatus}`);
  if (q.minQty || q.maxQty) parts.push(`Qty: ${q.minQty || 0}-${q.maxQty || 'any'}`);
  if (q.minRate || q.maxRate) parts.push(`Rate: ${q.minRate || 0}-${q.maxRate || 'any'}`);
  if (q.minAmount || q.maxAmount) parts.push(`Amount: ${q.minAmount || 0}-${q.maxAmount || 'any'}`);
  if (q.stock) parts.push(`Stock: ${q.stock}`);
  if (q.search) parts.push(`Search: "${q.search}"`);
  return parts.length ? `Filters - ${parts.join(' | ')}` : 'Filters - none (all purchases except cancelled)';
}

export const exportReport = catchAsync(async (req, res) => {
  const format = String(req.query.format || 'xlsx');
  if (!EXPORT_FORMATS[format]) throw new ApiError(400, 'Format must be xlsx, pdf or csv.');
  const view = String(req.query.view || 'lines');
  let ds;
  if (view === 'lines' || view === 'rates') {
    const q = view === 'rates' ? { ...req.query, sort: 'date', order: 'asc' } : req.query;
    const { rows, totals } = await queryLines(q, { page: 1, limit: 10000 });
    ds = {
      title: view === 'rates' ? 'Purchase Rate History' : 'Purchase Register',
      columns: LINE_COLUMNS, rows,
      summary: [
        { label: 'Purchase lines', value: totals.lines, type: 'int' }, { label: 'Orders', value: totals.orders, type: 'int' },
        { label: 'Total quantity', value: totals.qty, type: 'int' }, { label: 'Amount (before GST)', value: totals.amount, type: 'currency' },
        { label: 'GST', value: totals.tax, type: 'currency' }, { label: 'Total purchase value', value: totals.total, type: 'currency' },
        { label: 'Average rate per piece', value: totals.avgRate, type: 'currency' },
      ],
    };
  } else {
    if (!GROUPS[view]) throw new ApiError(400, 'Unknown report view.');
    let rows = sortAndFilterGroups(await queryGroups(req.query, view), req.query, view);
    if (view === 'vendor') rows = await addVendorBalances(rows);
    const stock = rows.some((r) => r.stock !== null) ? rows.reduce((s, r) => s + (r.stock || 0), 0) : null;
    ds = {
      title: `${GROUPS[view].label} Purchase Report`, columns: groupColumns(view), rows,
      summary: [
        { label: 'Rows', value: rows.length, type: 'int' }, { label: 'Total quantity', value: rows.reduce((s, r) => s + r.qty, 0), type: 'int' },
        { label: 'Total purchase value', value: round2(rows.reduce((s, r) => s + r.total, 0)), type: 'currency' },
        ...(stock !== null ? [{ label: 'Available stock', value: stock, type: 'int' }] : []),
      ],
    };
  }
  ds.filtersText = await filtersText(req.query);
  await sendExport(res, format, ds, `purchase-${view}-${new Date().toISOString().slice(0, 10)}`);
});

export default { lines, summary, productBrands, options, exportReport };
