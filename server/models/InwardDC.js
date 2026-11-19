import mongoose from 'mongoose';

const inwardItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    expectedQuantity: { type: Number, required: true, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number },
    batchNumber: { type: String },
    manufacturingDate: { type: Date },
    expiryDate: { type: Date },
    qualityCheckPassed: { type: Boolean, default: null },
    rejectReason: { type: String },
  },
  { _id: false }
);

const inwardDCSchema = new mongoose.Schema(
  {
    docNumber: { type: String, required: true, unique: true },
    distributionCenter: { type: mongoose.Schema.Types.ObjectId, ref: 'DistributionCenter' },
    sourceType: { type: String, enum: ['PurchaseInvoice', 'Purchase', 'StockTransfer'], default: 'PurchaseInvoice' },
    sourceReference: { type: mongoose.Schema.Types.ObjectId },
    purchaseInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseInvoice' },
    invoiceNumber: { type: String },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    poNumber: { type: String },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    items: [inwardItemSchema],
    status: {
      type: String,
      enum: ['draft', 'pending', 'received', 'partially_received', 'rejected', 'completed'],
      default: 'draft',
    },
    notes: { type: String },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Set atomically when the entry is submitted, so its stock can only ever be booked once.
    stockPosted: { type: Boolean, default: false },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

const InwardDC = mongoose.model('InwardDC', inwardDCSchema);
export default InwardDC;
