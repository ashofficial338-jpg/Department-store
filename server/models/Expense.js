import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      // interest / income_tax / depreciation / amortization are below-the-line items added back for EBITDA.
      enum: ['rent', 'utilities', 'salaries', 'marketing', 'logistics', 'maintenance', 'supplies', 'other',
        'interest', 'income_tax', 'depreciation', 'amortization'],
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
