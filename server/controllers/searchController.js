import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Vendor from '../models/Vendor.js';
import Supplier from '../models/Supplier.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Batch from '../models/Batch.js';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';

export const globalSearch = catchAsync(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) throw new ApiError(400, 'Enter a search term.');
  const rx = new RegExp(q, 'i');

  const [products, customers, vendors, suppliers, sales, purchases, batches] = await Promise.all([
    Product.find({ $or: [{ name: rx }, { sku: rx }, { barcode: rx }] }).limit(5).select('name sku'),
    Customer.find({ $or: [{ name: rx }, { phone: rx }] }).limit(5).select('name phone'),
    Vendor.find({ name: rx }).limit(5).select('name'),
    Supplier.find({ name: rx }).limit(5).select('name'),
    Sale.find({ invoiceNumber: rx }).limit(5).select('invoiceNumber grandTotal'),
    Purchase.find({ poNumber: rx }).limit(5).select('poNumber grandTotal'),
    Batch.find({ batchNumber: rx }).limit(5).select('batchNumber'),
  ]);

  res.json({
    success: true,
    data: {
      products: products.map((p) => ({ id: p._id, label: p.name, sub: p.sku, type: 'product' })),
      customers: customers.map((c) => ({ id: c._id, label: c.name, sub: c.phone, type: 'customer' })),
      vendors: vendors.map((v) => ({ id: v._id, label: v.name, type: 'vendor' })),
      suppliers: suppliers.map((s) => ({ id: s._id, label: s.name, type: 'supplier' })),
      invoices: sales.map((s) => ({ id: s._id, label: s.invoiceNumber, sub: `Rs. ${s.grandTotal}`, type: 'sale' })),
      purchaseOrders: purchases.map((p) => ({ id: p._id, label: p.poNumber, sub: `Rs. ${p.grandTotal}`, type: 'purchase' })),
      batches: batches.map((b) => ({ id: b._id, label: b.batchNumber, type: 'batch' })),
    },
  });
});

export default { globalSearch };
