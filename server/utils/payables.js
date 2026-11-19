// What a Purchase Order owes the vendor. Under the PO -> Purchase Invoice flow only the invoiced value is
// payable (`invoicedAmount`, kept up to date by purchase invoices). Orders created before that flow have no
// `invoicedAmount`, so their full order value counts, as it always did.
export const PAYABLE_STATUSES = ['received', 'partially_invoiced', 'invoiced'];
export const BILLED_EXPR = { $ifNull: ['$invoicedAmount', '$grandTotal'] };
export const billedAmount = (po) => (po?.invoicedAmount ?? po?.grandTotal ?? 0);
