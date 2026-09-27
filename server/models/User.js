import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = [
  'super_admin',
  'admin',
  'store_manager',
  'dc_manager',
  'cashier',
  'accountant',
  'purchase_manager',
  'inventory_manager',
  'sales_manager',
  'auditor',
];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ROLES, default: 'cashier' },
    phone: { type: String, trim: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    distributionCenter: { type: mongoose.Schema.Types.ObjectId, ref: 'DistributionCenter' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.index({ role: 1 });

const User = mongoose.model('User', userSchema);
export default User;
