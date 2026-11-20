// Grocery units (browser side). Same rules as server/utils/units.js - keep them in sync; the server
// recalculates every bill, so this file only drives the screens.
// Unit objects come from GET /products/units: { code, label, short, family, factor } where family is
// 'mass' (factor in g), 'volume' (factor in ml), 'each' (factor in pieces) or 'pack:<code>' (never converts,
// except to weight / volume through a product's net content per pack).

const ALIASES = {
  kgs: 'kg', kilogram: 'kg', kilo: 'kg', gm: 'g', gms: 'g', gram: 'g', grams: 'g', grm: 'g', milligram: 'mg',
  ltr: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l', lt: 'l', millilitre: 'ml', milliliter: 'ml', mls: 'ml',
  pc: 'pcs', piece: 'pcs', pieces: 'pcs', no: 'nos', number: 'nos', pkt: 'packet', packets: 'packet', halfdozen: 'half_dozen',
  'half dozen': 'half_dozen', 'half-dozen': 'half_dozen', doz: 'dozen', btl: 'bottle', ea: 'pcs', each: 'pcs', unit: 'pcs',
};
export const normCode = (v) => {
  const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return ALIASES[s] || s.replace(/[\s-]+/g, '_');
};

export const round = (v, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(v) + Number.EPSILON) * f) / f;
};
export const round2 = (v) => round(v, 2);

export const toUnitMap = (list = []) => new Map(list.map((u) => [u.code, u]));

function resolve(code, units, product) {
  const u = units.get(code);
  if (!u) return null;
  const p = product || {};
  if (p.packUnit && code === p.packUnit && p.packQuantity > 0 && units.get(p.packQuantityUnit)) {
    const inner = units.get(p.packQuantityUnit);
    if (inner.family === 'mass' || inner.family === 'volume') return { ...u, family: inner.family, factor: p.packQuantity * inner.factor };
  }
  return u;
}

export function compatible(a, b, units, product) {
  const ua = resolve(a, units, product);
  const ub = resolve(b, units, product);
  return !!ua && !!ub && ua.family === ub.family;
}

export function convert(qty, from, to, units, product) {
  const a = resolve(from, units, product);
  const b = resolve(to, units, product);
  if (!a || !b || a.family !== b.family) return NaN;
  if (from === to) return Number(qty);
  return round((Number(qty) * a.factor) / b.factor, 6);
}

export const isMeasure = (u) => !!u && (u.family === 'mass' || u.family === 'volume');

// Selling / base unit with defaults for products saved before units existed (old `unit` field, else pcs).
export function productUnits(product, units) {
  const legacy = normCode(product?.unit);
  const sellingUnit = units.has(product?.sellingUnit) ? product.sellingUnit : units.has(legacy) ? legacy : 'pcs';
  const baseUnit = units.has(product?.baseUnit) ? product.baseUnit : sellingUnit;
  return { sellingUnit, baseUnit };
}

export function parseOption(text, units) {
  const m = String(text ?? '').trim().match(/^(\d+(?:\.\d+)?)?\s*([a-zA-Z][a-zA-Z _-]*)$/);
  if (!m) return null;
  const unit = normCode(m[2]);
  if (!units.has(unit)) return null;
  const quantity = m[1] ? Number(m[1]) : null;
  if (quantity !== null && !(quantity > 0)) return null;
  return { quantity, unit };
}

// Short unit name for a quantity: 1 pc / 6 pcs, 500 g, 1 L.
export function unitShort(code, units, qty) {
  const s = units.get(code)?.short || code;
  if (s === 'pc') return Number(qty) === 1 ? 'pc' : 'pcs';
  return s;
}
export const formatOption = ({ quantity, unit }, units) => (quantity ? `${quantity} ${unitShort(unit, units, 2)}` : unit);
export const fmtQty = (qty, unit, units) => `${Number(qty).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unitShort(unit, units, qty)}`;

// Units the cashier may choose for a priced product: its options, selling unit and the common units of the
// same kind (g / kg for weight, ml / L for volume, pcs / dozen for pieces) - only ones that convert.
export function billingUnits(product, units) {
  const { sellingUnit } = productUnits(product, units);
  const sell = resolve(sellingUnit, units, product);
  const list = [];
  const add = (c) => { if (units.has(c) && !list.includes(c) && compatible(c, sellingUnit, units, product)) list.push(c); };
  for (const t of product.unitOptions || []) { const o = parseOption(t, units); if (o) add(o.unit); }
  add(sellingUnit);
  if (sell?.family === 'mass') ['g', 'kg'].forEach(add);
  if (sell?.family === 'volume') ['ml', 'l'].forEach(add);
  if (sell?.family === 'each') ['pcs', 'dozen', 'half_dozen'].forEach(add);
  if (product.packUnit && product.packQuantity > 0) add(product.packUnit);
  return list;
}

// Quick sizes ("500 g", "1 kg") for a priced product - only those that convert to its selling unit.
export function quickSizes(product, units) {
  const { sellingUnit } = productUnits(product, units);
  return (product.unitOptions || []).map((t) => parseOption(t, units))
    .filter((o) => o?.quantity && compatible(o.unit, sellingUnit, units, product));
}

// Amounts of one priced line, rounded exactly like the server.
export function pricedLine({ quantity, unit }, product, units) {
  const { sellingUnit, baseUnit } = productUnits(product, units);
  const q = Number(quantity);
  if (!(q > 0)) return { gross: 0, discount: 0, taxable: 0, baseQty: 0, sellingUnit, baseUnit };
  const rateQty = convert(q, unit, sellingUnit, units, product);
  if (Number.isNaN(rateQty)) return { gross: 0, discount: 0, taxable: 0, baseQty: 0, sellingUnit, baseUnit, error: 'unit' };
  const gross = round2(rateQty * (Number(product.sellingPrice) || 0));
  const discount = round2((gross * (Number(product.discountPercent) || 0)) / 100);
  return { gross, discount, taxable: round2(gross - discount), baseQty: convert(q, unit, baseUnit, units, product), sellingUnit, baseUnit };
}

// Whole-number rule: pieces (1 dozen = 12 pcs is fine) and packs cannot be split.
export function wholeError({ quantity, unit }, units) {
  const u = units.get(unit);
  const q = Number(quantity);
  if (!u || !(q > 0)) return '';
  if (u.family === 'each' && !Number.isInteger(round(q * u.factor, 6))) return 'must be whole pieces';
  if (u.family.startsWith('pack:') && !Number.isInteger(q)) return `must be a whole number of ${u.short}s`;
  return '';
}

// ---------- Suggested units by category / product name ----------
export const GROCERY_CATEGORIES = [
  { name: 'Rice & Grains', default: ['kg', '500 g', '1 kg'], items: {
    rice: ['kg', '500 g', '1 kg', '5 kg', '10 kg', '25 kg'], wheat: ['kg', '500 g', '1 kg'], rava: ['kg', '500 g', '1 kg'],
    maida: ['kg', '500 g', '1 kg'], atta: ['kg', '1 kg', '5 kg', '10 kg'] } },
  { name: 'Pulses & Dals', default: ['kg', '500 g'], items: {
    'toor dal': ['kg', '500 g'], 'urad dal': ['kg', '500 g'], 'moong dal': ['kg', '500 g'], 'chana dal': ['kg', '500 g'], 'green gram': ['kg', '500 g'], dal: ['kg', '500 g'] } },
  { name: 'Spices & Masala', default: ['g', '100 g', '200 g', '500 g'], items: {
    turmeric: ['g', '100 g', '200 g', '500 g'], chilli: ['g', '100 g', '200 g', '500 g'], chili: ['g', '100 g', '200 g', '500 g'],
    pepper: ['g', '50 g', '100 g'], cumin: ['g', '100 g', '250 g'], jeera: ['g', '100 g', '250 g'], coriander: ['g', '100 g', '200 g'],
    'garam masala': ['g', 'packet', 'sachet'], masala: ['g', 'packet', 'sachet'] } },
  { name: 'Vegetables', default: ['kg', '500 g'], items: {
    onion: ['kg', '500 g'], tomato: ['kg', '500 g'], potato: ['kg', '500 g'], carrot: ['kg', '500 g'], 'green chilli': ['kg', '250 g'],
    ginger: ['kg', '100 g'], garlic: ['kg', '250 g'] } },
  { name: 'Fruits', default: ['kg', '500 g', 'pcs'], items: {
    apple: ['kg', '500 g', 'pcs'], banana: ['pcs', 'dozen'], orange: ['kg', 'pcs'], grapes: ['kg', '500 g'], mango: ['kg', 'pcs'], lemon: ['pcs', 'dozen'] } },
  { name: 'Cooking Oils', default: ['ml', '500 ml', '1 L'], items: {
    sunflower: ['ml', '500 ml', '1 L', '5 L'], groundnut: ['ml', '500 ml', '1 L'], coconut: ['ml', '100 ml', '500 ml', '1 L'], oil: ['ml', '500 ml', '1 L'] } },
  { name: 'Dairy Products', default: ['g', 'pack'], items: {
    milk: ['ml', '500 ml', '1 L', 'pouch'], curd: ['g', '100 g', '500 g', '1 kg', 'cup'], butter: ['g', '100 g', '500 g', 'pack'], cheese: ['g', '100 g', '200 g', 'pack'] } },
  { name: 'Snacks & Biscuits', default: ['packet', 'pcs'], items: {
    biscuit: ['packet', 'pack', 'box'], chips: ['packet', 'pouch'], chocolate: ['pcs', 'box'], mixture: ['g', '100 g', '200 g', 'packet'],
    nuts: ['g', '100 g', '250 g', '500 g'], cashew: ['g', '100 g', '250 g', '500 g'], almond: ['g', '100 g', '250 g', '500 g'] } },
  { name: 'Household & Cleaning', default: ['pcs', 'pack'], items: {
    soap: ['pcs', 'pack'], shampoo: ['ml', 'sachet', 'bottle'], detergent: ['g', '500 g', '1 kg', 'packet'], dishwash: ['ml', 'bottle'],
    'floor cleaner': ['ml', '500 ml', '1 L'], toothpaste: ['g', 'tube'] } },
];

const LOOSE_GROUPS = ['Rice & Grains', 'Pulses & Dals', 'Spices & Masala', 'Vegetables', 'Fruits'];

// Suggested setup for a product from its name and category. Everything stays editable.
// Returns null when nothing matches. Pack-type options that need a net content (milk "pouch") are returned
// with `needsNet` so the form can ask for it.
export function suggestUnits(name, categoryName, units) {
  const n = ` ${String(name || '').toLowerCase().replace(/[^a-z ]+/g, ' ')} `;
  const groups = [...GROCERY_CATEGORIES].sort((a, b) => (b.name === categoryName) - (a.name === categoryName));
  let options = null; let group = null;
  for (const g of groups) {
    const key = Object.keys(g.items).sort((a, b) => b.length - a.length).find((k) => n.includes(` ${k}`));
    if (key) { options = g.items[key]; group = g; break; }
  }
  if (!options) {
    group = GROCERY_CATEGORIES.find((g) => g.name === categoryName);
    if (!group) return null;
    options = group.default;
  }
  const parsed = options.map((t) => parseOption(t, units)).filter(Boolean);
  const measures = parsed.filter((o) => isMeasure(units.get(o.unit)));
  let sellingUnit;
  if (measures.length) sellingUnit = units.get(measures[0].unit).family === 'mass' ? 'kg' : 'l';
  else sellingUnit = parsed.find((o) => o.unit === 'pcs')?.unit || parsed[0]?.unit || 'pcs';
  const loose = LOOSE_GROUPS.includes(group.name) && isMeasure(units.get(sellingUnit));
  // A pack option next to weights / volumes (milk pouch, butter pack) is a pack with a net content.
  const packOpt = measures.length ? parsed.find((o) => !o.quantity && units.get(o.unit)?.family.startsWith('pack:')) : null;
  return {
    category: group.name,
    productType: loose || (sellingUnit === 'pcs' && group.name === 'Fruits') ? 'loose' : 'packed',
    sellingUnit,
    baseUnit: sellingUnit,
    packUnit: packOpt?.unit || '',
    unitOptions: parsed.map((o) => formatOption(o, units)),
  };
}
