import { Router } from 'express';
import { kpis, topProducts, salesTrend, categoryBrandSales } from '../controllers/dashboardController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/kpis', kpis);
router.get('/top-products', topProducts);
router.get('/sales-trend', salesTrend);
router.get('/category-brand-sales', categoryBrandSales);

export default router;
