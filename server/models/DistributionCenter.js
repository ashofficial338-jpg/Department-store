import mongoose from 'mongoose';

const dcSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

const DistributionCenter = mongoose.model('DistributionCenter', dcSchema);
export default DistributionCenter;
