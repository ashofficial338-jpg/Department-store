import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import { roleHasModule } from '../config/permissions.js';

export const protect = catchAsync(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new ApiError(401, 'You are not logged in. Please log in to continue.');
  }
  const token = header.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ApiError(401, 'Invalid or expired session. Please log in again.');
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    throw new ApiError(401, 'This account is no longer active.');
  }
  req.user = user;
  next();
});

export const restrictTo = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    throw new ApiError(403, 'You do not have permission to perform this action.');
  }
  next();
};

export const requireModule = (moduleKey) => (req, res, next) => {
  if (!req.user || !roleHasModule(req.user.role, moduleKey)) {
    throw new ApiError(403, 'You do not have access to this module.');
  }
  next();
};

// Editing or deleting existing records is limited to administrators.
export const adminOnly = restrictTo('super_admin', 'admin');

export default { protect, restrictTo, requireModule, adminOnly };
