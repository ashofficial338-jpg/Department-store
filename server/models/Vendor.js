import mongoose from 'mongoose';

// Vendor Management with verification. A vendor is registered as 'pending'; an administrator reviews the
// details and documents and marks it verified / rejected / on hold. Only VERIFIED vendors can be used for
// purchase orders, purchase invoices, inward DCs, purchase returns and vendor payments.
export const VERIFICATION_STATUSES = ['pending', 'verified', 'rejected', 'on_hold'];
export const DOC_TYPES = {
  gst_certificate: 'GST Certificate',
  pan_card: 'PAN Card',
  business_registration: 'Business Registration Certificate',
  bank_proof: 'Bank Proof (cancelled cheque / passbook)',
};
// Documents are optional (user decision 2026-11-20): a vendor can be verified on its details alone.
// List a type here to make it mandatory for verification again.
export const REQUIRED_DOCS = [];

const documentSchema = new mongoose.Schema(
  {
    docType: { type: String, enum: Object.keys(DOC_TYPES), required: true },
    file: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorDocument', required: true },
    fileName: String,
    mimeType: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const historySchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // registered, details_updated, document_uploaded, document_removed, status_changed
    fromStatus: String,
    toStatus: String,
    remarks: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    alternatePhone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    pan: { type: String, trim: true, uppercase: true },
    paymentTerms: { type: String, default: 'Net 30' },
    creditLimit: { type: Number, default: 0 },
    bankDetails: {
      accountName: String,
      accountNumber: String,
      ifsc: { type: String, uppercase: true },
      bankName: String,
      branch: String,
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'pending' },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastRemarks: String,
    documents: [documentSchema],
    verificationHistory: [historySchema],
  },
  { timestamps: true }
);

vendorSchema.index({ name: 'text', companyName: 'text', gstin: 'text' });
vendorSchema.index({ verificationStatus: 1, name: 1 });

const Vendor = mongoose.model('Vendor', vendorSchema);
export default Vendor;
