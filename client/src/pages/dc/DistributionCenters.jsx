import { useState } from 'react';
import toast from 'react-hot-toast';
import CrudManager from '../../components/CrudManager.jsx';
import { dcMasterService } from '../../services/index.js';
import { Input, Select, ConfirmDialog } from '../../components/ui/index.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';

// DC Management > Distribution Centers: create, edit and activate / deactivate DCs.
// Anyone with the DC module can add a DC; editing and status changes are for administrators (the API enforces this).
// Inactive DCs are hidden from every DC dropdown and refused for new work by the API; their history stays.
export function DistributionCenters() {
  const { user } = useAuth();
  const canManage = isAdmin(user);
  const [reloadKey, setReloadKey] = useState(0);
  const [statusTarget, setStatusTarget] = useState(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const isActive = (row) => row.status !== 'inactive';
  const targetNext = statusTarget ? !isActive(statusTarget) : true;

  async function confirmStatusChange() {
    const next = !isActive(statusTarget);
    setSavingStatus(true);
    try {
      await dcMasterService.update(statusTarget._id, { status: next ? 'active' : 'inactive' });
      toast.success(`${statusTarget.name} is now ${next ? 'Active' : 'Inactive'}.`);
      setStatusTarget(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingStatus(false);
    }
  }

  function renderStatus(row) {
    const active = isActive(row);
    if (!canManage) return <StatusBadge status={active ? 'active' : 'inactive'} />;
    return (
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`${row.name}: ${active ? 'Active' : 'Inactive'}. Click to change.`}
        title={active ? 'Click to make Inactive' : 'Click to make Active'}
        onClick={() => setStatusTarget(row)}
        className="inline-flex items-center gap-2"
      >
        <span className={`switch-track ${active ? 'is-on' : ''}`}><span className="switch-thumb" /></span>
        <span className="text-xs font-medium" style={{ color: active ? 'var(--status-success)' : 'var(--text-muted)' }}>{active ? 'Active' : 'Inactive'}</span>
      </button>
    );
  }

  return (
    <>
      <CrudManager
        title="Distribution Centers"
        entityLabel="Distribution Center"
        service={dcMasterService}
        reloadKey={reloadKey}
        crumbs={[{ label: 'DC Management', to: '/dc/inward' }, { label: 'Distribution Centers' }]}
        defaultValues={{ code: '', name: '', address: '', city: '', state: '', contactPhone: '', contactEmail: '', status: 'active' }}
        columns={[
          { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
          { key: 'name', header: 'Distribution Center', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'city', header: 'City', render: (r) => r.city || '-' },
          { key: 'state', header: 'State', render: (r) => r.state || '-' },
          { key: 'contactPhone', header: 'Phone', render: (r) => r.contactPhone || '-' },
          { key: 'status', header: 'Status', render: renderStatus },
        ]}
        fields={[
          { name: 'code', label: 'DC Code (e.g. DC03)', required: true, component: Input },
          { name: 'name', label: 'Distribution Center Name', required: true, component: Input },
          { name: 'address', label: 'Address', component: Input },
          { name: 'city', label: 'City', component: Input },
          { name: 'state', label: 'State', component: Input },
          { name: 'contactPhone', label: 'Contact Phone', component: Input },
          { name: 'contactEmail', label: 'Contact Email', component: Input, props: { type: 'email' } },
          {
            name: 'status',
            render: (form, setForm) => (
              <Select label="Status" value={form.status || 'active'} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={confirmStatusChange}
        loading={savingStatus}
        danger={!targetNext}
        title={targetNext ? 'Make distribution center Active?' : 'Make distribution center Inactive?'}
        description={statusTarget ? `${statusTarget.code} - ${statusTarget.name} will be marked ${targetNext ? 'Active' : 'Inactive'}.${targetNext ? '' : ' It will be hidden from DC dropdowns; its history stays.'}` : ''}
        confirmLabel={targetNext ? 'Make Active' : 'Make Inactive'}
      />
    </>
  );
}

export default DistributionCenters;
