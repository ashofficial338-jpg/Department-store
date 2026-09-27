import { Router } from 'express';
import { listExpenses, createExpense, updateExpense, deleteExpense } from '../controllers/expenseController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', listExpenses);
router.post('/', createExpense);
router.put('/:id', adminOnly, updateExpense);
router.delete('/:id', adminOnly, deleteExpense);

export default router;
