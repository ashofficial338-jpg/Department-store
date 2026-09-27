import mongoose from 'mongoose';

// Chart-of-accounts style ledger heads (Cash, Bank, Sales, COGS, etc.)
const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ['asset', 'liability', 'equity', 'income', 'expense'], required: true },
    accountGroup: { type: String, enum: ['cash', 'bank', 'receivable', 'payable', 'sales', 'purchase', 'expense', 'other'], default: 'other' },
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    bankDetails: {
      accountNumber: String,
      ifsc: String,
      bankName: String,
      branch: String,
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

const Account = mongoose.model('Account', accountSchema);
export default Account;
