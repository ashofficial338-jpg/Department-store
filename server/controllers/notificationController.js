import Inventory from '../models/Inventory.js';
import Batch from '../models/Batch.js';
import Purchase from '../models/Purchase.js';
import InwardDC from '../models/InwardDC.js';
import OutwardDC from '../models/OutwardDC.js';
import Sale from '../models/Sale.js';
import catchAsync from '../utils/catchAsync.js';

// Computed live (no separate notifications collection) so the badge is always accurate.
export const listNotifications = catchAsync(async (req, res) => {
  const notifications = [];

  const lowStock = await Inventory.aggregate([
    { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { $expr: { $lte: ['$currentStock', '$product.reorderLevel'] }, currentStock: { $gt: 0 } } },
    { $count: 'count' },
  ]);
  if (lowStock[0]?.count) notifications.push({ type: 'low_stock', severity: 'warning', message: `${lowStock[0].count} product(s) are at or below reorder level.`, link: '/inventory/low-stock' });

  const outOfStock = await Inventory.aggregate([{ $match: { currentStock: { $lte: 0 } } }, { $count: 'count' }]);
  if (outOfStock[0]?.count) notifications.push({ type: 'out_of_stock', severity: 'critical', message: `${outOfStock[0].count} product(s) are out of stock.`, link: '/inventory/stock-overview' });

  const expiring = await Batch.countDocuments({ expiryDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, availableQuantity: { $gt: 0 }, status: 'active' });
  if (expiring) notifications.push({ type: 'expiry', severity: 'warning', message: `${expiring} batch(es) expiring within 30 days.`, link: '/inventory/expiry-management' });

  const pendingPayments = await Purchase.countDocuments({ status: { $in: ['received', 'invoiced'] }, $expr: { $lt: ['$amountPaid', '$grandTotal'] } });
  if (pendingPayments) notifications.push({ type: 'pending_payment', severity: 'info', message: `${pendingPayments} vendor invoice(s) have pending payment.`, link: '/finance/payables' });

  const pendingInward = await InwardDC.countDocuments({ status: 'pending' });
  if (pendingInward) notifications.push({ type: 'dc_pending', severity: 'info', message: `${pendingInward} inward DC document(s) awaiting verification.`, link: '/dc/inward' });

  const pendingOutward = await OutwardDC.countDocuments({ status: 'draft' });
  if (pendingOutward) notifications.push({ type: 'approval', severity: 'info', message: `${pendingOutward} outward DC document(s) awaiting approval.`, link: '/dc/outward' });

  const highValueCutoff = 50000;
  const highValueSales = await Sale.countDocuments({ grandTotal: { $gte: highValueCutoff }, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  if (highValueSales) notifications.push({ type: 'high_value', severity: 'info', message: `${highValueSales} high-value transaction(s) in the last 24 hours.`, link: '/sales/history' });

  res.json({ success: true, data: notifications });
});

export default { listNotifications };
