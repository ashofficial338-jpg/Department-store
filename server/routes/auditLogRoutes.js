import { Router } from 'express';
import { listAuditLogs } from '../controllers/auditLogController.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = Router();
router.use(protect, restrictTo('super_admin', 'admin', 'auditor'));

router.get('/', listAuditLogs);

export default router;
