import { Router } from 'express';
import {
  previewSale, createSale, resumeSale, listSales, getSale, heldSales, cancelSale,
  createSalesReturn, listSalesReturns,
} from '../controllers/salesController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.post('/preview', previewSale);
router.get('/held', heldSales);
router.get('/returns', listSalesReturns);
router.post('/returns', createSalesReturn);
router.get('/', listSales);
router.get('/:id', getSale);
router.post('/', createSale);
router.post('/:id/resume', resumeSale);
router.post('/:id/cancel', cancelSale);

export default router;
