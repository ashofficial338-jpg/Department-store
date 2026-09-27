import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: Number,
    reason: String,
  },
  { _id: false }
);

const purchaseReturnSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, required: true, unique: true },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    items: [returnItemSchema],
    totalAmount: { type: Number, required: true },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const PurchaseReturn = mongoose.model('PurchaseReturn', purchaseReturnSchema);
export default PurchaseReturn;
