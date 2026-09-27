import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: ['rent', 'utilities', 'salaries', 'marketing', 'logistics', 'maintenance', 'supplies', 'other'],
    },
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer'], default: 'cash' },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    expenseDate: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ category: 1 });

const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
