import { Router } from 'express';
import { receiveSalePayment, saleProductBrands, partyLedger, tradeSummary } from '../controllers/tradeController.js';
import { protect, requirePermission } from '../middleware/auth.js';

// Sales & purchase money flow: bill receipts, brand stock at billing, customer / supplier ledgers, dashboard summary.
const router = Router();
router.use(protect);

router.get('/summary', requirePermission('dashboard'), tradeSummary);
router.get('/sale-brands/:productId', requirePermission('pos', 'sales'), saleProductBrands);
router.post('/sales/:id/receipts', requirePermission('sales', 'pos', 'finance', 'customers'), receiveSalePayment);
router.get('/ledger/:kind/:id', requirePermission('finance', 'sales', 'customers', 'purchasing', 'vendors'), partyLedger);

export default router;
