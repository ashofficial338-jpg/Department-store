import { Router } from 'express';
import {
  previewSale, createSale, resumeSale, listSales, getSale, heldSales, cancelSale,
  createSalesReturn, listSalesReturns,
} from '../controllers/salesController.js';
import { protect, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect, requirePermission('sales', 'pos'));

router.post('/preview', previewSale);
router.get('/held', heldSales);
router.get('/returns', requirePermission('sales'), listSalesReturns);
router.post('/returns', requirePermission('sales'), createSalesReturn);
router.get('/', listSales);
router.get('/:id', getSale);
router.post('/', createSale);
router.post('/:id/resume', resumeSale);
router.post('/:id/cancel', cancelSale);

export default router;
