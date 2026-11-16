import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';
import Batch from '../models/Batch.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Store from '../models/Store.js';
import DistributionCenter from '../models/DistributionCenter.js';
import ApiError from '../utils/ApiError.js';
import { searchRegex, number } from '../utils/validate.js';
import { round2 } from '../utils/gstCalculator.js';

// Stock Reports (Inventory > Stock Reports): one dataset per stock type, filtered by category,
// brand, location and product status, shown on screen and exported as PDF / Excel.

// `qty` is the quantity the report is about; `match` narrows Inventory rows once the product is joined.
export const STOCK_TYPES = [
  { key: 'all', label: 'All Stock', description: 'Every stock record with all quantities' },
  { key: 'in_stock', label: 'In Stock', description: 'Current stock above zero', qty: 'currentStock', match: { currentStock: { $gt: 0 } } },
  { key: 'low_stock', label: 'Low Stock', description: 'In stock, but at or below the reorder level', qty: 'currentStock', match: { currentStock: { $gt: 0 }, $expr: { $lte: ['$currentStock', '$product.reorderLevel'] } } },
  { key: 'out_of_stock', label: 'Out of Stock', description: 'No current stock', qty: 'currentStock', match: { currentStock: { $lte: 0 } } },
  { key: 'overstock', label: 'Overstock', description: 'Current stock above the maximum stock level', qty: 'currentStock', match: { $expr: { $gt: ['$currentStock', '$product.maxStock'] } } },
  { key: 'reserved', label: 'Reserved Stock', description: 'Stock held for orders', qty: 'reservedStock', match: { reservedStock: { $gt: 0 } } },
  { key: 'damaged', label: 'Damaged Stock', description: 'Stock written down as damaged', qty: 'damagedStock', match: { damagedStock: { $gt: 0 } } },
  { key: 'returned', label: 'Returned Stock', description: 'Stock returned by customers', qty: 'returnedStock', match: { returnedStock: { $gt: 0 } } },
  { key: 'in_transit', label: 'In-Transit Stock', description: 'Stock moving between locations', qty: 'inTransitStock', match: { inTransitStock: { $gt: 0 } } },
  { key: 'expiring', label: 'Expiring Soon', description: 'Batches expiring within the chosen number of days', batch: true },
  { key: 'expired', label: 'Expired Stock', description: 'Batches past their expiry date with quantity remaining', batch: true },
];
export const PRODUCT_STATUSES = ['active', 'inactive', 'discontinued'];
const MAX_ROWS = 20000;

const COMMON = [
  { key: 'sku', label: 'SKU', type: 'text', weight: 1.3 },
  { key: 'product', label: 'Product', type: 'text', weight: 2.6 },
  { key: 'category', label: 'Category', type: 'text', weight: 1.5 },
  { key: 'brand', label: 'Brand', type: 'text', weight: 1.3 },
  { key: 'location', label: 'Location', type: 'text', weight: 1.6 },
];
const col = (key, label, type = 'int') => ({ key, label, type });
const VALUE = col('value', 'Stock Value', 'currency');
const TYPE_COLUMNS = {
  all: [col('currentStock', 'Current'), col('reservedStock', 'Reserved'), col('availableStock', 'Available'), col('damagedStock', 'Damaged'), col('returnedStock', 'Returned'), col('inTransitStock', 'In Transit'), VALUE, col('stockStatus', 'Status', 'text')],
  in_stock: [col('currentStock', 'Current'), col('reservedStock', 'Reserved'), col('availableStock', 'Available'), col('reorderLevel', 'Reorder Level'), VALUE, col('stockStatus', 'Status', 'text')],
  low_stock: [col('currentStock', 'Current'), col('reorderLevel', 'Reorder Level'), col('shortfall', 'Shortfall'), VALUE],
  out_of_stock: [col('currentStock', 'Current'), col('reorderLevel', 'Reorder Level'), col('shortfall', 'Shortfall')],
  overstock: [col('currentStock', 'Current'), col('maxStock', 'Max Stock'), col('excess', 'Excess'), VALUE],
  reserved: [col('currentStock', 'Current'), col('reservedStock', 'Reserved'), col('availableStock', 'Available'), VALUE],
  damaged: [col('damagedStock', 'Damaged'), col('currentStock', 'Current'), VALUE],
  returned: [col('returnedStock', 'Returned'), col('currentStock', 'Current'), VALUE],
  in_transit: [col('inTransitStock', 'In Transit'), col('currentStock', 'Current'), VALUE],
  batch: [col('batchNumber', 'Batch #', 'text'), col('expiryDate', 'Expiry Date', 'date'), col('daysLeft', 'Days Left'), col('quantity', 'Qty'), VALUE],
};

function objectId(value, label) {
  if (!value) return null;
  if (!mongoose.isValidObjectId(value)) throw new ApiError(400, `${label} is invalid.`);
  return new mongoose.Types.ObjectId(String(value));
}

export function parseStockReportQuery(query = {}) {
  const stockType = query.stockType || 'all';
  const type = STOCK_TYPES.find((t) => t.key === stockType);
  if (!type) throw new ApiError(400, `Stock type must be one of: ${STOCK_TYPES.map((t) => t.key).join(', ')}.`);
  if (query.status && !PRODUCT_STATUSES.includes(query.status)) throw new ApiError(400, `Product status must be one of: ${PRODUCT_STATUSES.join(', ')}.`);
  if (query.locationType && !['store', 'dc'].includes(query.locationType)) throw new ApiError(400, 'Location type must be store or dc.');
  return {
    type,
    category: objectId(query.category, 'Category'),
    subcategory: objectId(query.subcategory, 'Subcategory'),
    brand: objectId(query.brand, 'Brand'),
    store: objectId(query.store, 'Store'),
    distributionCenter: objectId(query.distributionCenter, 'Distribution center'),
    locationType: query.locationType || '',
    status: query.status || '',
    search: searchRegex(query.search),
    searchText: typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '',
    days: query.days ? number(query.days, 'Expiry window', { min: 1, max: 3650, integer: true }) : 60,
  };
}

// Location filter on the Inventory / Batch document itself (applied before the product join).
function locationMatch(f) {
  const m = {};
  if (f.store) m.store = f.store;
  if (f.distributionCenter) m.distributionCenter = f.distributionCenter;
  if (f.locationType === 'store') m.store = m.store || { $type: 'objectId' };
  if (f.locationType === 'dc') m.distributionCenter = m.distributionCenter || { $type: 'objectId' };
  return m;
}

// Product-level filters, applied after `product` is joined.
function productMatch(f) {
  const m = {};
  // A category filter matches products filed under it either as category or as subcategory.
  if (f.category) m.$or = [{ 'product.category': f.category }, { 'product.subcategory': f.category }];
  if (f.subcategory) m['product.subcategory'] = f.subcategory;
  if (f.brand) m['product.brand'] = f.brand;
  if (f.status) m['product.status'] = f.status;
  if (f.search) m.$and = [{ $or: [{ 'product.name': f.search }, { 'product.sku': f.search }, { 'product.barcode': f.search }] }];
  return m;
}

const one = (from, localField, as) => [
  { $lookup: { from, localField, foreignField: '_id', as } },
  { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
];
const JOINS = [
  ...one('categories', 'product.category', 'category'),
  ...one('brands', 'product.brand', 'brand'),
  ...one('stores', 'store', 'store'),
  ...one('distributioncenters', 'distributionCenter', 'dc'),
];

const base = (d) => ({
  id: String(d._id),
  productId: String(d.product._id),
  sku: d.product.sku,
  product: d.product.name,
  category: d.category?.name || 'Uncategorised',
  brand: d.brand?.name || '-',
  location: d.store?.name || d.dc?.name || '-',
});

function stockStatus(current, product) {
  if (current <= 0) return 'Out of Stock';
  if (current <= (product.reorderLevel ?? 0)) return 'Low Stock';
  if (current > (product.maxStock ?? Infinity)) return 'Overstock';
  return 'In Stock';
}

async function positionRows(f) {
  const { type } = f;
  // Quantity conditions that only read the Inventory document can run before the product join.
  const { $expr, ...plain } = type.match || {};
  const docs = await Inventory.aggregate([
    { $match: { ...locationMatch(f), ...plain } },
    { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { ...productMatch(f), ...($expr ? { $expr } : {}) } },
    ...JOINS,
    { $sort: { 'product.name': 1, _id: 1 } },
    { $limit: MAX_ROWS + 1 },
  ]);
  const qtyField = type.qty || 'currentStock';
  return docs.map((d) => {
    const current = d.currentStock || 0;
    const reorderLevel = d.product.reorderLevel ?? 0;
    const maxStock = d.product.maxStock ?? 0;
    return {
      ...base(d),
      currentStock: current,
      reservedStock: d.reservedStock || 0,
      availableStock: Math.max(0, current - (d.reservedStock || 0)),
      damagedStock: d.damagedStock || 0,
      returnedStock: d.returnedStock || 0,
      inTransitStock: d.inTransitStock || 0,
      reorderLevel,
      maxStock,
      shortfall: Math.max(0, reorderLevel - current),
      excess: Math.max(0, current - maxStock),
      stockStatus: stockStatus(current, d.product),
      qty: d[qtyField] || 0,
      value: round2((d[qtyField] || 0) * (d.product.purchasePrice || 0)),
    };
  });
}

async function batchRows(f) {
  const now = new Date();
  const expiryDate = f.type.key === 'expired'
    ? { $lt: now }
    : { $gte: now, $lte: new Date(now.getTime() + f.days * 86400000) };
  const docs = await Batch.aggregate([
    { $match: { ...locationMatch(f), expiryDate, availableQuantity: { $gt: 0 } } },
    { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: productMatch(f) },
    ...JOINS,
    { $sort: { expiryDate: 1, _id: 1 } },
    { $limit: MAX_ROWS + 1 },
  ]);
  return docs.map((d) => ({
    ...base(d),
    batchNumber: d.batchNumber,
    expiryDate: d.expiryDate,
    daysLeft: Math.ceil((new Date(d.expiryDate) - now) / 86400000),
    quantity: d.availableQuantity,
    qty: d.availableQuantity,
    value: round2(d.availableQuantity * (d.purchasePrice || 0)),
  }));
}

async function describeFilters(f) {
  const name = async (Model, id) => (id ? (await Model.findById(id).select('name').lean())?.name || 'Unknown' : null);
  const [category, subcategory, brand, store, dc] = await Promise.all([
    name(Category, f.category), name(Category, f.subcategory), name(Brand, f.brand), name(Store, f.store), name(DistributionCenter, f.distributionCenter),
  ]);
  const location = [store, dc].filter(Boolean).join(' / ') || (f.locationType === 'store' ? 'All stores' : f.locationType === 'dc' ? 'All distribution centers' : 'All locations');
  return [
    `Stock type: ${f.type.label}`,
    f.type.key === 'expiring' ? `Expiring within: ${f.days} days` : null,
    `Category: ${category || 'All'}`,
    subcategory ? `Subcategory: ${subcategory}` : null,
    `Brand: ${brand || 'All'}`,
    `Location: ${location}`,
    f.status ? `Product status: ${f.status}` : null,
    f.searchText ? `Search: "${f.searchText}"` : null,
  ].filter(Boolean).join('  |  ');
}

// Builds the full report: { title, columns, rows, summary, filtersText } (the shape utils/exporters.js renders).
export async function buildStockReport(query) {
  const f = parseStockReportQuery(query);
  let rows = await (f.type.batch ? batchRows(f) : positionRows(f));
  const truncated = rows.length > MAX_ROWS;
  if (truncated) rows = rows.slice(0, MAX_ROWS);

  const quantity = rows.reduce((t, r) => t + r.qty, 0);
  const value = round2(rows.reduce((t, r) => t + r.value, 0));
  const qtyLabel = f.type.batch ? 'Total quantity' : `Total ${f.type.qty && f.type.qty !== 'currentStock' ? f.type.label.toLowerCase() : 'current stock'}`;
  return {
    stockType: f.type.key,
    title: `Stock Report - ${f.type.label}`,
    columns: [...COMMON, ...(TYPE_COLUMNS[f.type.batch ? 'batch' : f.type.key])],
    rows,
    summary: [
      { key: 'records', label: f.type.batch ? 'Batches' : 'Stock records', value: rows.length, type: 'int' },
      { key: 'products', label: 'Products', value: new Set(rows.map((r) => r.productId)).size, type: 'int' },
      { key: 'quantity', label: qtyLabel, value: quantity, type: 'int' },
      { key: 'value', label: 'Stock value (at cost)', value, type: 'currency' },
    ],
    filtersText: await describeFilters(f),
    note: truncated ? `Only the first ${MAX_ROWS} records are included. Narrow the filters to see the rest.` : undefined,
  };
}

export async function stockReportOptions() {
  const [categories, brands, stores, distributionCenters] = await Promise.all([
    Category.find().select('name parent').sort({ name: 1 }).lean(),
    Brand.find().select('name').sort({ name: 1 }).lean(),
    Store.find().select('name code').sort({ name: 1 }).lean(),
    DistributionCenter.find().select('name code').sort({ name: 1 }).lean(),
  ]);
  return {
    stockTypes: STOCK_TYPES.map(({ key, label, description }) => ({ key, label, description })),
    productStatuses: PRODUCT_STATUSES,
    categories, brands, stores, distributionCenters,
  };
}

export default { STOCK_TYPES, buildStockReport, stockReportOptions, parseStockReportQuery };
