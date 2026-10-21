import { Router } from 'express';
import { protect, requirePermission } from '../middleware/auth.js';
import { list, create, update, remove } from '../controllers/rackItemController.js';

// Rack locator is used on the shop floor, so anyone with inventory or products access can maintain it.
const router = Router();
const canUse = requirePermission('inventory', 'products');

router.use(protect, canUse);
router.get('/', list);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

export default router;
