import mongoose from 'mongoose';

const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batchNumber: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    gstRate: { type: Number, default: 0 },
    manufacturingDate: Date,
    expiryDate: Date,
    taxableAmount: Number,
    taxAmount: Number,
    totalAmount: Number,
    invoicedQuantity: { type: Number, default: 0 }, // billed on Purchase Invoices against this PO
    receivedQuantity: { type: Number, default: 0 }, // accepted on submitted Inward DCs
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    poNumber: { type: String, required: true, unique: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    distributionCenter: { type: mongoose.Schema.Types.ObjectId, ref: 'DistributionCenter' },
    items: [purchaseItemSchema],
    subtotal: Number,
    taxAmount: Number,
    grandTotal: Number,
    amountPaid: { type: Number, default: 0 },
    // Value billed on Purchase Invoices (what is payable). No default on purpose: orders from before the
    // invoice flow have none and stay payable at their full value (see utils/payables.js).
    invoicedAmount: { type: Number },
    status: {
      type: String,
      // draft -> approved -> partially_invoiced -> invoiced. 'ordered' / 'partially_received' / 'received'
      // are kept for orders made before the Purchase Invoice flow ('ordered' counts as approved).
      enum: ['draft', 'approved', 'ordered', 'partially_invoiced', 'partially_received', 'received', 'invoiced', 'cancelled'],
      default: 'draft',
    },
    invoiceNumber: { type: String }, // vendor's invoice number
    orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

purchaseSchema.index({ vendor: 1 });
purchaseSchema.index({ createdAt: -1 });

const Purchase = mongoose.model('Purchase', purchaseSchema);
export default Purchase;
