import { Router } from 'express';
import { listNotifications } from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);
router.get('/', listNotifications);

export default router;
