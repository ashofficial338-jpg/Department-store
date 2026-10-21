import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input } from './ui/index.js';
import { authService } from '../services/index.js';

// Lets any signed-in user change their own password. The server signs out their other sessions.
export function ChangePasswordDialog({ open, onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setForm({ currentPassword: '', newPassword: '', confirm: '' }); setError(''); } }, [open]);

  const strong = form.newPassword.length >= 8 && /[A-Za-z]/.test(form.newPassword) && /[0-9]/.test(form.newPassword);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.currentPassword) return setError('Enter your current password.');
    if (!strong) return setError('Use at least 8 characters with a letter and a number.');
    if (form.newPassword !== form.confirm) return setError('The new passwords do not match.');
    if (form.newPassword === form.currentPassword) return setError('Choose a password different from the current one.');
    setSaving(true);
    try {
      const r = await authService.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success(r.message || 'Password updated.');
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
    return undefined;
  }

  return (
    <Modal
      open={open} onClose={saving ? undefined : onClose} title="Change password" size="sm"
      footer={(
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="change-password-form" loading={saving}>Update password</Button>
        </>
      )}
    >
      <form id="change-password-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} required />
        <Input label="New password" type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} required aria-describedby="pw-hint" />
        <p id="pw-hint" className={`text-xs -mt-2 ${form.newPassword && !strong ? 'text-amber-600' : ''}`} style={form.newPassword && !strong ? undefined : { color: 'var(--text-muted)' }}>
          At least 8 characters, including a letter and a number.
        </p>
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>For security, you will stay signed in here but signed out on your other devices.</p>
      </form>
    </Modal>
  );
}

export default ChangePasswordDialog;
