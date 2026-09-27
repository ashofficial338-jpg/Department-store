import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    paymentTerms: { type: String, default: 'Net 30' },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 'text' });

const Supplier = mongoose.model('Supplier', supplierSchema);
export default Supplier;
