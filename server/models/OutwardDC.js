import mongoose from 'mongoose';

const outwardItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const outwardDCSchema = new mongoose.Schema(
  {
    docNumber: { type: String, required: true, unique: true },
    sourceDC: { type: mongoose.Schema.Types.ObjectId, ref: 'DistributionCenter', required: true },
    destinationType: { type: String, enum: ['Store', 'DistributionCenter'], required: true },
    destination: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'destinationType' },
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
  },
  { timestamps: true }
);

const OutwardDC = mongoose.model('OutwardDC', outwardDCSchema);
export default OutwardDC;
