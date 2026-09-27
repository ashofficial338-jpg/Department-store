import Account from '../models/Account.js';
import LedgerEntry from '../models/LedgerEntry.js';
import crudFactory from '../utils/crudFactory.js';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';

const base = crudFactory(Account, { entityName: 'Account', searchFields: ['name'] });

export const accountLedger = catchAsync(async (req, res) => {
  const account = await Account.findById(req.params.id);
  if (!account) throw new ApiError(404, 'Account not found.');
  const { page, limit, skip } = getPagination(req.query);
  const filter = { account: account._id };
  const [entries, total] = await Promise.all([
    LedgerEntry.find(filter).sort({ entryDate: -1 }).skip(skip).limit(limit),
    LedgerEntry.countDocuments(filter),
  ]);
  res.json({ success: true, account, ...buildPaginatedResponse({ docs: entries, total, page, limit }) });
});

export const accountController = { ...base, accountLedger };
export default accountController;
