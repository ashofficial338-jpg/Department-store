import mongoose from 'mongoose';

// Singleton settings document (findOne with no filter always returns this one doc).
const settingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: 'AURELIA Department Store' },
    logo: { type: String, default: '' },
    address: { type: String, default: '' },
    gstin: { type: String, default: '' },
    pan: { type: String, default: '' },
    currency: { type: String, default: 'INR' },
    currencySymbol: { type: String, default: '₹' },
    financialYearStartMonth: { type: Number, default: 4 }, // April
    invoicePrefix: { type: String, default: 'INV' },
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
