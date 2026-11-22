import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, Button, Modal, Input, Select, ConfirmDialog, SearchBox } from '../../components/ui/index.js';
import { productService } from '../../services/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';

// Units of measurement: every unit the store can buy and sell in, grouped by kind. Built-in units (kg, g, L,
// ml, pcs, nos, dozen, m, box, packet, bundle...) are fixed; administrators add their own units with a size
// (a global conversion rule, e.g. 1 Quintal = 100000 g, 1 Score = 20 pcs). Product-specific rules such as
// "1 box = 24 pcs" are set on the product (Product Master > Units > Conversions).
const KIND = {
  mass: { label: 'Weight', base: 'g', factorLabel: 'Grams in 1 unit' },
  volume: { label: 'Liquid', base: 'ml', factorLabel: 'ml in 1 unit' },
  each: { label: 'Count', base: 'pcs', factorLabel: 'Pieces in 1 unit' },
  length: { label: 'Length', base: 'cm', factorLabel: 'cm in 1 unit' },
  pack: { label: 'Pack', base: null, factorLabel: null },
};
const kindOf = (u) => (u.family.startsWith('pack:') ? 'pack' : u.family);
const EMPTY = { label: '', short: '', family: 'pack', factor: '' };

export function Units() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [form, setForm] = useState(null); // { ...EMPTY, code? }
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  function load() {
    setLoading(true);
    productService.unitUsage().then((r) => setRows(r.data)).catch((err) => toast.error(err.message)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const shown = useMemo(() => rows.filter((u) => (!kind || kindOf(u) === kind)
    && (!search || `${u.label} ${u.code} ${u.short}`.toLowerCase().includes(search.toLowerCase()))), [rows, kind, search]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { label: form.label, short: form.short || undefined, family: form.family, factor: form.family === 'pack' ? undefined : Number(form.factor) };
      if (form.code) await productService.updateUnit(form.code, body);
      else await productService.createUnit(body);
      toast.success(form.code ? 'Unit updated.' : 'Unit added.');
      setForm(null);
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function remove() {
    try { await productService.deleteUnit(removing.code); toast.success(`${removing.label} removed.`); setRemoving(null); load(); } catch (err) { toast.error(err.message); }
  }

  const sizeText = (u) => {
    const k = KIND[kindOf(u)];
    if (!k.base) return 'Set per product (e.g. 1 box = 24 pcs)';
    return u.factor === 1 ? `Base ${k.label.toLowerCase()} unit` : `1 ${u.short} = ${Number(u.factor).toLocaleString('en-IN', { maximumFractionDigits: 4 })} ${k.base}`;
  };

  return (
    <div>
      <PageHeader title="Units of Measurement" crumbs={[{ label: 'Products', to: '/products' }, { label: 'Units' }]}
        actions={admin && <Button icon={Plus} onClick={() => setForm({ ...EMPTY })}>Add Unit</Button>} />
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        Weight, liquid and length can be sold in decimals (0.75 kg, 2.5 m); pieces and packs are whole numbers. Stock is always kept in each product&apos;s stock unit,
        so a product bought by box and sold by piece stays correct. Box / bundle / packet sizes are set per product in Product Master (Conversions).
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search units..." className="w-64" />
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-lg border px-3 text-sm bg-[var(--bg-surface)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
          <option value="">All kinds</option>
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <DataTable loading={loading} rows={shown} keyField="code" emptyTitle="No units match."
        columns={[
          { key: 'label', header: 'Unit', render: (u) => <span className="font-medium">{u.label}</span> },
          { key: 'short', header: 'Short', render: (u) => <span className="font-mono text-xs">{u.short}</span> },
          { key: 'kind', header: 'Kind', render: (u) => KIND[kindOf(u)].label },
          { key: 'size', header: 'Conversion', render: (u) => <span className="text-xs">{sizeText(u)}</span> },
          { key: 'decimal', header: 'Quantities', render: (u) => (['mass', 'volume', 'length'].includes(u.family) ? 'Decimals allowed' : 'Whole numbers') },
          { key: 'products', header: 'Used by', render: (u) => (u.products ? `${u.products} product(s)` : '-') },
          { key: 'type', header: '', render: (u) => (u.custom ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>Custom</span> : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Built-in</span>) },
          {
            key: 'actions', header: '', render: (u) => admin && u.custom && (
              <div className="flex gap-1 justify-end">
                <button type="button" title="Edit" onClick={() => setForm({ code: u.code, label: u.label, short: u.short, family: kindOf(u), factor: u.factor ?? '', products: u.products })} className="p-1.5 rounded-lg hover:bg-gold-50 text-graphite-500"><Pencil size={14} /></button>
                <button type="button" title={u.products ? 'In use - cannot delete' : 'Delete'} disabled={u.products > 0} onClick={() => setRemoving(u)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 disabled:opacity-30"><Trash2 size={14} /></button>
              </div>
            ),
          },
        ]} />

      <Modal open={!!form} onClose={() => setForm(null)} size="sm" title={form?.code ? `Edit ${form.label}` : 'Add Unit'}
        footer={<><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" form="unit-form" loading={saving}>Save</Button></>}>
        {form && (
          <form id="unit-form" onSubmit={save} className="space-y-3">
            <Input label="Unit name" required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={30} placeholder="e.g. Quintal, Crate, Score" />
            <Input label="Short name (on bills)" value={form.short} onChange={(e) => setForm({ ...form, short: e.target.value })} maxLength={12} placeholder="e.g. qtl" />
            <Select label="Kind" value={form.family} disabled={form.products > 0} onChange={(e) => setForm({ ...form, family: e.target.value })}
              hint={form.products > 0 ? 'Used by products - kind and size are locked (stock would change meaning).' : undefined}>
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            {KIND[form.family].factorLabel && (
              <Input label={KIND[form.family].factorLabel} required type="number" min="0" step="any" value={form.factor} disabled={form.products > 0}
                onChange={(e) => setForm({ ...form, factor: e.target.value })} hint={`Conversion rule: 1 ${form.label || 'unit'} = ${form.factor || '?'} ${KIND[form.family].base}`} />
            )}
            {form.family === 'pack' && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>A pack unit has no fixed size. Set its size on each product, e.g. 1 crate = 30 pcs.</p>}
          </form>
        )}
      </Modal>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} title="Delete unit?" description={`"${removing?.label}" will be removed. No product uses it.`} confirmLabel="Delete" />
    </div>
  );
}

export default Units;
