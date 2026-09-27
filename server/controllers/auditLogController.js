import AuditLog from '../models/AuditLog.js';
import catchAsync from '../utils/catchAsync.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';

export const listAuditLogs = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.entity) filter.entity = req.query.entity;
  if (req.query.user) filter.user = req.query.user;
  if (req.query.action) filter.action = new RegExp(req.query.action, 'i');
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  const [docs, total] = await Promise.all([
    AuditLog.find(filter).populate('user', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export default { listAuditLogs };
