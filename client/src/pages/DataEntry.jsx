import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Store, Percent, Tags, Award, Package, Boxes, Users, Building2, Factory, Receipt, HandCoins, Check, Save, Pencil, Trash2, X,
} from 'lucide-react';
import { PageHeader, Button, Input, Select, Textarea, ConfirmDialog } from '../components/ui/index.js';
import {
  storeService, gstService, categoryService, brandService, productService, inventoryService,
  customerService, vendorService, supplierService, expenseService, paymentService,
} from '../services/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { roleHasModule, isAdmin } from '../utils/permissions.js';
import { formatCurrency } from '../utils/format.js';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' }, { value: 'bank_transfer', label: 'Bank Transfer' },
];
const EXPENSE_CATEGORIES = ['rent', 'utilities', 'salaries', 'marketing', 'logistics', 'maintenance', 'supplies', 'other']
  .map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }));
const UNITS = ['PCS', 'KG', 'G', 'LTR', 'ML', 'BOX', 'PACK', 'DOZEN', 'MTR', 'PAIR'].map((u) => ({ value: u, label: u }));

const toList = (res) => res?.data || [];

function taxPayload(f) {
  return {
    ...f,
    name: f.name || `GST ${f.ratePercent}%`,
    hsnCodes: f.hsnCodes ? String(f.hsnCodes).split(',').map((s) => s.trim()).filter(Boolean) : [],
  };
}

function productPayload(f) {
  const body = { ...f };
  ['category', 'brand', 'taxRate', 'barcode'].forEach((k) => { if (!body[k]) delete body[k]; });
  body.sku = (f.sku || `${f.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}${Date.now().toString().slice(-5)}`).toUpperCase();
  body.mrp = f.mrp || f.sellingPrice;
  return body;
}

// Dropdown data shared by several forms. Each loader returns [{ value, label }].
const LOOKUPS = {
  stores: () => storeService.listAll().then((r) => toList(r).map((s) => ({ value: s._id, label: `${s.name} (${s.code})` }))),
  taxRates: () => gstService.rates().then((r) => toList(r).map((t) => ({ value: t._id, label: `${t.name} – ${t.ratePercent}%` }))),
  categories: () => categoryService.listAll().then((r) => toList(r).map((c) => ({ value: c._id, label: c.name }))),
  brands: () => brandService.listAll().then((r) => toList(r).map((b) => ({ value: b._id, label: b.name }))),
  vendors: () => vendorService.listAll().then((r) => toList(r).map((v) => ({ value: v._id, label: v.name }))),
  products: () => productService.list({ limit: 200 }).then((r) => toList(r).map((p) => ({ value: p._id, label: `${p.name} (${p.sku})` }))),
  customers: () => customerService.list({ limit: 200 }).then((r) => toList(r).map((c) => ({ value: c._id, label: `${c.name} – ${c.phone}`, outstanding: c.outstanding }))),
};

// Every data-entry form, grouped by category. `module` hides forms the user's role cannot use.
// `refresh` lists which dropdowns must reload after saving (e.g. a new brand appears in the Product form).
const ENTITIES = [
  {
    key: 'store', group: 'Setup', label: 'Store / Branch', icon: Store, module: 'settings', refresh: ['stores'],
    hint: 'Every sale and every stock item belongs to a store. Add at least one first.',
    defaults: { code: '', name: '', phone: '', gstin: '', address: '', city: '', state: '', pincode: '' },
    fields: [
      { name: 'name', label: 'Store Name', required: true, placeholder: 'e.g. Main Branch' },
      { name: 'code', label: 'Store Code', required: true, placeholder: 'e.g. MAIN' },
      { name: 'phone', label: 'Phone' },
      { name: 'gstin', label: 'GSTIN' },
      { name: 'address', label: 'Address', type: 'textarea', full: true },
      { name: 'city', label: 'City' },
      { name: 'state', label: 'State' },
      { name: 'pincode', label: 'Pincode' },
    ],
    create: (f) => storeService.create(f),
    update: (id, f) => storeService.update(id, f),
    remove: (id) => storeService.remove(id),
    recent: () => storeService.list({ limit: 6 }),
    row: (r) => [r.name, r.code],
  },
  {
    key: 'tax', group: 'Setup', label: 'GST Rate', icon: Percent, module: 'settings', refresh: ['taxRates'],
    hint: 'Common Indian slabs: 0%, 5%, 12%, 18%, 28%.',
    defaults: { name: '', ratePercent: '', hsnCodes: '' },
    fields: [
      { name: 'ratePercent', label: 'Rate (%)', type: 'number', required: true, placeholder: '18' },
      { name: 'name', label: 'Name', placeholder: 'Auto: GST 18%' },
      { name: 'hsnCodes', label: 'HSN Codes', placeholder: 'Comma separated, e.g. 6109, 6203', full: true },
    ],
    create: (f) => gstService.createRate(taxPayload(f)),
    update: (id, f) => gstService.updateRate(id, taxPayload(f)),
    remove: (id) => gstService.removeRate(id),
    recent: () => gstService.rates(),
    row: (r) => [r.name, `${r.ratePercent}%`],
  },
  {
    key: 'category', group: 'Products', label: 'Category', icon: Tags, module: 'products', refresh: ['categories'],
    defaults: { name: '', parent: '', description: '' },
    fields: [
      { name: 'name', label: 'Category Name', required: true, placeholder: 'e.g. Groceries' },
      { name: 'parent', label: 'Parent Category', type: 'select', lookup: 'categories', emptyLabel: 'None (top level)' },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
    ],
    create: (f) => categoryService.create({
      ...f,
      parent: f.parent || null,
      slug: `${f.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`,
    }),
    update: (id, f) => categoryService.update(id, { ...f, parent: f.parent || null }),
    remove: (id) => categoryService.remove(id),
    recent: () => categoryService.list({ limit: 6 }),
    row: (r) => [r.name, r.status],
  },
  {
    key: 'brand', group: 'Products', label: 'Brand', icon: Award, module: 'products', refresh: ['brands'],
    defaults: { name: '', description: '' },
    fields: [
      { name: 'name', label: 'Brand Name', required: true, placeholder: 'e.g. Tata' },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
    ],
    create: (f) => brandService.create(f),
    update: (id, f) => brandService.update(id, f),
    remove: (id) => brandService.remove(id),
    recent: () => brandService.list({ limit: 6 }),
    row: (r) => [r.name, r.status],
  },
  {
    key: 'product', group: 'Products', label: 'Product', icon: Package, module: 'products', refresh: ['products'],
    hint: 'Add Category, Brand and GST Rate first so they appear in the dropdowns. Stock is added in "Opening Stock".',
    defaults: { name: '', sku: '', barcode: '', category: '', brand: '', taxRate: '', hsn: '', unit: 'PCS', purchasePrice: '', sellingPrice: '', mrp: '', reorderLevel: 10 },
    fields: [
      { name: 'name', label: 'Product Name', required: true, full: true, placeholder: 'e.g. Aashirvaad Atta 5kg' },
      { name: 'sku', label: 'SKU / Item Code', placeholder: 'Auto-generated if empty' },
      { name: 'barcode', label: 'Barcode' },
      { name: 'category', label: 'Category', type: 'select', lookup: 'categories' },
      { name: 'brand', label: 'Brand', type: 'select', lookup: 'brands' },
      { name: 'taxRate', label: 'GST Rate', type: 'select', lookup: 'taxRates', required: true },
      { name: 'hsn', label: 'HSN Code' },
      { name: 'purchasePrice', label: 'Purchase Price (₹)', type: 'number', required: true },
      { name: 'sellingPrice', label: 'Selling Price (₹)', type: 'number', required: true },
      { name: 'mrp', label: 'MRP (₹)', type: 'number', placeholder: 'Same as selling price if empty' },
      { name: 'unit', label: 'Unit', type: 'select', options: UNITS, noEmpty: true },
      { name: 'reorderLevel', label: 'Low-stock Alert At', type: 'number' },
    ],
    create: (f) => productService.create(productPayload(f)),
    update: (id, f) => productService.update(id, productPayload(f)),
    remove: (id) => productService.remove(id),
    recent: () => productService.list({ limit: 6 }),
    row: (r) => [r.name, formatCurrency(r.sellingPrice)],
  },
  {
    key: 'stock', group: 'Products', label: 'Opening Stock', icon: Boxes, module: 'inventory',
    hint: 'Adds stock for a product at a store. Use a negative number to reduce stock.',
    defaults: { product: '', store: '', quantity: '', notes: '' },
    fields: [
      { name: 'product', label: 'Product', type: 'select', lookup: 'products', required: true, full: true },
      { name: 'store', label: 'Store', type: 'select', lookup: 'stores', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true },
      { name: 'notes', label: 'Notes', full: true, placeholder: 'Opening stock' },
    ],
    create: (f) => inventoryService.adjust({ ...f, quantity: Number(f.quantity), type: 'opening_stock', notes: f.notes || 'Opening stock' }),
    recent: () => inventoryService.overview({ limit: 6 }),
    row: (r) => [r.product?.name || '-', `${r.currentStock} in ${r.store?.name || r.distributionCenter?.name || '-'}`],
  },
  {
    key: 'customer', group: 'People', label: 'Customer', icon: Users, module: 'customers', refresh: ['customers'],
    defaults: { name: '', phone: '', email: '', customerType: 'retail', gstin: '', creditLimit: '', address: '' },
    fields: [
      { name: 'name', label: 'Customer Name', required: true },
      { name: 'phone', label: 'Phone', required: true, placeholder: '10-digit mobile' },
      { name: 'email', label: 'Email', inputType: 'email' },
      { name: 'customerType', label: 'Type', type: 'select', noEmpty: true, options: [{ value: 'retail', label: 'Retail' }, { value: 'wholesale', label: 'Wholesale' }, { value: 'corporate', label: 'Corporate' }] },
      { name: 'gstin', label: 'GSTIN' },
      { name: 'creditLimit', label: 'Credit Limit (₹)', type: 'number' },
      { name: 'address', label: 'Address', type: 'textarea', full: true },
    ],
    create: (f) => customerService.create({ ...f, creditLimit: Number(f.creditLimit || 0) }),
    update: (id, f) => customerService.update(id, { ...f, creditLimit: Number(f.creditLimit || 0) }),
    remove: (id) => customerService.remove(id),
    recent: () => customerService.list({ limit: 6 }),
    row: (r) => [r.name, r.phone],
  },
  {
    key: 'vendor', group: 'People', label: 'Vendor', icon: Building2, module: 'vendors', refresh: ['vendors'],
    hint: 'Companies you place purchase orders with.',
    defaults: { name: '', companyName: '', contactPerson: '', phone: '', email: '', gstin: '', paymentTerms: 'Net 30', address: '' },
    fields: [
      { name: 'name', label: 'Vendor Name', required: true },
      { name: 'companyName', label: 'Company Name' },
      { name: 'contactPerson', label: 'Contact Person' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email', inputType: 'email' },
      { name: 'gstin', label: 'GSTIN' },
      { name: 'paymentTerms', label: 'Payment Terms', placeholder: 'Net 30' },
      { name: 'address', label: 'Address', type: 'textarea', full: true },
    ],
    create: (f) => vendorService.create(f),
    update: (id, f) => vendorService.update(id, f),
    remove: (id) => vendorService.remove(id),
    recent: () => vendorService.list({ limit: 6 }),
    row: (r) => [r.name, r.phone || '-'],
  },
  {
    key: 'supplier', group: 'People', label: 'Supplier', icon: Factory, module: 'vendors',
    defaults: { name: '', contactPerson: '', phone: '', email: '', paymentTerms: 'Net 30', address: '' },
    fields: [
      { name: 'name', label: 'Supplier Name', required: true },
      { name: 'contactPerson', label: 'Contact Person' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email', inputType: 'email' },
      { name: 'paymentTerms', label: 'Payment Terms', placeholder: 'Net 30' },
      { name: 'address', label: 'Address', type: 'textarea', full: true },
    ],
    create: (f) => supplierService.create(f),
    update: (id, f) => supplierService.update(id, f),
    remove: (id) => supplierService.remove(id),
    recent: () => supplierService.list({ limit: 6 }),
    row: (r) => [r.name, r.phone || '-'],
  },
  {
    key: 'expense', group: 'Money', label: 'Expense', icon: Receipt, module: 'finance',
    hint: 'Rent, electricity, salaries and other shop running costs.',
    defaults: { category: 'rent', description: '', amount: '', paymentMethod: 'cash', store: '', expenseDate: new Date().toISOString().slice(0, 10) },
    fields: [
      { name: 'category', label: 'Expense Type', type: 'select', options: EXPENSE_CATEGORIES, noEmpty: true, required: true },
      { name: 'amount', label: 'Amount (₹)', type: 'number', required: true },
      { name: 'description', label: 'Description', required: true, full: true, placeholder: 'e.g. September shop rent' },
      { name: 'paymentMethod', label: 'Paid By', type: 'select', options: PAYMENT_METHODS, noEmpty: true },
      { name: 'store', label: 'Store', type: 'select', lookup: 'stores' },
      { name: 'expenseDate', label: 'Date', inputType: 'date' },
    ],
    create: (f) => expenseService.create({ ...f, amount: Number(f.amount), store: f.store || undefined }),
    update: (id, f) => expenseService.update(id, { ...f, amount: Number(f.amount), store: f.store || undefined }),
    remove: (id) => expenseService.remove(id),
    recent: () => expenseService.list({ limit: 6 }),
    row: (r) => [r.description, formatCurrency(r.amount)],
  },
  {
    key: 'receipt', group: 'Money', label: 'Customer Payment', icon: HandCoins, module: 'finance', refresh: ['customers'],
    hint: 'Money received from a customer against their credit (outstanding) balance.',
    defaults: { party: '', amount: '', method: 'cash', transactionRef: '', notes: '' },
    fields: [
      { name: 'party', label: 'Customer', type: 'select', lookup: 'customers', required: true, full: true },
      { name: 'amount', label: 'Amount Received (₹)', type: 'number', required: true },
      { name: 'method', label: 'Received By', type: 'select', options: PAYMENT_METHODS, noEmpty: true },
      { name: 'transactionRef', label: 'Reference No.', placeholder: 'UPI / cheque number' },
      { name: 'notes', label: 'Notes' },
    ],
    create: (f) => paymentService.create({
      ...f, amount: Number(f.amount), direction: 'incoming', purpose: 'customer_receipt', partyModel: 'Customer',
    }),
    recent: () => paymentService.list({ direction: 'incoming', limit: 6 }),
    row: (r) => [r.party?.name || r.voucherNumber, formatCurrency(r.amount)],
  },
];

const GROUPS = ['Setup', 'Products', 'People', 'Money'];

// Converts a saved record back into form values for editing.
function recordToForm(entity, row) {
  const form = { ...entity.defaults };
  entity.fields.forEach((f) => {
    let v = row[f.name];
    if (v && typeof v === 'object' && !Array.isArray(v)) v = v._id;
    if (Array.isArray(v)) v = v.join(', ');
    if (f.inputType === 'date' && v) v = String(v).slice(0, 10);
    form[f.name] = v ?? '';
  });
  return form;
}

function EntryField({ field, value, onChange, options }) {
  const common = { label: field.label, required: field.required, value: value ?? '', onChange: (e) => onChange(e.target.value) };
  if (field.type === 'textarea') return <Textarea {...common} rows={2} placeholder={field.placeholder} />;
  if (field.type === 'select') {
    const opts = field.options || options || [];
    return (
      <Select {...common}>
        {!field.noEmpty && <option value="">{field.emptyLabel || (opts.length ? `Select ${field.label.toLowerCase()}` : `No ${field.label.toLowerCase()} yet`)}</option>}
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    );
  }
  return (
    <Input
      {...common}
      type={field.type === 'number' ? 'number' : field.inputType || 'text'}
      step={field.type === 'number' ? 'any' : undefined}
      placeholder={field.placeholder}
    />
  );
}

export function DataEntry() {
  const { user } = useAuth();
  const entities = useMemo(() => ENTITIES.filter((e) => user && roleHasModule(user.role, e.module)), [user]);
  const [activeKey, setActiveKey] = useState(() => {
    try { return localStorage.getItem('aurelia_data_entry_tab') || ''; } catch { return ''; }
  });
  const active = entities.find((e) => e.key === activeKey) || entities[0];

  const [forms, setForms] = useState({});
  const [lookups, setLookups] = useState({});
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState({});
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const canManage = isAdmin(user);

  const form = (active && forms[active.key]) || active?.defaults || {};

  async function loadLookup(name) {
    try {
      const data = await LOOKUPS[name]();
      setLookups((l) => ({ ...l, [name]: data }));
    } catch { /* role may not have access to this list; dropdown stays empty */ }
  }

  async function loadRecent(entity) {
    setRecentLoading(true);
    try {
      const res = await entity.recent();
      setRecent(toList(res).slice(0, 6));
    } catch {
      setRecent([]);
    } finally {
      setRecentLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    try { localStorage.setItem('aurelia_data_entry_tab', active.key); } catch { /* ignore */ }
    setEditing(null);
    active.fields.filter((f) => f.lookup).forEach((f) => loadLookup(f.lookup));
    loadRecent(active);
  }, [active?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  function setField(name, value) {
    setForms((all) => ({ ...all, [active.key]: { ...form, [name]: value } }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await active.update(editing._id, form);
        toast.success(`${active.label} updated.`);
        setEditing(null);
        setForms((all) => ({ ...all, [active.key]: active.defaults }));
        (active.refresh || []).forEach(loadLookup);
        loadRecent(active);
        return;
      }
      await active.create(form);
      toast.success(`${active.label} saved.`);
      // Keep dropdown-type choices (store, unit, payment method...) so the next entry is faster.
      const keep = Object.fromEntries(active.fields
        .filter((f) => f.type === 'select' && f.name !== 'product' && f.name !== 'party')
        .map((f) => [f.name, form[f.name]]));
      setForms((all) => ({ ...all, [active.key]: { ...active.defaults, ...keep } }));
      setSavedCount((c) => ({ ...c, [active.key]: (c[active.key] || 0) + 1 }));
      (active.refresh || []).forEach(loadLookup);
      loadRecent(active);
      document.querySelector('#data-entry-form input, #data-entry-form select')?.focus();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditing(row);
    setForms((all) => ({ ...all, [active.key]: recordToForm(active, row) }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditing(null);
    setForms((all) => ({ ...all, [active.key]: active.defaults }));
  }

  async function handleDelete() {
    try {
      await active.remove(deleteTarget._id);
      toast.success(`${active.label} deleted.`);
      if (editing?._id === deleteTarget._id) cancelEdit();
      setDeleteTarget(null);
      (active.refresh || []).forEach(loadLookup);
      loadRecent(active);
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!active) {
    return <PageHeader title="Data Entry" />;
  }

  return (
    <div>
      <PageHeader title="Data Entry" />
      <p className="-mt-4 mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        Add everything from one place. Pick a category on the left, fill the form, and press <b>Save</b> (or Enter). The form clears so you can add the next one straight away.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
        {/* Category list: horizontal chips on phones, vertical list on desktop */}
        <nav className="flex lg:flex-col gap-4 overflow-x-auto lg:overflow-visible pb-1">
          {GROUPS.map((group) => {
            const items = entities.filter((e) => e.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="shrink-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 px-1" style={{ color: 'var(--text-muted)' }}>{group}</div>
                <div className="flex lg:flex-col gap-1">
                  {items.map((e) => (
                    <button
                      key={e.key}
                      onClick={() => setActiveKey(e.key)}
                      className={clsx(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap text-left transition-colors border',
                        e.key === active.key ? 'bg-gold-500 text-graphite-950 border-gold-500 font-medium' : 'border-transparent hover:border-gold-400'
                      )}
                      style={e.key === active.key ? undefined : { color: 'var(--text-primary)' }}
                    >
                      <e.icon size={16} className="shrink-0" />
                      <span className="flex-1">{e.label}</span>
                      {savedCount[e.key] > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
                          <Check size={11} />{savedCount[e.key]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
          <form id="data-entry-form" onSubmit={handleSubmit} className="surface-card rounded-xl2 shadow-premium p-5 md:p-6">
            <div className="flex items-center gap-2.5 mb-1">
              <active.icon size={20} className="text-gold-600" />
              <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editing ? `Edit ${active.label}` : `New ${active.label}`}
              </h2>
              {editing && <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-gold-500/15 text-gold-600">Editing</span>}
            </div>
            {active.hint && <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{active.hint}</p>}
            {!active.hint && <div className="mb-5" />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {active.fields.map((f) => (
                <div key={f.name} className={f.full ? 'sm:col-span-2' : ''}>
                  <EntryField field={f} value={form[f.name]} onChange={(v) => setField(f.name, v)} options={lookups[f.lookup]} />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}><span className="text-rose-500">*</span> required</span>
              <div className="flex gap-2">
                {editing
                  ? <Button type="button" variant="outline" icon={X} onClick={cancelEdit}>Cancel Edit</Button>
                  : <Button type="button" variant="outline" onClick={() => setForms((all) => ({ ...all, [active.key]: active.defaults }))}>Clear</Button>}
                <Button type="submit" icon={Save} loading={saving}>{editing ? 'Update' : 'Save'}</Button>
              </div>
            </div>
          </form>

          <div className="surface-card rounded-xl2 shadow-premium p-5">
            <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Recently added</div>
            {recentLoading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</p>}
            {!recentLoading && recent.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nothing added yet.</p>
            )}
            {!recentLoading && recent.length > 0 && (
              <ul className="space-y-2">
                {recent.map((r) => {
                  const [main, sub] = active.row(r);
                  return (
                    <li
                      key={r._id}
                      className={clsx('flex items-center justify-between gap-2 text-sm py-1.5 border-b last:border-0', editing?._id === r._id && 'bg-gold-500/10 -mx-2 px-2 rounded')}
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{main}</span>
                      <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{sub}</span>
                      {canManage && active.update && (
                        <span className="flex shrink-0">
                          <button type="button" onClick={() => startEdit(r)} title="Edit" className="p-1 rounded hover:bg-graphite-100 text-graphite-500"><Pencil size={13} /></button>
                          <button type="button" onClick={() => setDeleteTarget(r)} title="Delete" className="p-1 rounded hover:bg-rose-50 text-rose-500"><Trash2 size={13} /></button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={`Delete ${active.label.toLowerCase()}?`}
        description={`"${deleteTarget ? active.row(deleteTarget)[0] : ''}" will be removed. Past invoices and history that use it are kept.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

export default DataEntry;
