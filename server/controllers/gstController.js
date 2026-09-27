import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import catchAsync from '../utils/catchAsync.js';
import { parseDateRange } from '../utils/dateRanges.js';

export const gstSalesReport = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const rows = await Sale.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.gstRate',
        taxableAmount: { $sum: '$items.taxableAmount' },
        cgst: { $sum: '$items.cgst' },
        sgst: { $sum: '$items.sgst' },
        igst: { $sum: '$items.igst' },
        taxAmount: { $sum: '$items.taxAmount' },
        totalAmount: { $sum: '$items.totalAmount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  res.json({ success: true, data: rows });
});

export const gstPurchaseReport = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const rows = await Purchase.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.gstRate',
        taxableAmount: { $sum: '$items.taxableAmount' },
        taxAmount: { $sum: '$items.taxAmount' },
        totalAmount: { $sum: '$items.totalAmount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  res.json({ success: true, data: rows });
});

export const gstSummary = catchAsync(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const [salesTax, purchaseTax] = await Promise.all([
    Sale.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, taxableAmount: { $sum: '$taxableAmount' }, cgst: { $sum: '$cgst' }, sgst: { $sum: '$sgst' }, igst: { $sum: '$igst' }, taxAmount: { $sum: '$taxAmount' } } },
    ]),
    Purchase.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'draft' } } },
      { $group: { _id: null, taxableAmount: { $sum: '$subtotal' }, taxAmount: { $sum: '$taxAmount' } } },
    ]),
  ]);

  const outputTax = salesTax[0]?.taxAmount || 0;
  const inputTax = purchaseTax[0]?.taxAmount || 0;

  res.json({
    success: true,
    data: {
      outputTax,
      inputTax,
      netGstPayable: Math.max(0, outputTax - inputTax),
      salesTaxable: salesTax[0]?.taxableAmount || 0,
      purchaseTaxable: purchaseTax[0]?.taxableAmount || 0,
      cgst: salesTax[0]?.cgst || 0,
      sgst: salesTax[0]?.sgst || 0,
      igst: salesTax[0]?.igst || 0,
    },
  });
});

export default { gstSalesReport, gstPurchaseReport, gstSummary };
