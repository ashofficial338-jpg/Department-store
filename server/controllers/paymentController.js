import Payment from '../models/Payment.js';
import Customer from '../models/Customer.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { generateDocNumber } from '../utils/docNumber.js';
import { postLedgerPair, methodToAccountKey } from '../utils/ledger.js';

export const createPayment = catchAsync(async (req, res) => {
  const { direction, purpose, party, partyModel, referenceType, referenceId, method, amount, transactionRef, notes } = req.body;
  if (!amount || amount <= 0) throw new ApiError(400, 'Payment amount must be greater than zero.');

  const voucherNumber = await generateDocNumber(direction === 'incoming' ? 'receiptVoucher' : 'paymentVoucher');
  const payment = await Payment.create({
    voucherNumber, direction, purpose, party, partyModel, referenceType, referenceId,
    method, amount, transactionRef, recordedBy: req.user._id, notes,
  });

  const moneyAccount = methodToAccountKey(method);
  if (direction === 'incoming') {
    await postLedgerPair({ debitKey: moneyAccount, creditKey: 'receivable', amount, narration: `Receipt ${voucherNumber}`, referenceType: 'Payment', referenceId: payment._id, userId: req.user._id });
    if (partyModel === 'Customer' && party) {
      await Customer.findByIdAndUpdate(party, { $inc: { outstanding: -amount } });
    }
  } else {
    await postLedgerPair({ debitKey: 'payable', creditKey: moneyAccount, amount, narration: `Payment ${voucherNumber}`, referenceType: 'Payment', referenceId: payment._id, userId: req.user._id });
  }

  await recordAudit({ req, action: 'payment.create', entity: 'Payment', entityId: payment._id, newValue: { voucherNumber, amount, direction } });
  res.status(201).json({ success: true, data: payment });
});

export const listPayments = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.direction) filter.direction = req.query.direction;
  if (req.query.method) filter.method = req.query.method;
  if (req.query.from || req.query.to) {
    filter.paymentDate = {};
    if (req.query.from) filter.paymentDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.paymentDate.$lte = new Date(req.query.to);
  }
  const [docs, total] = await Promise.all([
    Payment.find(filter).populate('party').sort({ paymentDate: -1 }).skip(skip).limit(limit),
    Payment.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export default { createPayment, listPayments };
