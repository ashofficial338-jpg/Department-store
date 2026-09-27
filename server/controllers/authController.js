import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import generateToken from '../utils/generateToken.js';
import recordAudit from '../utils/audit.js';

function sanitizeUser(user) {
  const obj = user.toObject();
  delete obj.password;
  return obj;
}

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email and password are required.');

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
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
    user: sanitizeUser(user),
  });
});

export const me = catchAsync(async (req, res) => {
  res.json({ success: true, user: sanitizeUser(req.user) });
});

export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    throw new ApiError(400, 'New password must be at least 6 characters.');
  }
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(401, 'Current password is incorrect.');
  }
  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: 'Password updated successfully.' });
});

export default { login, me, changePassword };
