import Account from '../models/Account.js';
import LedgerEntry from '../models/LedgerEntry.js';

const ACCOUNT_SEEDS = {
  cash: { name: 'Cash Account', type: 'asset', accountGroup: 'cash' },
  bank: { name: 'Bank Account', type: 'asset', accountGroup: 'bank' },
  upi: { name: 'UPI Collections', type: 'asset', accountGroup: 'bank' },
  sales: { name: 'Sales Account', type: 'income', accountGroup: 'sales' },
  purchases: { name: 'Purchases Account', type: 'expense', accountGroup: 'purchase' },
  receivable: { name: 'Accounts Receivable', type: 'asset', accountGroup: 'receivable' },
  payable: { name: 'Accounts Payable', type: 'liability', accountGroup: 'payable' },
  gstOutput: { name: 'GST Output Tax', type: 'liability', accountGroup: 'other' },
  gstInput: { name: 'GST Input Tax Credit', type: 'asset', accountGroup: 'other' },
  expenses: { name: 'Operating Expenses', type: 'expense', accountGroup: 'expense' },
};

// Looked up on every call (no in-memory cache) so postings never target an account
// that was deleted while the server was running, e.g. after a database reset.
export async function getSystemAccount(key) {
  const seed = ACCOUNT_SEEDS[key];
  if (!seed) throw new Error(`Unknown system account key: ${key}`);
  let account = await Account.findOne({ name: seed.name });
  if (!account) account = await Account.create(seed);
  return account;
}

export function methodToAccountKey(method) {
  if (method === 'cash') return 'cash';
  if (method === 'upi') return 'upi';
  if (method === 'card' || method === 'bank_transfer') return 'bank';
  return 'receivable';
}

export async function postLedgerPair({ debitKey, creditKey, amount, narration, referenceType, referenceId, userId }) {
  if (!amount || amount <= 0) return;
  const [debitAccount, creditAccount] = await Promise.all([getSystemAccount(debitKey), getSystemAccount(creditKey)]);

  await LedgerEntry.insertMany([
    { account: debitAccount._id, entryType: 'debit', amount, narration, referenceType, referenceId, createdBy: userId },
    { account: creditAccount._id, entryType: 'credit', amount, narration, referenceType, referenceId, createdBy: userId },
  ]);

  await Account.findByIdAndUpdate(debitAccount._id, { $inc: { currentBalance: amount } });
  await Account.findByIdAndUpdate(creditAccount._id, { $inc: { currentBalance: -amount } });
}

export default { getSystemAccount, methodToAccountKey, postLedgerPair };
