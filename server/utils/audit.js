import AuditLog from '../models/AuditLog.js';

// Fire-and-forget audit write - never let an audit failure break the primary request.
export async function recordAudit({ req, action, entity, entityId, oldValue = null, newValue = null }) {
  try {
    await AuditLog.create({
      user: req?.user?._id,
      userName: req?.user?.name,
      action,
      entity,
      entityId,
      oldValue,
      newValue,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    });
  } catch (err) {
    console.error('[audit] failed to record audit log:', err.message);
  }
}

export default recordAudit;
