import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: Number,
    refundAmount: Number,
    reason: { type: String },
    restockStatus: { type: String, enum: ['restocked', 'damaged'], default: 'restocked' },
  },
  { _id: false }
);

const salesReturnSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, required: true, unique: true },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    items: [returnItemSchema],
    refundMethod: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer', 'store_credit'], default: 'cash' },
    totalRefund: { type: Number, required: true },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const SalesReturn = mongoose.model('SalesReturn', salesReturnSchema);
export default SalesReturn;
