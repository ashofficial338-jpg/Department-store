import mongoose from 'mongoose';

// Singleton settings document (findOne with no filter always returns this one doc).
const settingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: 'ARKA MART' },
    logo: { type: String, default: '' },
    address: { type: String, default: '' },
    gstin: { type: String, default: '' },
    pan: { type: String, default: '' },
    currency: { type: String, default: 'INR' },
    currencySymbol: { type: String, default: '₹' },
    financialYearStartMonth: { type: Number, default: 4 }, // April
    invoicePrefix: { type: String, default: 'INV' },
    // Billing GST type (Products > Pricing & GST): 'intra' = CGST + SGST (half each), 'inter' = IGST.
    gstType: { type: String, enum: ['intra', 'inter'], default: 'intra' },
    // Units added by the admin in Product Master (see utils/units.js). family: mass / volume (factor = size in g / ml) or pack.
    customUnits: [{
      _id: false,
      code: { type: String, trim: true, lowercase: true },
      label: { type: String, trim: true },
      short: { type: String, trim: true },
      family: { type: String, enum: ['mass', 'volume', 'pack'], default: 'pack' },
      factor: { type: Number, min: 0 },
    }],
    lowStockThresholdDefault: { type: Number, default: 10 },
    paymentMethods: {
      type: [String],
      default: ['cash', 'upi', 'card', 'bank_transfer', 'credit'],
    },
    notificationSettings: {
      lowStock: { type: Boolean, default: true },
      expiry: { type: Boolean, default: true },
      pendingApprovals: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;
