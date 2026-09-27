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
    receivedQuantity: { type: Number, default: 0 },
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
    status: {
      type: String,
      enum: ['draft', 'ordered', 'partially_received', 'received', 'invoiced', 'cancelled'],
      default: 'draft',
    },
    invoiceNumber: { type: String }, // vendor's invoice number
    orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
  },
  { timestamps: true }
);

purchaseSchema.index({ vendor: 1 });
purchaseSchema.index({ createdAt: -1 });

const Purchase = mongoose.model('Purchase', purchaseSchema);
export default Purchase;
