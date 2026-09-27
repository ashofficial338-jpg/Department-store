import { Router } from 'express';
import { createPayment, listPayments } from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', listPayments);
router.post('/', createPayment);

export default router;
