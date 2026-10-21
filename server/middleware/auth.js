import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import { userPermissions, permissionListHas } from '../services/permissionService.js';
import { FULL_ACCESS_ROLES } from '../config/permissions.js';

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
  if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
    throw new ApiError(401, 'Your password was changed. Please log in again.');
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

// Loads the caller's effective permission keys (from the DB-backed role matrix) onto req.permissions.
export const loadPermissions = catchAsync(async (req, res, next) => {
  if (!req.permissions) req.permissions = await userPermissions(req.user);
  next();
});

export function can(req, key) {
  return permissionListHas(req.permissions, key);
}

// Allows the request when the user holds ANY of the given permission keys.
export const requirePermission = (...keys) => catchAsync(async (req, res, next) => {
  if (!req.user) throw new ApiError(401, 'You are not logged in. Please log in to continue.');
  if (!req.permissions) req.permissions = await userPermissions(req.user);
  if (!keys.some((k) => can(req, k))) {
    throw new ApiError(403, 'You do not have access to this module.');
  }
  next();
});

export const requireModule = requirePermission;

// Applies the permission check to non-GET requests only (reference data stays readable for lookups).
export const requirePermissionForWrites = (...keys) => {
  const check = requirePermission(...keys);
  return (req, res, next) => (req.method === 'GET' ? next() : check(req, res, next));
};

// Editing or deleting existing records, user management, settings and roles are limited to administrators.
export const adminOnly = restrictTo(...FULL_ACCESS_ROLES);

export default { protect, restrictTo, requirePermission, requireModule, requirePermissionForWrites, loadPermissions, can, adminOnly };
