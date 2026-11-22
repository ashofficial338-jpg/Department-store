// Document lines are identified by product + brand (the same product can be bought under several brands).
// Mirrors server/utils/lineMatch.js.
export const idOf = (v) => (v && typeof v === 'object' ? String(v._id || '') : v ? String(v) : '');
export const lineKey = (l) => `${idOf(l?.product)}:${idOf(l?.brand)}`;
export const brandName = (l) => (l?.brand && typeof l.brand === 'object' ? l.brand.name : '');
// The product + brand reference to send back to the server for a line.
export const lineRef = (l) => ({ product: idOf(l.product), brand: idOf(l.brand) || null });
// "Basmati Rice - India Gate" (brand only when there is one).
export const lineLabel = (l) => {
  const name = [l?.product?.name || '', brandName(l)].filter(Boolean).join(' - ');
  // Quantities on purchase documents are in the line's unit (e.g. box, kg): show it with the product.
  return l?.unit ? `${name} (qty in ${l.unit}${l.baseFactor && l.baseFactor !== 1 ? `; 1 ${l.unit} = ${l.baseFactor} ${l.baseUnit || ''}` : ''})` : name;
};

export const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Partly paid' },
  { value: 'paid', label: 'Paid' }, { value: 'not_billed', label: 'Not invoiced yet' },
];
