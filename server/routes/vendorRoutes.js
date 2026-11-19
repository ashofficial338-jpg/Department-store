import { Router } from 'express';
import { vendorController as c, docUpload } from '../controllers/vendorController.js';
import { protect, adminOnly, requirePermission } from '../middleware/auth.js';

// Vendor Management. Reading needs vendors or purchasing access; registering / editing vendors and their
// documents needs the vendors module; changing the verification status is for administrators only.
const router = Router();
router.use(protect);
const canRead = requirePermission('vendors', 'purchasing', 'finance', 'dc');
const canWrite = requirePermission('vendors');

router.get('/all', c.listAll);
router.get('/', canRead, c.list);
router.get('/:id', canRead, c.getOne);
router.get('/:id/dashboard', canRead, c.vendorDashboard);
router.get('/:id/checklist', canRead, c.checklist);
router.get('/:id/documents/:docId', canRead, c.downloadDocument);
router.post('/', canWrite, c.create);
router.put('/:id', canWrite, c.update);
router.delete('/:id', canWrite, adminOnly, c.remove);
router.post('/:id/documents', canWrite, docUpload, c.uploadDocument);
router.delete('/:id/documents/:docId', canWrite, c.deleteDocument);
router.post('/:id/verify', adminOnly, c.verify);

export default router;
