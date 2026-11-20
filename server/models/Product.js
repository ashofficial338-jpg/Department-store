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
    // Product Master is a simple name list: prices are optional (billing takes the rate per kg at the counter).
    purchasePrice: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    unit: { type: String, default: 'PCS' },
    // Grocery units (codes from utils/units.js). sellingPrice is the price per `sellingUnit`; stock is kept in
    // `baseUnit`. `unitOptions` = units / sizes the cashier can pick ("kg", "500 g", "packet").
    // A pack-type unit converts to weight / volume only when its net content is set (1 packUnit = packQuantity packQuantityUnit).
    productType: { type: String, enum: ['loose', 'packed'] },
    sellingUnit: { type: String, trim: true },
    baseUnit: { type: String, trim: true },
    purchaseUnit: { type: String, trim: true },
    unitOptions: [{ type: String, trim: true }],
    packUnit: { type: String, trim: true },
    packQuantity: { type: Number, min: 0 },
    packQuantityUnit: { type: String, trim: true },
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
