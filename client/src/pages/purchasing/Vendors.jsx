import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, ShieldCheck, Trash2, Upload, FileText, Eye, CheckCircle2, AlertCircle, History, Building2, Phone, Mail, MapPin, Landmark, ArrowUpDown,
} from 'lucide-react';
import { PageHeader, DataTable, Button, Modal, SearchBox, Input, Select, Textarea, ConfirmDialog } from '../../components/ui/index.js';
import { VendorStatusBadge, VENDOR_STATUS } from '../../components/vendors/VendorStatus.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin, hasPermission } from '../../utils/permissions.js';
import { vendorService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { validateVendor } from '../../utils/vendorValidation.js';
import { useFieldRules } from '../../hooks/useFieldRules.js';

const DOC_TYPES = [
  // All documents are optional - a vendor can be verified on its details alone.
  { key: 'gst_certificate', label: 'GST Certificate', required: false },
  { key: 'pan_card', label: 'PAN Card', required: false },
  { key: 'business_registration', label: 'Business Registration Certificate', required: false },
  { key: 'bank_proof', label: 'Bank Proof (cancelled cheque / passbook)', required: false },
];
const TABS = [
  { key: '', label: 'All Vendors' },
  { key: 'pending', label: 'Pending Verification' },
  { key: 'verified', label: 'Verified' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'rejected', label: 'Rejected' },
];
const SORTS = [
  { key: 'createdAt:desc', label: 'Newest first' },
  { key: 'createdAt:asc', label: 'Oldest first' },
  { key: 'name:asc', label: 'Name A–Z' },
  { key: 'name:desc', label: 'Name Z–A' },
  { key: 'updatedAt:desc', label: 'Recently updated' },
  { key: 'verificationStatus:asc', label: 'Verification status' },
];
const HISTORY_LABEL = {
  registered: 'Registered', details_updated: 'Details updated', document_uploaded: 'Document uploaded',
  document_removed: 'Document removed', status_changed: 'Status changed',
};
const EMPTY = {
  name: '', companyName: '', contactPerson: '', phone: '', alternatePhone: '', email: '',
  address: '', city: '', state: '', pincode: '', gstin: '', pan: '', paymentTerms: 'Net 30', creditLimit: '', status: 'active',
  bankDetails: { accountName: '', accountNumber: '', ifsc: '', bankName: '', branch: '' },
};
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Section({ title, icon: Icon, children }) {
  return (
    <fieldset className="rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
      <legend className="px-1.5 text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
        {Icon && <Icon size={15} className="text-gold-600" />}{title}
      </legend>
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
    </fieldset>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`text-sm mt-0.5 break-words ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-primary)' }}>{value || '—'}</div>
    </div>
  );
}

export function Vendors() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const canEdit = hasPermission(user, 'vendors');

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const [active, setActive] = useState('');
  const debounced = useDebounce(search);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('details');
  const [uploading, setUploading] = useState(null);
  const [removeDoc, setRemoveDoc] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [checklist, setChecklist] = useState([]);
  const [decision, setDecision] = useState('verified');
  const [remarks, setRemarks] = useState('');
  const { req } = useFieldRules();
  const [verifying, setVerifying] = useState(false);

  async function load() {
    setLoading(true);
    const [sortKey, order] = sort.split(':');
    try {
      const r = await vendorService.list({
        page, limit: 20, search: debounced || undefined, verificationStatus: tab || undefined, status: active || undefined, sort: sortKey, order,
      });
      setRows(r.data); setPagination(r.pagination); setSummary(r.summary || {});
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [page, debounced, tab, sort, active]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openDetail(row, tabName = 'details') {
    try {
      const r = await vendorService.getOne(row._id);
      setDetail(r.data);
      setDetailTab(tabName);
    } catch (err) { toast.error(err.message); }
  }
  const refreshDetail = (vendor) => { setDetail(vendor); load(); };

  // ---------- register / edit ----------
  function openCreate() { setEditing(null); setForm(EMPTY); setErrors({}); setFormOpen(true); }
  function openEdit(v) {
    setEditing(v);
    setForm({
      ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, v[k] ?? EMPTY[k]])),
      creditLimit: v.creditLimit ?? '', bankDetails: { ...EMPTY.bankDetails, ...(v.bankDetails || {}) },
    });
    setErrors({});
    setFormOpen(true);
  }
  const clearErr = (k) => setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x));
  const setF = (k, upper = false) => (e) => { const v = upper ? e.target.value.toUpperCase() : e.target.value; setForm((f) => ({ ...f, [k]: v })); clearErr(k); };
  const setB = (k, upper = false) => (e) => { const v = upper ? e.target.value.toUpperCase() : e.target.value; setForm((f) => ({ ...f, bankDetails: { ...f.bankDetails, [k]: v } })); clearErr(`bankDetails.${k}`); };
  const focusField = (k) => setTimeout(() => document.querySelector(`[data-field="${k}"]`)?.focus(), 0);

  async function saveVendor(e) {
    e.preventDefault();
    // Check here first: a wrong value is shown under its box instead of failing on the server.
    const found = validateVendor(form, req);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) { toast.error(found[first]); focusField(first); return; }
    setSaving(true);
    try {
      const body = { ...form, creditLimit: form.creditLimit === '' ? 0 : Number(form.creditLimit) };
      if (editing) {
        const r = await vendorService.update(editing._id, body);
        toast.success(r.data.verificationStatus !== editing.verificationStatus ? 'Saved. Key details changed – the vendor needs re-verification.' : 'Vendor updated.');
        setFormOpen(false);
        if (detail?._id === editing._id) refreshDetail(r.data); else load();
      } else {
        const r = await vendorService.create(body);
        toast.success('Vendor registered – Pending Verification. You can upload documents now (optional).');
        setFormOpen(false);
        load();
        openDetail(r.data, 'documents');
      }
    } catch (err) {
      toast.error(err.message);
      const field = err.details?.field;
      if (field) { setErrors((x) => ({ ...x, [field]: err.message })); focusField(field); }
    } finally { setSaving(false); }
  }

  // ---------- documents ----------
  async function uploadDoc(docType, file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('File is larger than 5 MB.'); return; }
    setUploading(docType);
    try {
      const r = await vendorService.uploadDocument(detail._id, docType, file);
      toast.success('Document uploaded.');
      refreshDetail(r.data);
    } catch (err) { toast.error(err.message); } finally { setUploading(null); }
  }
  async function viewDoc(doc) {
    const win = window.open('', '_blank');
    try {
      const blob = await vendorService.documentBlob(detail._id, doc._id);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url; else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { win?.close(); toast.error(err.message); }
  }
  async function confirmRemoveDoc() {
    try {
      const r = await vendorService.removeDocument(detail._id, removeDoc._id);
      toast.success('Document removed.');
      setRemoveDoc(null);
      refreshDetail(r.data);
    } catch (err) { toast.error(err.message); }
  }

  // ---------- verification ----------
  async function openVerify() {
    try {
      const r = await vendorService.checklist(detail._id);
      setChecklist(r.data);
      setDecision(r.data.every((c) => c.ok || c.optional) ? 'verified' : 'on_hold');
      setRemarks('');
      setVerifyOpen(true);
    } catch (err) { toast.error(err.message); }
  }
  async function submitVerify() {
    setVerifying(true);
    try {
      const r = await vendorService.verify(detail._id, { status: decision, remarks });
      toast.success(`Vendor marked ${VENDOR_STATUS[decision].label}.`);
      setVerifyOpen(false);
      refreshDetail(r.data);
    } catch (err) { toast.error(err.message); } finally { setVerifying(false); }
  }
  async function confirmDelete() {
    try {
      const r = await vendorService.remove(deleteTarget._id);
      toast.success(r.message || 'Vendor deleted.');
      setDeleteTarget(null);
      setDetail(null);
      load();
    } catch (err) { toast.error(err.message); }
  }

  const ready = checklist.length > 0 && checklist.every((c) => c.ok || c.optional);
  const docOf = (key) => detail?.documents?.find((d) => d.docType === key);

  return (
    <div>
      <PageHeader
        title="Vendor Management"
        subtitle="Register vendors, collect their documents and verify them. Only verified vendors can be used for purchase orders, purchase invoices and vendor payments."
        crumbs={[{ label: 'Purchasing', to: '/purchasing/orders' }, { label: 'Vendor Management' }]}
        actions={canEdit && <Button icon={Plus} onClick={openCreate}>Register Vendor</Button>}
      />

      {/* Status tabs with counts */}
      <div className="flex flex-wrap gap-2 mb-4" role="tablist">
        {TABS.map((t) => {
          const count = t.key ? summary[t.key] : summary.all;
          const on = tab === t.key;
          return (
            <button key={t.key || 'all'} role="tab" aria-selected={on} onClick={() => { setTab(t.key); setPage(1); }}
              className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-medium border transition-colors ${on ? 'bg-gold-600 text-white border-transparent shadow-sm' : 'hover:bg-[var(--bg-surface-muted)]'}`}
              style={on ? {} : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)', background: 'var(--bg-surface)' }}>
              {t.label}
              <span className={`min-w-6 h-5 px-1.5 rounded-full text-xs grid place-items-center ${on ? 'bg-white/25' : 'bg-[var(--bg-surface-muted)]'}`}>{count ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, GSTIN, PAN, phone, city..." className="w-full sm:w-80" />
        <div className="flex items-center gap-2 ml-auto">
          <select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }} aria-label="Active filter"
            className="h-10 rounded-lg border px-3 text-sm bg-[var(--bg-surface)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
            <option value="">Active & inactive</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
          <label className="relative">
            <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort vendors"
              className="h-10 rounded-lg border pl-8 pr-3 text-sm bg-[var(--bg-surface)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        onRowClick={(r) => openDetail(r)}
        emptyTitle={search || tab ? 'No vendors match.' : 'No vendors yet.'}
        emptyDescription={!search && !tab ? 'Register your first vendor to start purchasing.' : undefined}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          {
            key: 'name', header: 'Vendor', render: (r) => (
              <div className="min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{r.name}</span>
                  <VendorStatusBadge status={r.verificationStatus} compact />
                  {r.status === 'inactive' && <span className="text-[11px] px-1.5 rounded bg-[var(--bg-surface-muted)]" style={{ color: 'var(--text-muted)' }}>Inactive</span>}
                </div>
                {r.companyName && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{r.companyName}</div>}
              </div>
            ),
          },
          { key: 'contact', header: 'Contact', render: (r) => <div><div>{r.contactPerson || '—'}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.phone}</div></div> },
          { key: 'gstin', header: 'GSTIN / PAN', render: (r) => <div className="font-mono text-xs"><div>{r.gstin || '—'}</div><div style={{ color: 'var(--text-muted)' }}>{r.pan || '—'}</div></div> },
          { key: 'city', header: 'City', render: (r) => r.city || '—' },
          {
            key: 'docs', header: 'Documents', render: (r) => {
              const n = DOC_TYPES.filter((d) => r.documents?.some((x) => x.docType === d.key)).length;
              return <span className={`inline-flex items-center gap-1 text-xs font-medium ${n === 4 ? 'text-emerald-600' : ''}`} style={n === 4 ? {} : { color: 'var(--text-secondary)' }}><FileText size={13} />{n ? `${n} uploaded` : 'None'}</span>;
            },
          },
          { key: 'verificationStatus', header: 'Verification', render: (r) => <VendorStatusBadge status={r.verificationStatus} /> },
          { key: 'updatedAt', header: 'Updated', render: (r) => formatDate(r.updatedAt) },
        ]}
      />

      {/* ---------- Register / edit form ---------- */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.name}` : 'Register Vendor'} size="lg"
        footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="vendor-form" loading={saving}>{editing ? 'Save Changes' : 'Register Vendor'}</Button></>}
      >
        <form id="vendor-form" onSubmit={saveVendor} noValidate className="space-y-4">
          {editing?.verificationStatus === 'verified' && (
            <div className="flex gap-2 p-3 rounded-lg text-sm" style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> Changing the name, GSTIN, PAN or bank details sends this vendor back for verification.
            </div>
          )}
          <Section title="Vendor" icon={Building2}>
            <Input label="Vendor name" required data-field="name" error={errors.name} value={form.name} onChange={setF('name')} maxLength={120} />
            <Input label="Company / legal name" value={form.companyName} onChange={setF('companyName')} maxLength={160} />
          </Section>
          <Section title="Contact details" icon={Phone}>
            <Input label="Contact person" required={req('vendor', 'contactPerson')} value={form.contactPerson} onChange={setF('contactPerson')} />
            <Input label="Mobile number" required={req('vendor', 'phone')} data-field="phone" error={errors.phone} inputMode="tel" placeholder="e.g. 93000 00059" value={form.phone} onChange={setF('phone')} maxLength={16} hint={!errors.phone ? '10 digits; +91 or spaces are fine' : undefined} />
            <Input label="Alternate number" data-field="alternatePhone" error={errors.alternatePhone} inputMode="tel" value={form.alternatePhone} onChange={setF('alternatePhone')} maxLength={16} />
            <Input label="Email" required={req('vendor', 'email')} type="text" inputMode="email" data-field="email" error={errors.email} value={form.email} onChange={setF('email')} />
          </Section>
          <Section title="Address" icon={MapPin}>
            <div className="sm:col-span-2"><Textarea label="Address" required={req('vendor', 'address')} value={form.address} onChange={setF('address')} rows={2} /></div>
            <Input label="City" required={req('vendor', 'city')} value={form.city} onChange={setF('city')} />
            <Input label="State" value={form.state} onChange={setF('state')} />
            <Input label="PIN code" required={req('vendor', 'pincode')} data-field="pincode" error={errors.pincode} inputMode="numeric" value={form.pincode} onChange={setF('pincode')} maxLength={7} />
          </Section>
          <Section title="Tax registration" icon={FileText}>
            <Input label="GSTIN" required={req('vendor', 'gstin')} data-field="gstin" error={errors.gstin} placeholder="33ABCDE1234F1Z5" value={form.gstin} onChange={setF('gstin', true)} maxLength={20} className="font-mono" hint="15 characters (optional)" />
            <Input label="PAN number" required={req('vendor', 'pan')} data-field="pan" error={errors.pan} placeholder="ABCDE1234F" value={form.pan} onChange={setF('pan', true)} maxLength={14} className="font-mono" hint="Must match characters 3–12 of the GSTIN" />
          </Section>
          <Section title="Bank account" icon={Landmark}>
            <Input label="Account holder name" value={form.bankDetails.accountName} onChange={setB('accountName')} />
            <Input label="Account number" required={req('vendor', 'bankAccount')} data-field="bankDetails.accountNumber" error={errors['bankDetails.accountNumber']} inputMode="numeric" value={form.bankDetails.accountNumber} onChange={setB('accountNumber')} maxLength={24} className="font-mono" />
            <Input label="IFSC code" required={req('vendor', 'ifsc')} data-field="bankDetails.ifsc" error={errors['bankDetails.ifsc']} placeholder="SBIN0001234" value={form.bankDetails.ifsc} onChange={setB('ifsc', true)} maxLength={14} className="font-mono" />
            <Input label="Bank name" value={form.bankDetails.bankName} onChange={setB('bankName')} />
            <Input label="Branch" value={form.bankDetails.branch} onChange={setB('branch')} />
          </Section>
          <Section title="Terms">
            <Select label="Payment terms" value={form.paymentTerms} onChange={setF('paymentTerms')}>
              {['Immediate', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'].map((t) => <option key={t}>{t}</option>)}
            </Select>
            <Input label="Credit limit (₹)" data-field="creditLimit" error={errors.creditLimit} type="number" min="0" value={form.creditLimit} onChange={setF('creditLimit')} />
            {editing && (
              <Select label="Status" value={form.status} onChange={setF('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            )}
          </Section>
        </form>
      </Modal>

      {/* ---------- Vendor detail ---------- */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <VendorStatusBadge status={detail.verificationStatus} />
                {detail.verifiedAt && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Verified on {formatDateTime(detail.verifiedAt)}{detail.verifiedBy?.name ? ` by ${detail.verifiedBy.name}` : ''}</span>}
                {detail.status === 'inactive' && <span className="text-xs font-medium" style={{ color: 'var(--status-danger)' }}>Inactive</span>}
              </div>
              <div className="flex gap-2">
                {canEdit && <Button size="sm" variant="outline" icon={Pencil} onClick={() => openEdit(detail)}>Edit</Button>}
                {admin && <Button size="sm" icon={ShieldCheck} onClick={openVerify}>Verify / Change Status</Button>}
                {admin && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleteTarget(detail)} aria-label="Delete vendor" />}
              </div>
            </div>
            {detail.lastRemarks && detail.verificationStatus !== 'verified' && (
              <div className="p-3 rounded-lg text-sm" style={{ background: `var(${VENDOR_STATUS[detail.verificationStatus]?.bg})`, color: `var(${VENDOR_STATUS[detail.verificationStatus]?.fg})` }}>
                <strong>Remarks:</strong> {detail.lastRemarks}
              </div>
            )}

            <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border-subtle)' }} role="tablist">
              {[['details', 'Details'], ['documents', `Documents (${detail.documents.length})`], ['history', 'Verification History']].map(([k, label]) => (
                <button key={k} role="tab" aria-selected={detailTab === k} onClick={() => setDetailTab(k)}
                  className={`px-3 h-9 text-sm font-medium -mb-px border-b-2 transition-colors ${detailTab === k ? 'border-gold-600 text-gold-700' : 'border-transparent hover:text-[var(--text-primary)]'}`}
                  style={detailTab === k ? {} : { color: 'var(--text-muted)' }}>{label}</button>
              ))}
            </div>

            {detailTab === 'details' && (
              <div className="grid sm:grid-cols-3 gap-4">
                <Detail label="Company" value={detail.companyName} />
                <Detail label="Contact person" value={detail.contactPerson} />
                <Detail label="Mobile" value={[detail.phone, detail.alternatePhone].filter(Boolean).join(' / ')} />
                <Detail label="Email" value={detail.email} />
                <div className="sm:col-span-2"><Detail label="Address" value={[detail.address, detail.city, detail.state, detail.pincode].filter(Boolean).join(', ')} /></div>
                <Detail label="GSTIN" value={detail.gstin} mono />
                <Detail label="PAN" value={detail.pan} mono />
                <Detail label="Payment terms" value={detail.paymentTerms} />
                <Detail label="Bank account" value={detail.bankDetails?.accountNumber && `${detail.bankDetails.accountName || ''} · ${detail.bankDetails.accountNumber}`} mono />
                <Detail label="IFSC" value={detail.bankDetails?.ifsc} mono />
                <Detail label="Bank / branch" value={[detail.bankDetails?.bankName, detail.bankDetails?.branch].filter(Boolean).join(', ')} />
                <Detail label="Registered on" value={formatDate(detail.createdAt)} />
              </div>
            )}

            {detailTab === 'documents' && (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Optional – upload whatever the vendor has provided. PDF, JPG, PNG or WEBP, up to 5 MB each. Documents are private – only signed-in staff can open them.</p>
                {DOC_TYPES.map((t) => {
                  const doc = docOf(t.key);
                  return (
                    <div key={t.key} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div className={`w-9 h-9 rounded-lg grid place-items-center ${doc ? 'bg-emerald-50 text-emerald-600' : 'bg-[var(--bg-surface-muted)]'}`} style={doc ? {} : { color: 'var(--text-muted)' }}>
                        {doc ? <CheckCircle2 size={18} /> : <FileText size={18} />}
                      </div>
                      <div className="flex-1 min-w-[180px]">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.label}{t.required ? <span className="text-rose-500"> *</span> : <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}> (optional)</span>}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{doc ? `${doc.fileName} · ${fmtSize(doc.size)} · ${formatDate(doc.uploadedAt)}` : 'Not uploaded'}</div>
                      </div>
                      <div className="flex gap-1.5">
                        {doc && <Button size="sm" variant="outline" icon={Eye} onClick={() => viewDoc(doc)}>View</Button>}
                        {canEdit && (
                          <label className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer border transition-colors hover:bg-[var(--bg-surface-muted)] ${uploading === t.key ? 'opacity-60 pointer-events-none' : ''}`} style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}>
                            <Upload size={14} />{uploading === t.key ? 'Uploading…' : doc ? 'Replace' : 'Upload'}
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" onChange={(e) => { uploadDoc(t.key, e.target.files?.[0]); e.target.value = ''; }} />
                          </label>
                        )}
                        {doc && canEdit && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemoveDoc(doc)} aria-label={`Remove ${t.label}`} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {detailTab === 'history' && (
              <ol className="relative ml-2 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
                {[...(detail.verificationHistory || [])].reverse().map((h) => (
                  <li key={h._id} className="ml-4 pb-4">
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-gold-500 ring-4 ring-[var(--bg-surface)]" />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{HISTORY_LABEL[h.action] || h.action}</span>
                      {h.toStatus && <>{h.fromStatus && <><VendorStatusBadge status={h.fromStatus} compact /><span style={{ color: 'var(--text-muted)' }}>→</span></>}<VendorStatusBadge status={h.toStatus} compact /></>}
                    </div>
                    {h.remarks && <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{h.remarks}</div>}
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatDateTime(h.at)}{h.byName ? ` · ${h.byName}` : ''}</div>
                  </li>
                ))}
                {!detail.verificationHistory?.length && <li className="ml-4 text-sm flex items-center gap-2" style={{ color: 'var(--text-muted)' }}><History size={14} />No history yet.</li>}
              </ol>
            )}
          </div>
        )}
      </Modal>

      {/* ---------- Verification review ---------- */}
      <Modal open={verifyOpen} onClose={() => setVerifyOpen(false)} title={`Verify ${detail?.name || ''}`}
        footer={<><Button variant="outline" onClick={() => setVerifyOpen(false)}>Cancel</Button><Button onClick={submitVerify} loading={verifying} disabled={decision === 'verified' && !ready}>Save Decision</Button></>}
      >
        <div className="space-y-4">
          <div>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Checklist</div>
            <ul className="space-y-1.5">
              {checklist.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-sm">
                  {c.ok ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className={c.optional ? 'text-graphite-400' : 'text-rose-500'} />}
                  <span style={{ color: c.ok ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{c.label}</span>
                </li>
              ))}
            </ul>
            {!ready && <p className="text-xs mt-2" style={{ color: 'var(--status-danger)' }}>Complete the missing items before the vendor can be verified.</p>}
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Open each document from the Documents tab and compare it with the details before approving.</p>
          </div>
          <div>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Decision</div>
            <div className="grid grid-cols-2 gap-2">
              {['verified', 'on_hold', 'rejected', 'pending'].map((s) => (
                <label key={s} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${decision === s ? 'border-gold-500 bg-gold-50' : ''} ${s === 'verified' && !ready ? 'opacity-50' : ''}`}
                  style={decision === s ? {} : { borderColor: 'var(--border-subtle)' }}>
                  <input type="radio" name="decision" value={s} checked={decision === s} disabled={(s === 'verified' && !ready) || detail?.verificationStatus === s} onChange={() => setDecision(s)} />
                  {s === 'verified' ? 'Approve (Verified)' : VENDOR_STATUS[s].label}
                </label>
              ))}
            </div>
          </div>
          <Textarea label={decision !== 'verified' && req('vendorVerification', 'remarks') ? 'Remarks' : 'Remarks (optional)'} required={decision !== 'verified' && req('vendorVerification', 'remarks')} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500}
            placeholder={decision === 'rejected' ? 'Why is the vendor rejected?' : decision === 'on_hold' ? 'What is pending from the vendor?' : 'e.g. GST & PAN checked with originals'} />
        </div>
      </Modal>

      <ConfirmDialog open={!!removeDoc} onClose={() => setRemoveDoc(null)} onConfirm={confirmRemoveDoc} title="Remove document?"
        description="The file will be deleted. The vendor's verification status does not change." confirmLabel="Remove" />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} title="Delete vendor?"
        description="Vendors with purchase history are marked inactive instead of deleted." confirmLabel="Delete" />
    </div>
  );
}

export default Vendors;
