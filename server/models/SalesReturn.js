import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    lineIndex: Number, // which line of the bill (a product can be on a bill more than once)
    unit: String, // unit of the bill line (Billing screen: g, kg, pcs ...)
    stockQuantity: Number, // quantity put back into stock (in the product's stock unit)
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    quantity: { type: Number, required: true, min: 0.001 },
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
    dueAdjusted: { type: Number, default: 0 }, // part of the return set off against the bill's amount due
    refundPaid: { type: Number }, // part refunded (cash / UPI / card / bank / store credit)
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const SalesReturn = mongoose.model('SalesReturn', salesReturnSchema);
export default SalesReturn;
