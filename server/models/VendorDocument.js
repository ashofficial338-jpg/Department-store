import mongoose from 'mongoose';

// The file itself (GST certificate, PAN card, ...). Kept in the database rather than the public /uploads
// folder because these are sensitive KYC documents: they are only served through an authenticated API.
const vendorDocumentSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    docType: { type: String, required: true },
    fileName: String,
    mimeType: { type: String, required: true },
    size: Number,
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

const VendorDocument = mongoose.model('VendorDocument', vendorDocumentSchema);
export default VendorDocument;
