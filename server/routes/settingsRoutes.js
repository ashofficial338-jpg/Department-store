import { Router } from 'express';
import { getSettings, updateSettings, listRolePermissions, updateRolePermission } from '../controllers/settingsController.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', getSettings);
router.put('/', restrictTo('super_admin', 'admin'), updateSettings);

router.get('/roles', listRolePermissions);
router.put('/roles/:role', restrictTo('super_admin'), updateRolePermission);

export default router;
