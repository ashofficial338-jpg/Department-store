import mongoose from 'mongoose';

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    productName: String,
    sku: String,
    quantity: { type: Number, required: true, min: 1 },
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
    isInterState: { type: Boolean, default: false },
    status: { type: String, enum: ['held', 'completed', 'cancelled', 'returned', 'partially_returned'], default: 'completed' },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
  },
  { timestamps: true }
);

saleSchema.index({ customer: 1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ status: 1 });

const Sale = mongoose.model('Sale', saleSchema);
export default Sale;
