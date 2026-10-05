import { Router } from 'express';
import { createPayment, listPayments } from '../controllers/paymentController.js';
import { protect, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect, requirePermission('finance'));

router.get('/', listPayments);
router.post('/', createPayment);

export default router;
