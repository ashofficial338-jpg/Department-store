import Counter from '../models/Counter.js';
import { getFinancialYearCode } from './financialYear.js';

const PREFIXES = {
  sale: 'INV',
  saleReturn: 'SRT',
  purchase: 'PO',
  purchaseInvoice: 'PINV',
  purchaseReturn: 'PRT',
  inwardDC: 'IDC',
  outwardDC: 'ODC',
  stockTransfer: 'STF',
  paymentVoucher: 'PV',
  receiptVoucher: 'RV',
};

// Generates sequential, financial-year-scoped document numbers, e.g. INV/2526/000042
export async function generateDocNumber(type) {
  const prefix = PREFIXES[type];
  if (!prefix) throw new Error(`Unknown document type for numbering: ${type}`);
  const fy = getFinancialYearCode();
  const key = `${type}:${fy}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(6, '0');
  return `${prefix}/${fy}/${seq}`;
}

export default generateDocNumber;
