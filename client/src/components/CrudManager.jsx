import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, Button, Modal, SearchBox, ConfirmDialog, Textarea } from './ui/index.js';
import EditRequestDialog from './EditRequestDialog.jsx';
import { editRequestService } from '../services/index.js';
import { useFieldRules } from '../hooks/useFieldRules.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isAdmin } from '../utils/permissions.js';

// Generic list + create/edit modal + delete for straightforward master-data entities
// (Category, Brand, Store, DistributionCenter, Supplier, TaxRate...).
// reloadKey: optional; change it to refetch the list (e.g. after a row action done outside this component).
// requestEntity: server record type (e.g. 'Brand'); non-admin users then send change / removal requests to an admin.
export function CrudManager({ title, entityLabel, service, columns, fields, defaultValues = {}, searchable = true, extraActions, crumbs, reloadKey, requestEntity }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultValues);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const debouncedSearch = useDebounce(search);
  const { user } = useAuth();
  const canManage = isAdmin(user);
  const canRequest = !canManage && !!requestEntity;
  const { req } = useFieldRules();
  const [reason, setReason] = useState('');
  const [removeRequest, setRemoveRequest] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await service.list({ search: debouncedSearch, page, limit: 20 });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [debouncedSearch, page, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditing(null);
    setForm(defaultValues);
    setModalOpen(true);
  }
  function openEdit(row) {
    setEditing(row);
    setForm({ ...defaultValues, ...row });
    setReason('');
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing && canRequest) {
        const changes = {};
        fields.forEach((f) => { if (String(form[f.name] ?? '') !== String(editing[f.name] ?? '')) changes[f.name] = form[f.name]; });
        if (!Object.keys(changes).length) { toast.error('Change at least one value.'); return; }
        if (req('editRequest', 'reason') && !reason.trim()) { toast.error('Tell the administrator why this should change.'); return; }
        await editRequestService.create({ entity: requestEntity, entityId: editing._id, action: 'update', changes, reason: reason.trim() });
        toast.success('Change request sent to the administrator.');
      } else if (editing) {
        await service.update(editing._id, form);
        toast.success(`${entityLabel} updated.`);
      } else {
        await service.create(form);
        toast.success(`${entityLabel} created.`);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await service.remove(deleteTarget._id);
      toast.success(`${entityLabel} removed.`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const fullColumns = [
    ...columns,
    {
      key: 'actions', header: '', render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          {extraActions?.(row)}
          {canManage && (
            <>
              <button onClick={() => openEdit(row)} title="Edit" className="p-1.5 rounded-lg hover:bg-graphite-100 text-graphite-500"><Pencil size={14} /></button>
              <button onClick={() => setDeleteTarget(row)} title="Delete" className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 size={14} /></button>
            </>
          )}
          {canRequest && (
            <>
              <button onClick={() => openEdit(row)} title="Request a change (admin approval)" className="p-1.5 rounded-lg hover:bg-graphite-100 text-graphite-500"><Pencil size={14} /></button>
              <button onClick={() => setRemoveRequest(row)} title="Request removal (admin approval)" className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 size={14} /></button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={title} crumbs={crumbs} actions={<Button icon={Plus} onClick={openCreate}>Add {entityLabel}</Button>} />

      {searchable && (
        <div className="mb-4"><SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`Search ${entityLabel.toLowerCase()}s...`} className="max-w-sm" /></div>
      )}

      <DataTable
        columns={fullColumns}
        rows={rows}
        loading={loading}
        emptyTitle={`No ${entityLabel.toLowerCase()}s found.`}
        emptyAction={<Button icon={Plus} onClick={openCreate}>Add {entityLabel}</Button>}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
      />

      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? (canRequest ? `Request change: ${editing.name || entityLabel}` : `Edit ${entityLabel}`) : `Add ${entityLabel}`}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="crud-form" loading={saving}>{editing && canRequest ? 'Send to Admin' : 'Save'}</Button></>}
      >
        <form id="crud-form" onSubmit={handleSubmit} className="space-y-4">
          {fields.map((f) => (
            <div key={f.name}>
              {f.render ? f.render(form, setForm) : (
                <f.component
                  label={f.label}
                  required={f.required}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                  {...(f.props || {})}
                >
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </f.component>
              )}
            </div>
          ))}
          {editing && canRequest && (
            <Textarea label="Reason for the change (for the administrator)" required={req('editRequest', 'reason')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          )}
        </form>
      </Modal>

      {requestEntity && (
        <EditRequestDialog open={!!removeRequest} onClose={() => setRemoveRequest(null)} entity={requestEntity} record={removeRequest} action="delete" />
      )}

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={`Remove ${entityLabel}?`} description={`This will deactivate "${deleteTarget?.name}". This action can be reversed by an administrator.`} confirmLabel="Remove"
      />
    </div>
  );
}

export default CrudManager;
