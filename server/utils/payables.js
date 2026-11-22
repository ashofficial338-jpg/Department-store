// What a Purchase Order owes the vendor (same rule as the Excel model: invoiced - returns - paid).
// Under the PO -> Purchase Invoice flow only the invoiced value is payable (`invoicedAmount`, kept up to date
// by purchase invoices). Orders created before that flow have no `invoicedAmount`, so their full order value
// counts, as it always did. Purchase Returns (debit notes) reduce it (`returnedAmount`).
export const PAYABLE_STATUSES = ['received', 'partially_invoiced', 'invoiced'];
export const BILLED_EXPR = { $subtract: [{ $ifNull: ['$invoicedAmount', '$grandTotal'] }, { $ifNull: ['$returnedAmount', 0] }] };
export const billedAmount = (po) => (po?.invoicedAmount ?? po?.grandTotal ?? 0) - (po?.returnedAmount || 0);
// Outstanding on one Purchase Invoice.
export const invoiceDue = (inv) => Math.round(((inv?.grandTotal || 0) - (inv?.returnedAmount || 0) - (inv?.amountPaid || 0)) * 100) / 100;
