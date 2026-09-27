import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
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

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;
