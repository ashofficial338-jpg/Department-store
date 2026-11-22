import { Router } from 'express';
import {
  previewSale, createSale, createSimpleBill, resumeSale, listSales, getSale, heldSales, cancelSale,
  createSalesReturn, listSalesReturns,
} from '../controllers/salesController.js';
import { protect, requirePermission, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect, requirePermission('sales', 'pos'));

router.post('/preview', previewSale);
router.post('/simple', requirePermission('pos'), createSimpleBill);
router.get('/held', heldSales);
router.get('/returns', requirePermission('sales'), listSalesReturns);
router.post('/returns', requirePermission('sales'), createSalesReturn);
router.get('/', listSales);
router.get('/:id', getSale);
router.post('/', createSale);
router.post('/:id/resume', resumeSale);
// Cancelling a saved bill changes an existing record: administrators only.
router.post('/:id/cancel', adminOnly, cancelSale);

export default router;
