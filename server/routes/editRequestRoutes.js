import { Router } from 'express';
import {
  createEditRequest, listEditRequests, approveEditRequest, rejectEditRequest, withdrawEditRequest, recordActivity, pendingCount,
} from '../controllers/editRequestController.js';
import { protect, adminOnly, loadPermissions } from '../middleware/auth.js';

// Edit requests: any signed-in user with access to the record's module can ask; only administrators approve
// or reject. Module access is checked per record type inside the controller.
const router = Router();
router.use(protect, loadPermissions);

router.get('/', listEditRequests);
router.get('/count', pendingCount);
router.get('/activity/:entity/:id', recordActivity);
router.post('/', createEditRequest);
router.post('/:id/approve', adminOnly, approveEditRequest);
router.post('/:id/reject', adminOnly, rejectEditRequest);
router.post('/:id/withdraw', withdrawEditRequest);

export default router;
