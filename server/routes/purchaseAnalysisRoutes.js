import { Router } from 'express';
import { lines, summary, productBrands, options, exportReport } from '../controllers/purchaseAnalysisController.js';
import { protect, requirePermission } from '../middleware/auth.js';

// Purchase Analysis (product / brand / supplier / date reports, rate history, exports).
const router = Router();
router.use(protect);

// Brand list of a product (with each brand's rate, supplier and stock) is used by purchase entry too.
router.get('/product/:productId/brands', requirePermission('purchasing', 'products', 'reports', 'inventory'), productBrands);
router.use(requirePermission('reports', 'purchasing'));
router.get('/options', options);
router.get('/lines', lines);
router.get('/summary', summary);
router.get('/export', exportReport);

export default router;
