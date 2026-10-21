import mongoose from 'mongoose';

// Rack locator entry: tells staff exactly which rack holds a product so they can pick it quickly.
const rackItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true },
    serialNumber: { type: String, required: [true, 'Serial number is required'], unique: true, trim: true, uppercase: true },
    rack: { type: String, required: [true, 'Rack is required'], trim: true, uppercase: true },
    quantity: { type: Number, required: true, min: [0, 'Quantity cannot be negative'], default: 0 },
  },
  { timestamps: true }
);

rackItemSchema.index({ rack: 1, name: 1 });

const RackItem = mongoose.model('RackItem', rackItemSchema);
export default RackItem;
