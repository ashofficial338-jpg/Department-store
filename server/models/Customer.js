import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true }, // optional; unique when given (index below)
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    gstin: { type: String, trim: true },
    customerType: { type: String, enum: ['retail', 'wholesale', 'corporate'], default: 'retail' },
    creditLimit: { type: Number, default: 0 },
    outstanding: { type: Number, default: 0 },
    loyaltyPoints: { type: Number, default: 0 },
    loyaltyTier: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum'], default: 'bronze' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

customerSchema.index({ name: 'text', phone: 'text', email: 'text' });
customerSchema.index({ phone: 1 }, { unique: true, name: 'phone_unique_when_set', partialFilterExpression: { phone: { $type: 'string' } } });

const Customer = mongoose.model('Customer', customerSchema);

// Mobile number became optional (2026-11-23): replace the old strict unique index (which treats every
// missing number as the same value) with one that only applies when a number is present. Runs once per process.
let phoneIndexChecked = false;
export async function ensureCustomerPhoneIndex() {
  if (phoneIndexChecked) return;
  try {
    const indexes = await Customer.collection.indexes();
    if (indexes.some((i) => i.name === 'phone_1')) await Customer.collection.dropIndex('phone_1');
    if (!indexes.some((i) => i.name === 'phone_unique_when_set')) {
      await Customer.collection.createIndex({ phone: 1 }, { unique: true, name: 'phone_unique_when_set', partialFilterExpression: { phone: { $type: 'string' } } });
    }
    phoneIndexChecked = true;
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound') { phoneIndexChecked = true; return; }
    throw err;
  }
}
export default Customer;
