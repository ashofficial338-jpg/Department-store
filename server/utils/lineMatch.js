import ApiError from './ApiError.js';

// Document lines (PO -> Purchase Invoice -> Inward DC, Purchase Return -> Outward DC) are identified by
// product + brand: the same product can be bought under several brands on one order. Lines without a brand
// (everything entered before brands were added) keep working: a request that names only the product matches
// the single line for it.

export const idOf = (v) => {
  if (!v) return '';
  if (typeof v === 'object' && v._id) return String(v._id);
  return String(v);
};

export const lineKey = (l) => `${idOf(l?.product)}:${idOf(l?.brand)}`;

const hasBrand = (it) => it && Object.prototype.hasOwnProperty.call(it, 'brand');

// True when request item `it` refers to document line `line`.
export function matchesLine(it, line) {
  if (idOf(it?.product) !== idOf(line?.product)) return false;
  return hasBrand(it) ? idOf(it.brand) === idOf(line.brand) : true;
}

// The document line a request item refers to. Throws when only the product was given but the document
// carries it under more than one brand.
export function findLine(lines, it) {
  const pid = idOf(it?.product);
  const same = (lines || []).filter((l) => idOf(l.product) === pid);
  if (hasBrand(it)) return same.find((l) => idOf(l.brand) === idOf(it.brand));
  if (same.length > 1) throw new ApiError(400, 'This product is on the document under more than one brand - send the brand for each line.');
  return same[0];
}

export default { idOf, lineKey, matchesLine, findLine };
