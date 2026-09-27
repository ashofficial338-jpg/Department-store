import mongoose from 'mongoose';

// Configurable GST rate slabs - never hard-code a rate elsewhere in the app.
const taxRateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "GST 18%"
    ratePercent: { type: Number, required: true, min: 0, max: 100 },
    hsnCodes: [{ type: String, trim: true }],
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

const TaxRate = mongoose.model('TaxRate', taxRateSchema);
export default TaxRate;
