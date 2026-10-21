import { Router } from 'express';
import {
  salesReport, purchaseReport, stockReport, batchReport, vendorReport, customerReport,
  productReport, dcReport, expenseReport, paymentReport, outstandingReport, cashBankReport, profitAndLoss,
} from '../controllers/reportController.js';
import {
  meta, overview, section, exportReport, createTemplate, updateTemplate, deleteTemplate,
} from '../controllers/advancedReportController.js';
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

// Advanced reporting: analytics overview, section tables, PDF / Excel export and saved templates.
router.get('/advanced/meta', meta);
router.get('/advanced/overview', overview);
router.get('/advanced/section/:key', section);
router.post('/advanced/export', exportReport);
router.post('/advanced/templates', createTemplate);
router.put('/advanced/templates/:id', updateTemplate);
router.delete('/advanced/templates/:id', deleteTemplate);

export default router;
