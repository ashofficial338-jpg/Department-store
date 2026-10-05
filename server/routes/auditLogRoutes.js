import { Router } from 'express';
import { listAuditLogs } from '../controllers/auditLogController.js';
import { protect, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect, requirePermission('audit'));

router.get('/', listAuditLogs);

export default router;
