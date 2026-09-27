import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    gstin: { type: String, trim: true },
    pan: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    paymentTerms: { type: String, default: 'Net 30' },
    creditLimit: { type: Number, default: 0 },
    bankDetails: {
      accountName: String,
      accountNumber: String,
      ifsc: String,
      bankName: String,
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

vendorSchema.index({ name: 'text', companyName: 'text', gstin: 'text' });

const Vendor = mongoose.model('Vendor', vendorSchema);
export default Vendor;
