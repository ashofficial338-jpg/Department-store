import Store from '../models/Store.js';
import DistributionCenter from '../models/DistributionCenter.js';
import ApiError from './ApiError.js';
import { FULL_ACCESS_ROLES } from '../config/permissions.js';

// Store visibility rule: Active stores are visible and selectable; Inactive stores are hidden from
// operational lists and cannot be used for NEW work. Records are never deleted, and existing
// documents (invoices, POs, transfers, reports) keep their store and stay readable.

// Mongo filter for stores that count as active (stores created before the flag existed have no value).
export const ACTIVE_STORE_FILTER = { isActive: { $ne: false } };

export const isAdminUser = (user) => !!user && (user.isAdmin === true || FULL_ACCESS_ROLES.includes(user.role));

// Throws 400 unless `id` is an existing, active store. `label` names the field in the message.
export async function assertActiveStore(id, label = 'Store') {
  const store = await Store.findById(id).select('name code isActive').lean();
  if (!store) throw new ApiError(400, `${label} was not found.`);
  if (store.isActive === false) {
    throw new ApiError(400, `${label} "${store.name}" is inactive. Activate it in Settings > Store / Branch to use it.`);
  }
  return store;
}

// Same check, but only when the store is being set or changed (editing an old record that already
// points at a now-inactive store must still work for its other fields).
export async function assertActiveStoreIfChanged(nextId, previousId, label = 'Store') {
  if (!nextId || String(nextId) === String(previousId || '')) return;
  await assertActiveStore(nextId, label);
}

// ---- Distribution centers: same rule, stored as status 'active' | 'inactive'. ----
export const ACTIVE_DC_FILTER = { status: { $ne: 'inactive' } };

export async function assertActiveDC(id, label = 'Distribution center') {
  const dc = await DistributionCenter.findById(id).select('name code status').lean();
  if (!dc) throw new ApiError(400, `${label} was not found.`);
  if (dc.status === 'inactive') {
    throw new ApiError(400, `${label} "${dc.name}" is inactive. Activate it in DC Management > Distribution Centers to use it.`);
  }
  return dc;
}

export default assertActiveStore;
