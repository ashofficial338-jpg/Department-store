import Settings from '../models/Settings.js';
import ApiError from './ApiError.js';

// Mandatory / optional fields, configurable by administrators (Settings > Mandatory Fields).
// Rule of the store: only what a transaction cannot work without is mandatory ("essential", locked).
// Every other field is OPTIONAL by default; an administrator can make it mandatory.
// The same registry drives the forms (GET /settings/field-rules) and the API checks (requireFields).
export const FIELD_REGISTRY = {
  product: {
    label: 'Product Master',
    fields: [
      { key: 'name', label: 'Product name', essential: true },
      { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' }, { key: 'sku', label: 'SKU / item code' },
      { key: 'barcode', label: 'Barcode' }, { key: 'hsn', label: 'HSN code' }, { key: 'description', label: 'Description' },
      { key: 'sellingUnit', label: 'Selling unit' }, { key: 'purchasePrice', label: 'Purchase price' }, { key: 'sellingPrice', label: 'Selling price' },
      { key: 'mrp', label: 'MRP' }, { key: 'gstRate', label: 'GST %' }, { key: 'primaryVendor', label: 'Preferred supplier' },
    ],
  },
  vendor: {
    label: 'Supplier / Vendor',
    fields: [
      { key: 'name', label: 'Supplier name', essential: true },
      { key: 'phone', label: 'Mobile number' }, { key: 'contactPerson', label: 'Contact person' }, { key: 'email', label: 'Email' },
      { key: 'address', label: 'Address' }, { key: 'city', label: 'City' }, { key: 'pincode', label: 'PIN code' },
      { key: 'gstin', label: 'GSTIN' }, { key: 'pan', label: 'PAN' }, { key: 'bankAccount', label: 'Bank account number' }, { key: 'ifsc', label: 'IFSC' },
    ],
  },
  vendorVerification: {
    label: 'Supplier verification (needed before marking Verified)',
    fields: [
      { key: 'phone', label: 'Mobile number' }, { key: 'address', label: 'Address' }, { key: 'gstin', label: 'GSTIN' },
      { key: 'pan', label: 'PAN' }, { key: 'bank', label: 'Bank account & IFSC' }, { key: 'remarks', label: 'Remarks when rejecting / holding' },
    ],
  },
  customer: {
    label: 'Customer',
    fields: [
      { key: 'name', label: 'Customer name', essential: true },
      { key: 'phone', label: 'Mobile number', note: 'A credit / part-paid bill still needs a customer (name).' },
      { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'gstin', label: 'GSTIN' },
    ],
  },
  purchaseOrder: {
    label: 'Purchase Order',
    fields: [
      { key: 'vendor', label: 'Supplier', essential: true }, { key: 'product', label: 'Product', essential: true }, { key: 'quantity', label: 'Quantity', essential: true },
      { key: 'unitPrice', label: 'Rate per unit' }, { key: 'brand', label: 'Brand' }, { key: 'gstRate', label: 'GST %' }, { key: 'notes', label: 'Notes' },
    ],
  },
  purchaseInvoice: {
    label: 'Purchase Invoice',
    fields: [{ key: 'vendorInvoiceNumber', label: "Supplier's invoice number" }, { key: 'notes', label: 'Notes' }],
  },
  purchaseReturn: { label: 'Purchase Return', fields: [{ key: 'reason', label: 'Reason' }] },
  billing: {
    label: 'Billing / Sales',
    fields: [
      { key: 'product', label: 'Product', essential: true }, { key: 'quantity', label: 'Quantity', essential: true },
      { key: 'customer', label: 'Customer on every bill', note: 'Credit / part-paid bills always need a customer.' },
    ],
  },
  salesReturn: { label: 'Sales Return', fields: [{ key: 'reason', label: 'Reason' }] },
  expense: {
    label: 'Expense',
    fields: [{ key: 'amount', label: 'Amount', essential: true }, { key: 'description', label: 'Description' }],
  },
  stockAdjustment: { label: 'Stock Adjustment', fields: [{ key: 'reason', label: 'Reason' }] },
  editRequest: {
    label: 'Edit Requests',
    fields: [{ key: 'reason', label: 'Reason when asking for a change' }, { key: 'rejectRemarks', label: 'Remarks when rejecting' }],
  },
  brand: { label: 'Brand', fields: [{ key: 'name', label: 'Brand name', essential: true }, { key: 'description', label: 'Description' }] },
  category: { label: 'Category', fields: [{ key: 'name', label: 'Category name', essential: true }, { key: 'description', label: 'Description' }] },
};

// Effective rules: { entity: { field: true (mandatory) | false } } - essential always true, the rest from Settings (default false).
export function resolveRules(stored = {}) {
  const out = {};
  for (const [entity, def] of Object.entries(FIELD_REGISTRY)) {
    out[entity] = {};
    for (const f of def.fields) out[entity][f.key] = f.essential ? true : !!stored?.[entity]?.[f.key];
  }
  return out;
}

let cache = null;
let cachedAt = 0;
export function clearFieldRulesCache() { cache = null; }

export async function getFieldRules() {
  if (cache && Date.now() - cachedAt < 10000) return cache;
  const s = await Settings.findOne().select('fieldRules').lean();
  cache = resolveRules(s?.fieldRules || {});
  cachedAt = Date.now();
  return cache;
}

export async function isRequired(entity, field) {
  return !!(await getFieldRules())[entity]?.[field];
}

const blank = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

// Throws 400 for the first configured-mandatory (non-essential) field that is empty in `values`.
// `values` maps field key -> value. On edits pass `partial: true` to check only fields that are being changed.
export async function requireFields(entity, values, { partial = false } = {}) {
  const rules = (await getFieldRules())[entity] || {};
  const def = FIELD_REGISTRY[entity];
  for (const f of def?.fields || []) {
    if (f.essential || !rules[f.key]) continue;
    if (partial && !(f.key in values)) continue;
    if (blank(values[f.key])) throw new ApiError(400, `${f.label} is mandatory (set in Settings > Mandatory Fields).`, { field: f.key });
  }
}

export default { FIELD_REGISTRY, resolveRules, getFieldRules, isRequired, requireFields, clearFieldRulesCache };
