// Grocery unit engine (server). The client has the same rules in client/src/utils/units.js - keep them in sync.
//
// Families:
//   mass   - base gram:      mg = 0.001 g, g = 1 g, kg = 1000 g
//   volume - base millilitre: ml = 1 ml,  l = 1000 ml
//   each   - base piece:     pcs = nos = 1, pair = 2, half_dozen = 6, dozen = 12
//   length - base centimetre: mm = 0.1 cm, cm = 1, m = 100 cm
//   pack-type units (packet, box, bottle, ...) are each their own family: they never convert to anything,
//   except to mass / volume for a product whose net content per pack is configured (product.packUnit +
//   packQuantity + packQuantityUnit, e.g. 1 packet = 500 g) or that has a conversion rule in product.conversions
//   (e.g. 1 box = 24 pcs, 1 bundle = 10 pcs).
// Custom units (Settings.customUnits) are either a pack-type unit or a mass / volume unit with its size
// in g / ml (e.g. quintal = 100000 g).

export const BUILTIN_UNITS = [
  { code: 'mg', label: 'Milligram (mg)', short: 'mg', family: 'mass', factor: 0.001 },
  { code: 'g', label: 'Gram (g)', short: 'g', family: 'mass', factor: 1 },
  { code: 'kg', label: 'Kilogram (kg)', short: 'kg', family: 'mass', factor: 1000 },
  { code: 'ml', label: 'Millilitre (ml)', short: 'ml', family: 'volume', factor: 1 },
  { code: 'l', label: 'Litre (L)', short: 'L', family: 'volume', factor: 1000 },
  { code: 'mm', label: 'Millimetre (mm)', short: 'mm', family: 'length', factor: 0.1 },
  { code: 'cm', label: 'Centimetre (cm)', short: 'cm', family: 'length', factor: 1 },
  { code: 'm', label: 'Meter (m)', short: 'm', family: 'length', factor: 100 },
  { code: 'pcs', label: 'Piece (pcs)', short: 'pc', family: 'each', factor: 1 },
  { code: 'nos', label: 'Number (Nos)', short: 'nos', family: 'each', factor: 1 },
  { code: 'pair', label: 'Pair', short: 'pair', family: 'each', factor: 2 },
  { code: 'half_dozen', label: 'Half Dozen', short: 'half dozen', family: 'each', factor: 6 },
  { code: 'dozen', label: 'Dozen', short: 'dozen', family: 'each', factor: 12 },
  ...['packet', 'pack', 'pouch', 'sachet', 'box', 'carton', 'bundle', 'set', 'case', 'strip', 'tray', 'bottle', 'jar', 'tin',
    'can', 'bag', 'sack', 'bucket', 'tube', 'roll', 'cup']
    .map((code) => ({ code, label: code[0].toUpperCase() + code.slice(1), short: code, family: `pack:${code}`, factor: 1 })),
];

const ALIASES = {
  kgs: 'kg', kilogram: 'kg', kilo: 'kg', gm: 'g', gms: 'g', gram: 'g', grams: 'g', grm: 'g', milligram: 'mg',
  ltr: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l', lt: 'l', millilitre: 'ml', milliliter: 'ml', mls: 'ml',
  pc: 'pcs', piece: 'pcs', pieces: 'pcs', no: 'nos', number: 'nos', pkt: 'packet', packets: 'packet', halfdozen: 'half_dozen',
  'half dozen': 'half_dozen', 'half-dozen': 'half_dozen', doz: 'dozen', btl: 'bottle', ea: 'pcs', each: 'pcs', unit: 'pcs',
  meter: 'm', metre: 'm', meters: 'm', metres: 'm', mtr: 'm', mtrs: 'm', centimetre: 'cm', centimeter: 'cm', millimetre: 'mm', millimeter: 'mm', bdl: 'bundle', bx: 'box',
};

export const normCode = (v) => {
  const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return ALIASES[s] || s.replace(/[\s-]+/g, '_');
};

// Every unit available (built-in + custom), as a Map code -> unit.
export function unitMap(customUnits = []) {
  const map = new Map(BUILTIN_UNITS.map((u) => [u.code, u]));
  for (const c of customUnits || []) {
    if (!c?.code || map.has(c.code)) continue;
    const family = ['mass', 'volume', 'each', 'length'].includes(c.family) ? c.family : `pack:${c.code}`;
    map.set(c.code, { code: c.code, label: c.label || c.code, short: c.short || c.code, family, factor: family.startsWith('pack:') ? 1 : Number(c.factor) || 1, custom: true });
  }
  return map;
}

export const round = (v, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(v) + Number.EPSILON) * f) / f;
};

// Unit definition for a code, extended with a product's pack conversion (1 packUnit = packQuantity packQuantityUnit).
function resolve(code, units, product) {
  const u = units.get(code);
  if (!u) return null;
  const p = product || {};
  // Product conversion rules: 1 <unit> = <quantity> <ofUnit>, e.g. 1 box = 24 pcs, 1 bundle = 10 pcs, 1 packet = 500 g.
  const rule = (p.conversions || []).find((c) => c && c.unit === code && Number(c.quantity) > 0 && c.ofUnit && c.ofUnit !== code);
  if (rule) {
    const inner = units.get(rule.ofUnit);
    if (inner && !inner.family.startsWith('pack:')) return { ...u, family: inner.family, factor: Number(rule.quantity) * inner.factor };
  }
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

// Converts `qty` from unit `from` to unit `to` (multiplying before dividing keeps decimal results exact
// where possible, e.g. 250 g -> 0.25 kg). Throws when the units do not convert.
export function convert(qty, from, to, units, product) {
  const a = resolve(from, units, product);
  const b = resolve(to, units, product);
  if (!a || !b) throw new Error(`Unknown unit ${!a ? from : to}`);
  if (a.family !== b.family) throw new Error(`${a.short} cannot be converted to ${b.short}`);
  if (from === to) return Number(qty);
  return round((Number(qty) * a.factor) / b.factor, 6);
}

export const isCountFamily = (u) => !!u && (u.family === 'each' || u.family.startsWith('pack:'));
// Weight, volume and length can be split (decimals); pieces and packs are counted whole.
export const allowsDecimal = (u) => !!u && ['mass', 'volume', 'length'].includes(u.family);

// A product's own rate for a unit (unitPrices), e.g. 1 box sold at Rs 250 instead of 24 x Rs 11. kind: 'sellingPrice' | 'purchasePrice'.
export function unitRate(product, unit, kind = 'sellingPrice') {
  const r = (product?.unitPrices || []).find((x) => x && x.unit === unit && Number(x[kind]) > 0);
  return r ? Number(r[kind]) : null;
}

// The unit setup of a product with defaults for products saved before units existed:
// selling unit from the old `unit` field (PCS / KG / ...), base (stock) unit = selling unit.
export function productUnits(product, units) {
  const legacy = normCode(product?.unit);
  const sellingUnit = units.has(product?.sellingUnit) ? product.sellingUnit : units.has(legacy) ? legacy : 'pcs';
  const baseUnit = units.has(product?.baseUnit) ? product.baseUnit : sellingUnit;
  return { sellingUnit, baseUnit };
}

// "500 g", "1 kg", "kg", "packet", "1 L" -> { quantity, unit } (quantity null when only a unit is given).
export function parseOption(text, units) {
  const m = String(text ?? '').trim().match(/^(\d+(?:\.\d+)?)?\s*([a-zA-Z][a-zA-Z _-]*)$/);
  if (!m) return null;
  const code = normCode(m[2]);
  if (!units.has(code)) return null;
  const quantity = m[1] ? Number(m[1]) : null;
  if (quantity !== null && !(quantity > 0)) return null;
  return { quantity, unit: code };
}

export const formatOption = ({ quantity, unit }, units) => {
  const u = units.get(unit);
  return quantity ? `${quantity} ${u?.short === 'pc' ? 'pcs' : u?.short || unit}` : unit;
};
