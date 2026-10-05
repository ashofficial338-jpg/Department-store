import { Router } from 'express';
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/userController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect, adminOnly);

router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
