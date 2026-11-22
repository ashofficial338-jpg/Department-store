import mongoose from 'mongoose';

// Vendor bill raised against an approved Purchase Order. It records what is billed (and owed); it never
// moves stock - goods come in only when an Inward DC against this invoice is submitted.
const invoiceItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }, // optional: same product bought under different brands
    quantity: { type: Number, required: true, min: 0.001 }, // invoiced quantity
    // Unit of this line (e.g. kg, box) and how many stock (base) units one of it is - stock moves in base units.
    unit: { type: String, trim: true },
    baseUnit: { type: String, trim: true },
    baseFactor: { type: Number, default: 1 },
    decimal: { type: Boolean, default: false }, // quantity may have decimals (weight / volume / length)
    unitPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 0 },
    taxableAmount: Number,
    taxAmount: Number,
    totalAmount: Number,
    batchNumber: String,
    manufacturingDate: Date,
    expiryDate: Date,
    receivedQuantity: { type: Number, default: 0 }, // accepted on submitted Inward DCs
    returnedQuantity: { type: Number, default: 0 }, // on Purchase Returns against this invoice
  },
  { _id: false }
);

const invoicePaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer'], required: true },
    voucherNumber: String,
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    paidAt: { type: Date, default: Date.now },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    atEntry: { type: Boolean, default: false }, // paid when the invoice was entered (cash purchase)
  },
  { _id: true }
);

const purchaseInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true }, // system number, PINV/..
    vendorInvoiceNumber: { type: String, trim: true }, // the vendor's own bill number
    invoiceDate: { type: Date, default: Date.now },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
    poNumber: { type: String },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    items: [invoiceItemSchema],
    subtotal: Number,
    taxAmount: Number,
    grandTotal: Number,
    // Supplier outstanding on this bill = grandTotal - returnedAmount - amountPaid (same as the Excel model).
    amountPaid: { type: Number, default: 0 },
    returnedAmount: { type: Number, default: 0 },
    payments: [invoicePaymentSchema],
    allowOverInvoice: { type: Boolean, default: false }, // explicitly permitted to bill beyond the ordered quantity
    status: {
      type: String,
      enum: ['pending_receipt', 'partially_received', 'received', 'cancelled'],
      default: 'pending_receipt',
    },
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseInvoiceSchema.index({ purchase: 1 });
purchaseInvoiceSchema.index({ vendor: 1, createdAt: -1 });
purchaseInvoiceSchema.index({ vendor: 1, vendorInvoiceNumber: 1 });

const PurchaseInvoice = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);
export default PurchaseInvoice;
