import mongoose from 'mongoose';

const outwardItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }, // optional: same product bought under different brands
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    quantity: { type: Number, required: true, min: 0.001 }, // planned
    // Unit of this line (e.g. kg, box) and how many stock (base) units one of it is - stock moves in base units.
    unit: { type: String, trim: true },
    baseUnit: { type: String, trim: true },
    baseFactor: { type: Number, default: 1 },
    decimal: { type: Boolean, default: false }, // quantity may have decimals (weight / volume / length)
    dispatchedQuantity: { type: Number, min: 0 }, // actually dispatched (set on submit)
  },
  { _id: false }
);

const outwardDCSchema = new mongoose.Schema(
  {
    docNumber: { type: String, required: true, unique: true },
    sourceDC: { type: mongoose.Schema.Types.ObjectId, ref: 'DistributionCenter' },
    sourceType: { type: String, enum: ['PurchaseReturn', 'Manual'] },
    purchaseReturn: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseReturn' },
    returnNumber: { type: String },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    notes: { type: String },
    destinationType: { type: String, enum: ['Store', 'DistributionCenter'] },
    destination: { type: mongoose.Schema.Types.ObjectId, refPath: 'destinationType' },
    items: [outwardItemSchema],
    status: {
      type: String,
      enum: ['draft', 'approved', 'picking', 'packed', 'dispatched', 'received', 'cancelled'],
      default: 'draft',
    },
    transportDetails: {
      vehicleNumber: String,
      driverName: String,
      driverPhone: String,
    },
    responsibleEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dispatchedAt: { type: Date },
    receivedAt: { type: Date },
    // Set atomically when stock is taken out, so it can only ever be booked once.
    stockPosted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const OutwardDC = mongoose.model('OutwardDC', outwardDCSchema);
export default OutwardDC;
