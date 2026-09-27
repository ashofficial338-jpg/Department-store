import { Router } from 'express';
import { gstSalesReport, gstPurchaseReport, gstSummary } from '../controllers/gstController.js';
import { taxRateController } from '../controllers/taxRateController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/rates', taxRateController.listAll);
router.post('/rates', taxRateController.create);
router.put('/rates/:id', adminOnly, taxRateController.update);
router.delete('/rates/:id', adminOnly, taxRateController.remove);

router.get('/summary', gstSummary);
router.get('/sales-report', gstSalesReport);
router.get('/purchase-report', gstPurchaseReport);

export default router;
