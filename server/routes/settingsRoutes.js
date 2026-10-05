import { Router } from 'express';
import {
  getSettings, updateSettings, permissionCatalog, listRolePermissions, createRole, updateRolePermission, deleteRole,
} from '../controllers/settingsController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect);

// Company/invoice settings are read by POS receipts and invoices for every signed-in user.
router.get('/', getSettings);
router.put('/', adminOnly, updateSettings);

// Roles & Permissions: administrators only.
router.get('/permissions', adminOnly, permissionCatalog);
router.get('/roles', adminOnly, listRolePermissions);
router.post('/roles', adminOnly, createRole);
router.put('/roles/:role', adminOnly, updateRolePermission);
router.delete('/roles/:role', adminOnly, deleteRole);

export default router;
