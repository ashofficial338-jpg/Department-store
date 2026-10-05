import { Router } from 'express';
import {
  stockOverview, lowStock, expiryManagement, stockLedger, adjustStock,
  createStockTransfer, completeStockTransfer, listStockTransfers, locationsList,
} from '../controllers/inventoryController.js';
import { protect, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect);

// Location list feeds dropdowns on DC and purchasing screens; everything else needs the inventory module.
router.get('/locations', locationsList);
router.use(requirePermission('inventory'));

router.get('/overview', stockOverview);
router.get('/low-stock', lowStock);
router.get('/expiry', expiryManagement);
router.get('/ledger', stockLedger);
router.post('/adjust', adjustStock);

router.get('/transfers', listStockTransfers);
router.post('/transfers', createStockTransfer);
router.post('/transfers/:id/complete', completeStockTransfer);

export default router;
