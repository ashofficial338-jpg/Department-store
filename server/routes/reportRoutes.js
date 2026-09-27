import { Router } from 'express';
import {
  salesReport, purchaseReport, stockReport, batchReport, vendorReport, customerReport,
  productReport, dcReport, expenseReport, paymentReport, outstandingReport, cashBankReport, profitAndLoss,
} from '../controllers/reportController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

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
router.get('/outstanding', outstandingReport);
router.get('/cash-bank', cashBankReport);
router.get('/profit-loss', profitAndLoss);

export default router;
