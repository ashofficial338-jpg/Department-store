import mongoose from 'mongoose';

// Vendor bill raised against an approved Purchase Order. It records what is billed (and owed); it never
// moves stock - goods come in only when an Inward DC against this invoice is submitted.
const invoiceItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 }, // invoiced quantity
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
