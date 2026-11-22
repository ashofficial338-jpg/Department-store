import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }, // optional: same product bought under different brands
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    quantity: { type: Number, required: true, min: 0.001 },
    // Unit of this line (e.g. kg, box) and how many stock (base) units one of it is - stock moves in base units.
    unit: { type: String, trim: true },
    baseUnit: { type: String, trim: true },
    baseFactor: { type: Number, default: 1 },
    decimal: { type: Boolean, default: false }, // quantity may have decimals (weight / volume / length)
    unitPrice: Number,
    reason: String,
    dispatchedQuantity: { type: Number, default: 0 }, // sent back on submitted Outward DCs
  },
  { _id: false }
);

const purchaseReturnSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, required: true, unique: true },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
    purchaseInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseInvoice' }, // original invoice
    invoiceNumber: { type: String },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    items: [returnItemSchema],
    totalAmount: { type: Number, required: true },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // A return never moves stock itself: it goes out on an Outward DC. Returns made before this flow have no
    // status (their stock was taken out when they were saved) and cannot get an Outward DC.
    status: { type: String, enum: ['pending_dispatch', 'partially_dispatched', 'dispatched'] },
  },
  { timestamps: true }
);

const PurchaseReturn = mongoose.model('PurchaseReturn', purchaseReturnSchema);
export default PurchaseReturn;
