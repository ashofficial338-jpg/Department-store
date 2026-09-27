import mongoose from 'mongoose';

// One document per (product, store) - aggregated stock position.
// Batch-level detail lives in the Batch collection; this is the fast-read summary.
const inventorySchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    distributionCenter: { type: mongoose.Schema.Types.ObjectId, ref: 'DistributionCenter' },
    currentStock: { type: Number, default: 0 },
    reservedStock: { type: Number, default: 0 },
    damagedStock: { type: Number, default: 0 },
    returnedStock: { type: Number, default: 0 },
    inTransitStock: { type: Number, default: 0 },
    openingStock: { type: Number, default: 0 },
  },
  { timestamps: true }
);

inventorySchema.index({ product: 1, store: 1 }, { unique: true, partialFilterExpression: { store: { $type: 'objectId' } } });
inventorySchema.index({ product: 1, distributionCenter: 1 });

inventorySchema.virtual('availableStock').get(function availableStock() {
  return Math.max(0, (this.currentStock || 0) - (this.reservedStock || 0));
});
inventorySchema.set('toJSON', { virtuals: true });

const Inventory = mongoose.model('Inventory', inventorySchema);
export default Inventory;
