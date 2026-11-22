import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle, Undo2 } from 'lucide-react';
import { PageHeader, DataTable, Button, StatusBadge, Modal, Textarea } from '../components/ui/index.js';
import { FilterPanel, cleanParams } from '../components/ui/FilterPanel.jsx';
import { editRequestService, purchaseAnalysisService } from '../services/index.js';
import { formatDateTime, formatCurrency } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isAdmin, hasAnyPermission } from '../utils/permissions.js';
import { useFieldRules } from '../hooks/useFieldRules.js';

const ENTITY_LABEL = { Purchase: 'Purchase Order', Product: 'Product', Brand: 'Brand', Category: 'Category', Vendor: 'Vendor' };
const STATUS = [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'withdrawn', label: 'Withdrawn' }];
const ENTITY_OPTIONS = Object.entries(ENTITY_LABEL).map(([value, label]) => ({ value, label }));
const FIELD_LABEL = {
  name: 'Name', vendor: 'Supplier', notes: 'Notes', items: 'Lines', purchasePrice: 'Purchase price', sellingPrice: 'Selling price', mrp: 'MRP',
  gstRate: 'GST %', reorderLevel: 'Reorder level', status: 'Status', description: 'Description', parent: 'Parent', phone: 'Mobile', gstin: 'GSTIN', pan: 'PAN', address: 'Address',
};

// Readable value: ids become names (supplier / product / brand) where the lookup lists are available.
function useNames() {
  const [maps, setMaps] = useState({ vendors: new Map(), products: new Map(), brands: new Map() });
  const { user } = useAuth();
  useEffect(() => {
    if (!hasAnyPermission(user, ['reports', 'purchasing'])) return;
    purchaseAnalysisService.options().then((r) => setMaps({
      vendors: new Map(r.data.vendors.map((x) => [x._id, x.name])),
      products: new Map(r.data.products.map((x) => [x._id, x.name])),
      brands: new Map(r.data.brands.map((x) => [x._id, x.name])),
    })).catch(() => {});
  }, [user]);
  return maps;
}

function ItemsTable({ items, names }) {
  const n = (v) => Number(v) || 0;
  const total = items.reduce((s, i) => s + n(i.quantity) * n(i.unitPrice) * (1 + n(i.gstRate) / 100), 0);
  return (
    <table className="w-full text-xs mt-1">
      <thead><tr style={{ color: 'var(--text-muted)' }}><th className="text-left">Product</th><th className="text-left">Brand</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
      <tbody>
        {items.map((i, k) => (
          <tr key={k} style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <td>{names.products.get(String(i.product)) || String(i.product)}</td>
            <td>{i.brand ? (names.brands.get(String(i.brand)) || String(i.brand)) : '-'}</td>
            <td className="text-right">{i.quantity}</td>
            <td className="text-right">{formatCurrency(i.unitPrice || 0)}</td>
            <td className="text-right">{formatCurrency(n(i.quantity) * n(i.unitPrice) * (1 + n(i.gstRate) / 100))}</td>
          </tr>
        ))}
        <tr style={{ borderTop: '1px solid var(--border-subtle)' }}><td colSpan={4} className="text-right font-semibold">Total</td><td className="text-right font-semibold">{formatCurrency(total)}</td></tr>
      </tbody>
    </table>
  );
}

function show(field, value, names) {
  if (value === undefined || value === null || value === '') return <span style={{ color: 'var(--text-muted)' }}>-</span>;
  if (field === 'vendor') return names.vendors.get(String(value)) || String(value);
  if (field === 'items' && Array.isArray(value)) return <ItemsTable items={value} names={names} />;
  if (typeof value === 'object') return <code className="text-xs">{JSON.stringify(value)}</code>;
  return String(value);
}

export function EditRequests() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const names = useNames();
  const { req } = useFieldRules();
  const empty = useMemo(() => ({ search: '', status: admin ? 'pending' : '', entity: '', from: '', to: '', order: 'desc' }), [admin]);
  const [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    editRequestService.list(cleanParams({ ...filters, page, limit: 25 }))
      .then((r) => { setRows(r.data); setPagination(r.pagination); setSummary(r.summary); })
      .catch((err) => toast.error(err.message)).finally(() => setLoading(false));
  }
  useEffect(() => { const t = setTimeout(load, filters.search ? 300 : 0); return () => clearTimeout(t); }, [filters, page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(kind) {
    setBusy(true);
    try {
      if (kind === 'approve') await editRequestService.approve(detail._id, { remarks: remarks || undefined });
      if (kind === 'reject') {
        if (req('editRequest', 'rejectRemarks') && !remarks.trim()) { toast.error('Give a reason for rejecting.'); setBusy(false); return; }
        await editRequestService.reject(detail._id, { remarks });
      }
      if (kind === 'withdraw') await editRequestService.withdraw(detail._id);
      toast.success({ approve: 'Approved - the change has been applied.', reject: 'Request rejected.', withdraw: 'Request withdrawn.' }[kind]);
      setDetail(null); setRemarks('');
      load();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }

  const fieldsOf = (r) => Object.keys(r.changes || {});

  return (
    <div>
      <PageHeader title="Edit Requests" crumbs={[{ label: 'Edit Requests' }]} />
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        {admin
          ? 'Changes and removals asked for by other users. Approving applies the change immediately; every step is kept in the record history.'
          : 'Existing records can only be changed by an administrator. Requests you send from Purchase Orders, Products, Brands and Categories are listed here.'}
      </p>

      {summary && (
        <div className="flex flex-wrap gap-2 mb-3">
          {STATUS.map((st) => (
            <button key={st.value} type="button" onClick={() => { setFilters((f) => ({ ...f, status: f.status === st.value ? '' : st.value })); setPage(1); }}
              className="px-3 h-8 rounded-full border text-xs font-medium"
              style={{ borderColor: filters.status === st.value ? 'var(--gold-500, #6366f1)' : 'var(--border-subtle)', background: filters.status === st.value ? 'var(--gold-tint)' : 'transparent' }}>
              {st.label}: {summary[st.value] || 0}
            </button>
          ))}
        </div>
      )}

      <FilterPanel value={filters} onChange={(v) => { setFilters(v); setPage(1); }} onReset={() => { setFilters(empty); setPage(1); }}
        searchPlaceholder="Search record, reason or person..." primary={3}
        sortOptions={[{ value: '', label: 'Date' }]}
        fields={[
          { key: 'entity', label: 'Record type', type: 'select', options: ENTITY_OPTIONS },
          { key: 'status', label: 'Status', type: 'select', options: STATUS },
          { label: 'Requested on', type: 'dateRange', minKey: 'from', maxKey: 'to' },
        ]} />

      <DataTable
        loading={loading} rows={rows} onRowClick={(r) => { setDetail(r); setRemarks(''); }}
        emptyTitle={filters.status === 'pending' ? 'No requests waiting.' : 'No edit requests found.'}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'createdAt', header: 'Requested', render: (r) => <span className="text-xs">{formatDateTime(r.createdAt)}</span> },
          { key: 'entity', header: 'Record', render: (r) => <span><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{ENTITY_LABEL[r.entity]}</span> <strong>{r.entityLabel}</strong></span> },
          { key: 'action', header: 'Request', render: (r) => (r.action === 'delete' ? 'Remove / cancel' : `Change ${fieldsOf(r).map((f) => FIELD_LABEL[f] || f).join(', ')}`) },
          { key: 'requestedByName', header: 'Requested by' },
          { key: 'reason', header: 'Reason', render: (r) => <span className="text-xs block max-w-[260px] truncate" title={r.reason}>{r.reason}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'reviewedByName', header: 'Reviewed by', render: (r) => (r.reviewedByName ? <span className="text-xs">{r.reviewedByName}</span> : '-') },
        ]}
      />

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg"
        title={detail ? `${ENTITY_LABEL[detail.entity]}: ${detail.entityLabel}` : ''}
        footer={detail?.status === 'pending' && (
          <>
            {admin && <Button variant="outline" icon={XCircle} onClick={() => act('reject')} loading={busy}>Reject</Button>}
            {admin && <Button icon={CheckCircle2} onClick={() => act('approve')} loading={busy}>Approve &amp; Apply</Button>}
            {!admin && String(detail.requestedBy) === String(user?._id || user?.id) && <Button variant="outline" icon={Undo2} onClick={() => act('withdraw')} loading={busy}>Withdraw</Button>}
          </>
        )}
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span>{detail.action === 'delete' ? 'Asked to remove / cancel this record' : 'Asked to change this record'} &middot; by <strong>{detail.requestedByName}</strong> on {formatDateTime(detail.createdAt)}</span>
              <StatusBadge status={detail.status} />
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-surface-muted)' }}><span style={{ color: 'var(--text-muted)' }}>Reason: </span>{detail.reason}</div>
            {detail.action === 'update' && (
              <table className="w-full text-sm">
                <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1 w-32">Field</th><th className="text-left">Now</th><th className="text-left">Requested</th></tr></thead>
                <tbody>
                  {fieldsOf(detail).map((f) => (
                    <tr key={f} className="align-top" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-1.5 font-medium">{FIELD_LABEL[f] || f}</td>
                      <td className="py-1.5 pr-2">{show(f, detail.before?.[f], names)}</td>
                      <td className="py-1.5">{show(f, detail.changes[f], names)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {detail.status !== 'pending' && detail.reviewedByName && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{detail.status === 'approved' ? 'Approved' : 'Rejected'} by {detail.reviewedByName} on {formatDateTime(detail.reviewedAt)}{detail.reviewRemarks ? ` - ${detail.reviewRemarks}` : ''}</p>
            )}
            {admin && detail.status === 'pending' && (
              <Textarea label={req('editRequest', 'rejectRemarks') ? 'Remarks (required to reject)' : 'Remarks (optional)'} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default EditRequests;
