import { Router } from 'express';
import { gstSalesReport, gstPurchaseReport, gstSummary } from '../controllers/gstController.js';
import { taxRateController } from '../controllers/taxRateController.js';
import { protect, adminOnly, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/rates', taxRateController.listAll);
router.post('/rates', requirePermission('settings'), taxRateController.create);
router.put('/rates/:id', requirePermission('settings'), adminOnly, taxRateController.update);
router.delete('/rates/:id', requirePermission('settings'), adminOnly, taxRateController.remove);

router.get('/summary', requirePermission('finance'), gstSummary);
router.get('/sales-report', requirePermission('finance'), gstSalesReport);
router.get('/purchase-report', requirePermission('finance'), gstPurchaseReport);

export default router;
