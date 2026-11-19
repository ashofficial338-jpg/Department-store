import Vendor from '../models/Vendor.js';
import ApiError from './ApiError.js';

const LABEL = { pending: 'Pending Verification', rejected: 'Rejected', on_hold: 'On Hold' };

// Purchase orders, purchase invoices, inward DCs, purchase returns and vendor payments only work with a
// VERIFIED, active vendor. `action` completes the sentence "Cannot <action>".
export async function assertVerifiedVendor(vendorId, action = 'use this vendor') {
  const v = await Vendor.findById(vendorId).select('name verificationStatus status').lean();
  if (!v) throw new ApiError(400, 'Selected vendor was not found.');
  if (v.status === 'inactive') throw new ApiError(400, `Cannot ${action}: vendor "${v.name}" is inactive.`);
  if (v.verificationStatus !== 'verified') {
    throw new ApiError(400, `Cannot ${action}: vendor "${v.name}" is ${LABEL[v.verificationStatus] || 'not verified'}. Verify the vendor in Purchasing > Vendor Management first.`);
  }
  return v;
}

export default assertVerifiedVendor;
