import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema(
  {
    batchNumber: { type: String, required: true, trim: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    purchaseInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    manufacturingDate: { type: Date },
    expiryDate: { type: Date },
    purchasePrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0 }, // originally received
    availableQuantity: { type: Number, required: true, min: 0 }, // current
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    distributionCenter: { type: mongoose.Schema.Types.ObjectId, ref: 'DistributionCenter' },
    status: { type: String, enum: ['active', 'expired', 'exhausted', 'blocked'], default: 'active' },
  },
  { timestamps: true }
);

batchSchema.index({ batchNumber: 1 });
batchSchema.index({ product: 1 });
batchSchema.index({ expiryDate: 1 });
batchSchema.index({ product: 1, store: 1, status: 1 });

const Batch = mongoose.model('Batch', batchSchema);
export default Batch;
