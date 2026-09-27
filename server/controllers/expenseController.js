import Expense from '../models/Expense.js';
import ApiError from '../utils/ApiError.js';
import recordAudit from '../utils/audit.js';
import catchAsync from '../utils/catchAsync.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { postLedgerPair, methodToAccountKey } from '../utils/ledger.js';

export const listExpenses = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.from || req.query.to) {
    filter.expenseDate = {};
    if (req.query.from) filter.expenseDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.expenseDate.$lte = new Date(req.query.to);
  }
  const [docs, total] = await Promise.all([
    Expense.find(filter).sort({ expenseDate: -1 }).skip(skip).limit(limit),
    Expense.countDocuments(filter),
  ]);
  const totalAmount = await Expense.aggregate([{ $match: filter }, { $group: { _id: null, sum: { $sum: '$amount' } } }]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }), totalAmount: totalAmount[0]?.sum || 0 });
});

export const createExpense = catchAsync(async (req, res) => {
  const expense = await Expense.create({ ...req.body, recordedBy: req.user._id });
  await postLedgerPair({
    debitKey: 'expenses', creditKey: methodToAccountKey(expense.paymentMethod), amount: expense.amount,
    narration: expense.description, referenceType: 'Expense', referenceId: expense._id, userId: req.user._id,
  });
  res.status(201).json({ success: true, data: expense });
});

// Reverses an expense's ledger posting (used before editing or deleting it).
async function reverseExpenseLedger(expense, userId, narration) {
  await postLedgerPair({
    debitKey: methodToAccountKey(expense.paymentMethod), creditKey: 'expenses', amount: expense.amount,
    narration, referenceType: 'Expense', referenceId: expense._id, userId,
  });
}

export const updateExpense = catchAsync(async (req, res) => {
  const before = await Expense.findById(req.params.id);
  if (!before) throw new ApiError(404, 'Expense not found.');
  const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (before.amount !== expense.amount || before.paymentMethod !== expense.paymentMethod) {
    await reverseExpenseLedger(before, req.user._id, `Edit reversal: ${before.description}`);
    await postLedgerPair({
      debitKey: 'expenses', creditKey: methodToAccountKey(expense.paymentMethod), amount: expense.amount,
      narration: expense.description, referenceType: 'Expense', referenceId: expense._id, userId: req.user._id,
    });
  }
  await recordAudit({ req, action: 'expense.update', entity: 'Expense', entityId: expense._id, oldValue: before.toObject(), newValue: req.body });
  res.json({ success: true, data: expense });
});

export const deleteExpense = catchAsync(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found.');
  await reverseExpenseLedger(expense, req.user._id, `Deleted: ${expense.description}`);
  await expense.deleteOne();
  await recordAudit({ req, action: 'expense.delete', entity: 'Expense', entityId: expense._id, oldValue: expense.toObject() });
  res.json({ success: true, message: 'Expense deleted.' });
});

export default { listExpenses, createExpense, updateExpense, deleteExpense };
