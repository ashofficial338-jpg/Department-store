import { Router } from 'express';
import {
  createPurchase, listPurchases, getPurchase, receiveGoods, payVendor,
  createPurchaseReturn, listPurchaseReturns,
} from '../controllers/purchaseController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/returns', listPurchaseReturns);
router.post('/returns', createPurchaseReturn);
router.get('/', listPurchases);
router.get('/:id', getPurchase);
router.post('/', createPurchase);
router.post('/:id/receive', receiveGoods);
router.post('/:id/pay', payVendor);

export default router;
