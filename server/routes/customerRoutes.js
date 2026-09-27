import { Router } from 'express';
import {
  listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer,
  customerDashboard, customerHistory, outstandingCustomers,
} from '../controllers/customerController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/outstanding', outstandingCustomers);
router.get('/', listCustomers);
router.get('/:id', getCustomer);
router.get('/:id/dashboard', customerDashboard);
router.get('/:id/history', customerHistory);
router.post('/', createCustomer);
router.put('/:id', adminOnly, updateCustomer);
router.delete('/:id', adminOnly, deleteCustomer);

export default router;
