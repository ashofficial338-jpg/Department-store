import mongoose from 'mongoose';

// Double-entry style journal line: each business transaction posts a debit + credit pair.
const ledgerEntrySchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    entryType: { type: String, enum: ['debit', 'credit'], required: true },
    amount: { type: Number, required: true, min: 0 },
    narration: { type: String },
    referenceType: { type: String }, // 'Sale' | 'Purchase' | 'Payment' | 'Expense'
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    entryDate: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ledgerEntrySchema.index({ account: 1, entryDate: -1 });
ledgerEntrySchema.index({ referenceType: 1, referenceId: 1 });

const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
export default LedgerEntry;
