import mongoose from 'mongoose';

const inwardItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    expectedQuantity: { type: Number, required: true, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    qualityCheckPassed: { type: Boolean, default: null },
    rejectReason: { type: String },
  },
  { _id: false }
);

const inwardDCSchema = new mongoose.Schema(
  {
    docNumber: { type: String, required: true, unique: true },
    distributionCenter: { type: mongoose.Schema.Types.ObjectId, ref: 'DistributionCenter', required: true },
    sourceType: { type: String, enum: ['Purchase', 'StockTransfer'], default: 'Purchase' },
    sourceReference: { type: mongoose.Schema.Types.ObjectId },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    items: [inwardItemSchema],
    status: {
      type: String,
      enum: ['draft', 'pending', 'received', 'partially_received', 'rejected', 'completed'],
      default: 'draft',
    },
    notes: { type: String },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const InwardDC = mongoose.model('InwardDC', inwardDCSchema);
export default InwardDC;
