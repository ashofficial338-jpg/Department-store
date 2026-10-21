import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, me, changePassword } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Brute-force protection: 10 failed sign-ins per 15 minutes per IP address. Successful sign-ins don't count.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.' },
});

router.post('/login', loginLimiter, login);
router.get('/me', protect, me);
router.post('/change-password', protect, loginLimiter, changePassword);

export default router;
