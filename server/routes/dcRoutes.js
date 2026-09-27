import { Router } from 'express';
import {
  createInwardDC, listInwardDC, getInwardDC, processInwardDC,
  createOutwardDC, listOutwardDC, getOutwardDC, advanceOutwardDC, cancelOutwardDC,
  dcWiseStock,
} from '../controllers/dcController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/inward', listInwardDC);
router.get('/inward/:id', getInwardDC);
router.post('/inward', createInwardDC);
router.post('/inward/:id/process', processInwardDC);

router.get('/outward', listOutwardDC);
router.get('/outward/:id', getOutwardDC);
router.post('/outward', createOutwardDC);
router.post('/outward/:id/advance', advanceOutwardDC);
router.post('/outward/:id/cancel', cancelOutwardDC);

router.get('/stock', dcWiseStock);
router.get('/stock/:id', dcWiseStock);

export default router;
