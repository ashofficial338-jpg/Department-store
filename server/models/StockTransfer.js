import mongoose from 'mongoose';

const transferItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const stockTransferSchema = new mongoose.Schema(
  {
    transferNumber: { type: String, required: true, unique: true },
    sourceType: { type: String, enum: ['Store', 'DistributionCenter'], required: true },
    source: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'sourceType' },
    destinationType: { type: String, enum: ['Store', 'DistributionCenter'], required: true },
    destination: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'destinationType' },
    items: [transferItemSchema],
    status: { type: String, enum: ['pending', 'in_transit', 'completed', 'cancelled'], default: 'pending' },
    notes: { type: String },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const StockTransfer = mongoose.model('StockTransfer', stockTransferSchema);
export default StockTransfer;
