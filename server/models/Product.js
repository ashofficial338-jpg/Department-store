import mongoose from 'mongoose';

const productImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    barcode: { type: String, unique: true, sparse: true, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    description: { type: String, trim: true },
    hsn: { type: String, trim: true },
    taxRate: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxRate' },
    gstRate: { type: Number, default: 0 }, // denormalized snapshot for fast billing lookups
    purchasePrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    unit: { type: String, default: 'PCS' },
    reorderLevel: { type: Number, default: 10 },
    maxStock: { type: Number, default: 1000 },
    minStock: { type: Number, default: 0 },
    primarySupplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    primaryVendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    images: [productImageSchema],
    status: { type: String, enum: ['active', 'inactive', 'discontinued'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', sku: 'text', barcode: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ status: 1 });

const Product = mongoose.model('Product', productSchema);
export default Product;
