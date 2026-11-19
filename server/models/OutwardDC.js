import mongoose from 'mongoose';

const outwardItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    quantity: { type: Number, required: true, min: 1 }, // planned
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
