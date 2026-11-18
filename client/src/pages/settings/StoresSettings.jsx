import { useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import CrudManager from '../../components/CrudManager.jsx';
import { storeService } from '../../services/index.js';
import { Input, Select, ConfirmDialog } from '../../components/ui/index.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';

export function StoresSettings() {
  const { user } = useAuth();
  const canManage = isAdmin(user); // the API allows store updates for administrators only
  const [reloadKey, setReloadKey] = useState(0);
  const [statusTarget, setStatusTarget] = useState(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const isActive = (row) => row.isActive !== false;

  async function confirmStatusChange() {
    const next = !isActive(statusTarget);
    setSavingStatus(true);
    try {
      await storeService.update(statusTarget._id, { isActive: next });
      setReloadKey((k) => k + 1); // refetch so the list (and the Edit form) show the saved status
      toast.success(`${statusTarget.name} is now ${next ? 'Active' : 'Inactive'}.`);
      setStatusTarget(null);
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
        <span className={clsx('relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200', active ? 'bg-emerald-500' : 'bg-graphite-300')}>
          <span className={clsx('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', active && 'translate-x-4')} />
        </span>
        <span className={clsx('text-xs font-medium', active ? 'text-emerald-600' : 'text-graphite-500')}>{active ? 'Active' : 'Inactive'}</span>
      </button>
    );
  }

  const targetNext = statusTarget ? !isActive(statusTarget) : true;

  return (
    <>
      <CrudManager
        title="Store / Branch"
        entityLabel="Store"
        service={storeService}
        reloadKey={reloadKey}
        crumbs={[{ label: 'Settings', to: '/settings/system' }, { label: 'Store / Branch' }]}
        defaultValues={{ code: '', name: '', address: '', city: '', state: '', pincode: '', gstin: '', phone: '', isActive: true }}
        columns={[
          { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
          { key: 'name', header: 'Store', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'city', header: 'City' },
          { key: 'gstin', header: 'GSTIN', render: (r) => <span className="text-xs">{r.gstin || '-'}</span> },
          { key: 'isActive', header: 'Status', render: renderStatus },
        ]}
        fields={[
          { name: 'code', label: 'Store Code', required: true, component: Input },
          { name: 'name', label: 'Store Name', required: true, component: Input },
          { name: 'address', label: 'Address', component: Input },
          { name: 'city', label: 'City', component: Input },
          { name: 'state', label: 'State', component: Input },
          { name: 'pincode', label: 'Pincode', component: Input },
          { name: 'gstin', label: 'GSTIN', component: Input },
          { name: 'phone', label: 'Phone', component: Input },
          {
            name: 'isActive',
            render: (form, setForm) => (
              <Select
                label="Status"
                value={isActive(form) ? 'active' : 'inactive'}
                onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.value === 'active' }))}
              >
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
        title={targetNext ? 'Make store Active?' : 'Make store Inactive?'}
        description={statusTarget ? `${statusTarget.code} - ${statusTarget.name} will be marked ${targetNext ? 'Active' : 'Inactive'}.` : ''}
        confirmLabel={targetNext ? 'Make Active' : 'Make Inactive'}
      />
    </>
  );
}

export default StoresSettings;
