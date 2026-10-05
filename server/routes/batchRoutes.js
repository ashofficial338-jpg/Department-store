import { Router } from 'express';
import { listBatches, getBatch, createBatch, updateBatch, batchProfitability } from '../controllers/batchController.js';
import { protect, adminOnly, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect, requirePermission('products', 'inventory'));

router.get('/', listBatches);
router.get('/:id', getBatch);
router.get('/:id/profitability', batchProfitability);
router.post('/', createBatch);
router.put('/:id', adminOnly, updateBatch);

export default router;
