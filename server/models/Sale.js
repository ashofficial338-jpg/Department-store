import mongoose from 'mongoose';

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }, // brand sold (stock taken from that brand's batches)
    brandName: String,
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    productName: String,
    sku: String,
    // POS bills: whole units (validated in the controller). Simple bills: quantity as entered in `unit`
    // in `unit` (g, kg, ml, l, pcs, packet...), unitPrice = rate per `rateUnit`.
    quantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, trim: true },
    quantityKg: Number,
    // Simple bills, saved with the bill so old bills never change when the product changes:
    // rateUnit = the unit unitPrice is per (kg, l, pcs, packet...); baseQty / baseUnit = what was taken from stock
    // (absent = no stock taken).
    rateUnit: { type: String, trim: true },
    baseQty: Number,
    baseUnit: { type: String, trim: true },
    unitPrice: { type: Number, required: true },
    discountPercent: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    grossAmount: Number,
    discountAmount: Number,
    taxableAmount: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    taxAmount: Number,
    totalAmount: Number,
  },
  { _id: false }
);

const paymentSplitSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer', 'credit'], required: true },
    amount: { type: Number, required: true, min: 0 },
    referenceId: { type: String }, // UPI txn id / card auth code
    cashReceived: Number,
    changeReturned: Number,
  },
  { _id: false }
);

const receiptSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer'], required: true },
    voucherNumber: String,
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    receivedAt: { type: Date, default: Date.now },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
  },
  { _id: true }
);

const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    items: [saleItemSchema],
    subtotal: Number,
    discount: Number,
    taxableAmount: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    taxAmount: Number,
    roundOff: Number,
    grandTotal: Number,
    amountPaid: { type: Number, default: 0 },
    payments: [paymentSplitSchema],
    // Credit / partial sales: creditAmount = left unpaid at billing; amountDue = still to be collected
    // (creditAmount - receipts - returns adjusted against it). Customer outstanding = sum of amountDue.
    creditAmount: { type: Number, default: 0 },
    amountDue: { type: Number, default: 0 },
    receipts: [receiptSchema],
    isInterState: { type: Boolean, default: false },
    status: { type: String, enum: ['held', 'completed', 'cancelled', 'returned', 'partially_returned'], default: 'completed' },
    // 'simple' = bill from the Billing screen: priced products take stock (baseQty), unpriced name-only lines (rate typed) do not.
    billType: { type: String, enum: ['pos', 'simple'], default: 'pos' },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
    // Idempotency key sent by the POS for each bill attempt, so a retried or double-submitted bill is created once.
    clientRequestId: { type: String, trim: true, maxlength: 100 },
  },
  { timestamps: true }
);

saleSchema.index({ clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } });
saleSchema.index({ customer: 1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ status: 1 });
saleSchema.index({ amountDue: 1 });
saleSchema.index({ 'items.product': 1 });

const Sale = mongoose.model('Sale', saleSchema);
export default Sale;
