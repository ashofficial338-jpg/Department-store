import mongoose from 'mongoose';

// Immutable audit trail of every stock movement in the system.
const inventoryTransactionSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    quantity: { type: Number, required: true }, // positive = in, negative = out
    type: {
      type: String,
      required: true,
      enum: [
        'purchase_receipt', 'sale', 'sale_return', 'purchase_return',
        'stock_adjustment', 'stock_transfer_out', 'stock_transfer_in',
        'inward_dc', 'outward_dc', 'opening_stock', 'damage', 'expiry_writeoff',
      ],
    },
    source: { type: mongoose.Schema.Types.ObjectId, refPath: 'sourceModel' },
    sourceModel: { type: String, enum: ['Store', 'DistributionCenter'] },
    destination: { type: mongoose.Schema.Types.ObjectId, refPath: 'destinationModel' },
    destinationModel: { type: String, enum: ['Store', 'DistributionCenter'] },
    referenceType: { type: String }, // e.g. 'Sale', 'Purchase', 'StockTransfer'
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    referenceNumber: { type: String },
    notes: { type: String },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

inventoryTransactionSchema.index({ product: 1, createdAt: -1 });
inventoryTransactionSchema.index({ type: 1 });
inventoryTransactionSchema.index({ referenceType: 1, referenceId: 1 });

const InventoryTransaction = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
export default InventoryTransaction;
