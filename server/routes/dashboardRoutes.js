import { Router } from 'express';
import {
  kpis, topProducts, productRoi, salesTrend, categoryBrandSales, filterOptions, itrAnalysisReport, metricDetails, exportMetric,
} from '../controllers/dashboardController.js';
import { protect, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect, requirePermission('dashboard'));

// Section-level access (dashboard.sales / .expenses / .inventory / .financials) and filter permission
// are checked inside each handler, since one response can combine several sections.
router.get('/kpis', kpis);
router.get('/top-products', topProducts);
router.get('/product-roi', productRoi);
router.get('/sales-trend', salesTrend);
router.get('/category-brand-sales', categoryBrandSales);
router.get('/itr-analysis', itrAnalysisReport);
router.get('/filter-options', requirePermission('dashboard.filters'), filterOptions);
router.get('/details/:metric', requirePermission('dashboard.details'), metricDetails);
router.get('/export/:metric', requirePermission('dashboard.export'), exportMetric);

export default router;
