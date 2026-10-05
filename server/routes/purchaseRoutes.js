import { Router } from 'express';
import {
  createPurchase, listPurchases, getPurchase, receiveGoods, payVendor,
  createPurchaseReturn, listPurchaseReturns,
} from '../controllers/purchaseController.js';
import { protect, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect);

// Vendor payments are also made from Finance > Payables.
router.post('/:id/pay', requirePermission('purchasing', 'finance'), payVendor);
router.use(requirePermission('purchasing'));

router.get('/returns', listPurchaseReturns);
router.post('/returns', createPurchaseReturn);
router.get('/', listPurchases);
router.get('/:id', getPurchase);
router.post('/', createPurchase);
router.post('/:id/receive', receiveGoods);

export default router;
