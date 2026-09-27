// Central GST calculation logic. GST rate always comes from the caller
// (product/taxRate record in the DB) - never hard-coded here.

/**
 * Calculate GST breakup for a line item.
 * @param {Object} p
 * @param {number} p.quantity
 * @param {number} p.unitPrice - price per unit BEFORE line discount, exclusive of GST unless priceIsInclusive
 * @param {number} p.discountPercent - line-level discount percent (0-100)
 * @param {number} p.gstRate - GST percent, e.g. 18
 * @param {boolean} p.priceIsInclusive - whether unitPrice already includes GST
 * @param {boolean} p.isInterState - true => IGST, false => CGST+SGST split
 */
export function calculateLineGst({
  quantity = 0,
  unitPrice = 0,
  discountPercent = 0,
  gstRate = 0,
  priceIsInclusive = false,
  isInterState = false,
}) {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const disc = Number(discountPercent) || 0;
  const rate = Number(gstRate) || 0;

  const grossAmount = qty * price;
  const discountAmount = round2((grossAmount * disc) / 100);
  const netAmount = grossAmount - discountAmount; // may be inclusive or exclusive of GST

  let taxableAmount;
  let taxAmount;
  let totalAmount;

  if (priceIsInclusive) {
    taxableAmount = round2(netAmount / (1 + rate / 100));
    taxAmount = round2(netAmount - taxableAmount);
    totalAmount = round2(netAmount);
  } else {
    taxableAmount = round2(netAmount);
    taxAmount = round2((taxableAmount * rate) / 100);
    totalAmount = round2(taxableAmount + taxAmount);
  }

  let cgst = 0, sgst = 0, igst = 0;
  if (isInterState) {
    igst = taxAmount;
  } else {
    cgst = round2(taxAmount / 2);
    sgst = round2(taxAmount - cgst);
  }

  return {
    grossAmount: round2(grossAmount),
    discountAmount,
    taxableAmount,
    gstRate: rate,
    cgst,
    sgst,
    igst,
    taxAmount,
    totalAmount,
  };
}

/**
 * Sum an array of line results (as returned by calculateLineGst) into an invoice total,
 * applying an optional round-off to the nearest rupee.
 */
export function summarizeInvoice(lines, { applyRoundOff = true } = {}) {
  const totals = lines.reduce(
    (acc, l) => ({
      subtotal: acc.subtotal + l.grossAmount,
      discount: acc.discount + l.discountAmount,
      taxableAmount: acc.taxableAmount + l.taxableAmount,
      cgst: acc.cgst + l.cgst,
      sgst: acc.sgst + l.sgst,
      igst: acc.igst + l.igst,
      taxAmount: acc.taxAmount + l.taxAmount,
      grandTotalBeforeRound: acc.grandTotalBeforeRound + l.totalAmount,
    }),
    { subtotal: 0, discount: 0, taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, taxAmount: 0, grandTotalBeforeRound: 0 }
  );

  const roundedTotal = applyRoundOff ? Math.round(totals.grandTotalBeforeRound) : round2(totals.grandTotalBeforeRound);
  const roundOff = round2(roundedTotal - totals.grandTotalBeforeRound);

  return {
    subtotal: round2(totals.subtotal),
    discount: round2(totals.discount),
    taxableAmount: round2(totals.taxableAmount),
    cgst: round2(totals.cgst),
    sgst: round2(totals.sgst),
    igst: round2(totals.igst),
    taxAmount: round2(totals.taxAmount),
    roundOff,
    grandTotal: round2(roundedTotal),
  };
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export default { calculateLineGst, summarizeInvoice, round2 };
