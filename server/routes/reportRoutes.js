import { Router } from 'express';
import {
  salesReport, purchaseReport, stockReport, batchReport, vendorReport, customerReport,
  productReport, dcReport, expenseReport, paymentReport, outstandingReport, cashBankReport, profitAndLoss,
} from '../controllers/reportController.js';
import { protect, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect);

// Finance pages read these three directly; the rest belong to the Reports module.
router.get('/outstanding', requirePermission('reports', 'finance'), outstandingReport);
router.get('/cash-bank', requirePermission('reports', 'finance'), cashBankReport);
router.get('/profit-loss', requirePermission('reports', 'finance'), profitAndLoss);
router.use(requirePermission('reports'));

router.get('/sales', salesReport);
router.get('/purchases', purchaseReport);
router.get('/stock', stockReport);
router.get('/batches', batchReport);
router.get('/vendors', vendorReport);
router.get('/customers', customerReport);
router.get('/products', productReport);
router.get('/dc', dcReport);
router.get('/expenses', expenseReport);
router.get('/payments', paymentReport);

export default router;
