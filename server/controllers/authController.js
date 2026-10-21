import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import generateToken from '../utils/generateToken.js';
import recordAudit from '../utils/audit.js';
import { userPermissions, isFullAccessRole } from '../services/permissionService.js';

// The client receives the effective permission keys so it can tailor the UI; the API enforces them independently.
async function sanitizeUser(user) {
  const obj = user.toObject();
  delete obj.password;
  obj.permissions = await userPermissions(user);
  obj.isAdmin = isFullAccessRole(user.role);
  return obj;
}

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) throw new ApiError(400, 'Email and password are required.');
  if (email.length > 254 || password.length > 200) throw new ApiError(400, 'Invalid email or password.');

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password.');
  }
  if (!user.isActive) throw new ApiError(401, 'This account has been deactivated.');

  user.lastLoginAt = new Date();
  await user.save();

  await recordAudit({ req: { ...req, user }, action: 'login', entity: 'User', entityId: user._id });

  res.json({
    success: true,
    token: generateToken(user),
    user: await sanitizeUser(user),
  });
});

export const me = catchAsync(async (req, res) => {
  res.json({ success: true, user: await sanitizeUser(req.user) });
});

export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof newPassword !== 'string' || newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    throw new ApiError(400, 'New password must be at least 8 characters and include a letter and a number.');
  }
  if (typeof currentPassword !== 'string') throw new ApiError(400, 'Current password is required.');
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(401, 'Current password is incorrect.');
  }
  user.password = newPassword;
  await user.save();
  await recordAudit({ req, action: 'user.password_change', entity: 'User', entityId: user._id });
  // Older sessions are now invalid (see passwordChangedAt); hand this device a fresh token.
  res.json({ success: true, message: 'Password updated successfully. Other devices have been signed out.', token: generateToken(user) });
});

export default { login, me, changePassword };
