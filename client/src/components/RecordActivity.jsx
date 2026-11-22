import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { editRequestService } from '../services/index.js';
import { formatDateTime } from '../utils/format.js';

// Who created, changed, requested and approved a record (audit log of that record).
const ACTION_LABEL = {
  create: 'Created', update: 'Modified', price_change: 'Price changed', cancel: 'Cancelled', delete: 'Removed', discontinue: 'Removed',
  approve: 'Approved', pay: 'Payment recorded', verify: 'Verification changed',
};
function describe(action) {
  const [area, verb] = String(action).split('.');
  if (area === 'edit_request') {
    return { create: 'Requested a change', approve: 'Approved a change request', reject: 'Rejected a change request', withdraw: 'Withdrew a change request' }[verb] || action;
  }
  return ACTION_LABEL[verb] || action.replace(/[._]/g, ' ');
}

export function RecordActivity({ entity, id }) {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    if (!id) return;
    setLogs(null);
    editRequestService.activity(entity, id).then((r) => setLogs(r.data.logs)).catch(() => setLogs([]));
  }, [entity, id]);

  return (
    <div className="text-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}><History size={13} /> Activity</div>
      {logs === null && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {logs?.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No activity recorded.</p>}
      {logs?.map((l) => (
        <div key={l._id} className="flex justify-between gap-3 py-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <span>{describe(l.action)}{l.newValue?.reason ? <span style={{ color: 'var(--text-muted)' }}> - {l.newValue.reason}</span> : null}{l.newValue?.remarks ? <span style={{ color: 'var(--text-muted)' }}> - {l.newValue.remarks}</span> : null}</span>
          <span className="whitespace-nowrap text-xs" style={{ color: 'var(--text-muted)' }}>{l.userName || '-'} &middot; {formatDateTime(l.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

export default RecordActivity;
