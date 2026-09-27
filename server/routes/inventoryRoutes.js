import { Router } from 'express';
import {
  stockOverview, lowStock, expiryManagement, stockLedger, adjustStock,
  createStockTransfer, completeStockTransfer, listStockTransfers, locationsList,
} from '../controllers/inventoryController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/overview', stockOverview);
router.get('/low-stock', lowStock);
router.get('/expiry', expiryManagement);
router.get('/ledger', stockLedger);
router.get('/locations', locationsList);
router.post('/adjust', adjustStock);

router.get('/transfers', listStockTransfers);
router.post('/transfers', createStockTransfer);
router.post('/transfers/:id/complete', completeStockTransfer);

export default router;
