import Vendor from '../models/Vendor.js';
import Purchase from '../models/Purchase.js';
import crudFactory from '../utils/crudFactory.js';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';

const base = crudFactory(Vendor, { entityName: 'Vendor', searchFields: ['name', 'companyName', 'gstin'] });

export const vendorDashboard = catchAsync(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw new ApiError(404, 'Vendor not found.');

  const purchases = await Purchase.find({ vendor: vendor._id });
  const totalPurchases = purchases.reduce((s, p) => s + (p.grandTotal || 0), 0);
  const paidAmount = purchases.reduce((s, p) => s + (p.amountPaid || 0), 0);
  const outstanding = totalPurchases - paidAmount;

  res.json({
    success: true,
    data: {
      vendor,
      totalPurchases,
      paidAmount,
      outstandingAmount: outstanding,
      purchaseCount: purchases.length,
      recentPurchases: purchases.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10),
    },
  });
});

export const vendorController = { ...base, vendorDashboard };
export default vendorController;
