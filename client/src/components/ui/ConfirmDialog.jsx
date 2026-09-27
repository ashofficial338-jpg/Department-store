import { AlertTriangle } from 'lucide-react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

export function ConfirmDialog({ open, onClose, onConfirm, title = 'Are you sure?', description, confirmLabel = 'Confirm', danger = true, loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      )}
    >
      <div className="flex gap-3">
        <span className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
          <AlertTriangle size={18} />
        </span>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
