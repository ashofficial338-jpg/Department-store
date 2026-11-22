import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Textarea, Input, Select } from './ui/index.js';
import { editRequestService } from '../services/index.js';
import { useFieldRules } from '../hooks/useFieldRules.js';

// Non-admin users cannot change existing records; they send the change to an administrator for approval.
// - action 'delete': only a reason is asked.
// - action 'update' with `changes`: the proposed values were already entered elsewhere (e.g. the PO form).
// - action 'update' with `fields`: a small form of the editable fields, prefilled from `record`.
// fields: [{ name, label, type: 'text' | 'number' | 'select', options }]
export function EditRequestDialog({ open, onClose, entity, record, action = 'update', changes, fields, title, onSent }) {
  const [reason, setReason] = useState('');
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { req } = useFieldRules();
  const reasonNeeded = req('editRequest', 'reason');

  useEffect(() => {
    if (!open) return;
    setReason('');
    const init = {};
    (fields || []).forEach((f) => { init[f.name] = record?.[f.name] && typeof record[f.name] === 'object' ? record[f.name]._id : (record?.[f.name] ?? ''); });
    setForm(init);
  }, [open, record, fields]);

  async function submit(e) {
    e.preventDefault();
    let proposed = changes;
    if (action === 'update' && !changes) {
      proposed = {};
      (fields || []).forEach((f) => {
        const before = record?.[f.name] && typeof record[f.name] === 'object' ? record[f.name]._id : (record?.[f.name] ?? '');
        if (String(form[f.name] ?? '') !== String(before ?? '')) proposed[f.name] = f.type === 'number' && form[f.name] !== '' ? Number(form[f.name]) : form[f.name];
      });
      if (!Object.keys(proposed).length) { toast.error('Change at least one value.'); return; }
    }
    if (reasonNeeded && !reason.trim()) { toast.error('Tell the administrator what should change and why.'); return; }
    setSaving(true);
    try {
      await editRequestService.create({ entity, entityId: record._id, action, changes: action === 'update' ? proposed : undefined, reason: reason.trim() });
      toast.success('Request sent to the administrator for approval.');
      onSent?.();
      onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  const label = record?.poNumber || record?.name || '';
  return (
    <Modal open={open} onClose={onClose} size="sm"
      title={title || (action === 'delete' ? `Request removal${label ? `: ${label}` : ''}` : `Request change${label ? `: ${label}` : ''}`)}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="edit-request-form" loading={saving}>Send to Admin</Button></>}
    >
      <form id="edit-request-form" onSubmit={submit} className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Only an administrator can {action === 'delete' ? 'remove' : 'change'} existing records. Your request is applied once an administrator approves it.
        </p>
        {action === 'update' && !changes && (fields || []).map((f) => (f.type === 'select'
          ? (
            <Select key={f.name} label={f.label} value={form[f.name] ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}>
              {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )
          : <Input key={f.name} label={f.label} type={f.type === 'number' ? 'number' : 'text'} step="any" value={form[f.name] ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))} />))}
        <Textarea label={reasonNeeded ? 'Reason / details for the administrator' : 'Reason / details for the administrator (optional)'} required={reasonNeeded} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </form>
    </Modal>
  );
}

export default EditRequestDialog;
