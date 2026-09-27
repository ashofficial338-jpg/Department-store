import mongoose from 'mongoose';

// Standalone payment vouchers/receipts not tied to POS split-payments
// (e.g. vendor payments, customer receivable settlements, refunds, expenses).
const paymentSchema = new mongoose.Schema(
  {
    voucherNumber: { type: String, required: true, unique: true },
    direction: { type: String, enum: ['incoming', 'outgoing'], required: true },
    purpose: {
      type: String,
      enum: ['customer_receipt', 'vendor_payment', 'refund', 'expense', 'other'],
      required: true,
    },
    party: { type: mongoose.Schema.Types.ObjectId, refPath: 'partyModel' },
    partyModel: { type: String, enum: ['Customer', 'Vendor', 'Supplier'] },
    referenceType: { type: String }, // 'Sale' | 'Purchase' | 'SalesReturn' | 'Expense'
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    method: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer'], required: true },
    amount: { type: Number, required: true, min: 0 },
    transactionRef: { type: String },
    paymentDate: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
  },
  { timestamps: true }
);

paymentSchema.index({ direction: 1, paymentDate: -1 });
paymentSchema.index({ party: 1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
