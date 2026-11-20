import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X, Sparkles } from 'lucide-react';
import { Modal, Button, Input, Select } from '../ui/index.js';
import { productService, categoryService } from '../../services/index.js';
import { GROCERY_CATEGORIES, suggestUnits, parseOption, formatOption, compatible, isMeasure, fmtQty, toUnitMap, productUnits } from '../../utils/units.js';

// Add / Edit Product: name, category, unit setup (loose / pre-packed, selling, stock and purchase unit,
// net content per pack, the units / sizes offered at billing), prices, GST and discount. Units are suggested
// from the name and category and can all be changed. Stock is shown here but changes only through
// Inward / Outward DC and Stock Adjustment.

const GST_SLABS = [0, 5, 12, 18, 28];
const FAMILY_LABEL = { mass: 'Weight', volume: 'Liquid', each: 'Quantity' };
const familyGroup = (u) => (u.family.startsWith('pack:') ? 'Quantity' : FAMILY_LABEL[u.family] || 'Other');

const emptyForm = {
  name: '', categoryName: '', productType: '', sellingUnit: '', baseUnit: '', purchaseUnit: '', unitOptions: [],
  packUnit: '', packQuantity: '', packQuantityUnit: 'g', sellingPrice: '', mrp: '', gstRate: 0, discountPercent: '',
};

function UnitSelect({ units, value, onChange, label, allowEmpty, filter, hint, disabled }) {
  const groups = ['Weight', 'Liquid', 'Quantity'].map((g) => [g, [...units.values()].filter((u) => familyGroup(u) === g && (!filter || filter(u)))]);
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)} hint={hint} disabled={disabled}>
      {allowEmpty && <option value="">{allowEmpty}</option>}
      {groups.map(([g, list]) => list.length > 0 && (
        <optgroup key={g} label={g}>{list.map((u) => <option key={u.code} value={u.code}>{u.label}{u.custom ? ' (custom)' : ''}</option>)}</optgroup>
      ))}
    </Select>
  );
}

export function ProductFormDialog({ open, product, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [unitList, setUnitList] = useState([]);
  const units = useMemo(() => toUnitMap(unitList), [unitList]);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [optionText, setOptionText] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ label: '', family: 'pack', factor: '' });
  const unitsTouched = useRef(false);
  const stock = product?.stock;

  useEffect(() => {
    if (!open) return;
    productService.units().then((r) => setUnitList(r.data)).catch((err) => toast.error(err.message));
    categoryService.list({ limit: 200 }).then((r) => setCategories((r.data || []).map((c) => c.name))).catch(() => {});
    unitsTouched.current = !!product?.sellingUnit;
    setOptionText(''); setCustomOpen(false);
    setForm(product ? {
      ...emptyForm,
      name: product.name || '', categoryName: product.category?.name || '', productType: product.productType || '',
      sellingUnit: product.sellingUnit || '', baseUnit: product.baseUnit || '', purchaseUnit: product.purchaseUnit || '',
      unitOptions: product.unitOptions || [], packUnit: product.packUnit || '', packQuantity: product.packQuantity || '',
      packQuantityUnit: product.packQuantityUnit || 'g', sellingPrice: product.sellingPrice || '', mrp: product.mrp || '',
      gstRate: product.gstRate || 0, discountPercent: product.discountPercent || '',
    } : emptyForm);
  }, [open, product]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setUnits = (patch) => { unitsTouched.current = true; set(patch); };

  // Suggested units from the name + category, applied automatically until the admin changes a unit.
  const suggestion = useMemo(() => (units.size ? suggestUnits(form.name, form.categoryName, units) : null), [form.name, form.categoryName, units]);
  function applySuggestion(s = suggestion) {
    if (!s) { toast('No suggestion for this name / category - choose the units yourself.', { icon: 'ℹ️' }); return; }
    set({ productType: s.productType, sellingUnit: s.sellingUnit, baseUnit: s.baseUnit, unitOptions: s.unitOptions, packUnit: s.packUnit,
      ...(s.packUnit ? { packQuantityUnit: units.get(s.sellingUnit)?.family === 'volume' ? 'ml' : 'g' } : {}),
      ...(!form.categoryName ? { categoryName: s.category } : {}) });
  }
  useEffect(() => {
    if (!open || unitsTouched.current || !suggestion || product?.sellingUnit) return;
    applySuggestion(suggestion);
  }, [suggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  const pack = form.packUnit ? { packUnit: form.packUnit, packQuantity: Number(form.packQuantity) || 0, packQuantityUnit: form.packQuantityUnit } : {};
  const sellingUnit = form.sellingUnit || 'pcs';
  const optionOk = (t) => { const o = parseOption(t, units); return !!o && compatible(o.unit, sellingUnit, units, pack); };
  const perText = units.get(sellingUnit)?.short === 'pc' ? 'pc' : units.get(sellingUnit)?.short || sellingUnit;

  function addOption(e) {
    e?.preventDefault();
    const o = parseOption(optionText, units);
    if (!o) { toast.error(`"${optionText}" is not a unit or a size like "500 g".`); return; }
    const t = formatOption(o, units);
    if (!form.unitOptions.includes(t)) setUnits({ unitOptions: [...form.unitOptions, t] });
    setOptionText('');
  }

  async function createCustomUnit(e) {
    e.preventDefault();
    try {
      const r = await productService.createUnit({ label: custom.label, family: custom.family, factor: custom.factor ? Number(custom.factor) : undefined });
      setUnitList((l) => [...l, r.data]);
      toast.success(`Unit "${r.data.label}" added.`);
      setCustom({ label: '', family: 'pack', factor: '' });
      setCustomOpen(false);
    } catch (err) { toast.error(err.message); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Type a product name.'); return; }
    if (form.sellingPrice !== '' && form.mrp !== '' && Number(form.sellingPrice) > Number(form.mrp) && Number(form.mrp) > 0) { toast.error('Selling price cannot be more than the MRP.'); return; }
    const dropped = form.unitOptions.filter((t) => !optionOk(t));
    if (dropped.length) toast(`Left out ${dropped.join(', ')} - ${dropped.length > 1 ? 'they do' : 'it does'} not convert to ${perText}${form.packUnit ? '' : ' (set the net content of the pack to sell by pack)'}.`, { icon: 'ℹ️' });
    const usesUnits = !!form.sellingUnit;
    const body = {
      name: form.name.trim(), categoryName: form.categoryName.trim(),
      sellingPrice: form.sellingPrice === '' ? 0 : Number(form.sellingPrice), mrp: form.mrp === '' ? 0 : Number(form.mrp),
      gstRate: Number(form.gstRate) || 0, discountPercent: form.discountPercent === '' ? 0 : Number(form.discountPercent),
      ...(usesUnits || product?.sellingUnit ? {
        productType: form.productType, sellingUnit: form.sellingUnit, baseUnit: form.baseUnit || form.sellingUnit, purchaseUnit: form.purchaseUnit,
        unitOptions: form.unitOptions.filter(optionOk), packUnit: form.packUnit,
        packQuantity: form.packUnit ? Number(form.packQuantity) || 0 : 0, packQuantityUnit: form.packUnit ? form.packQuantityUnit : '',
      } : {}),
    };
    setSaving(true);
    try {
      const res = product ? await productService.update(product._id, body) : await productService.create(body);
      toast.success(product ? 'Product updated.' : `"${res.data.name}" added.`);
      onSaved?.(res.data);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  const baseOk = (u) => compatible(u.code, sellingUnit, units, pack);
  const packUnits = (u) => u.family.startsWith('pack:');
  const measureUnits = (u) => isMeasure(u);

  return (
    <>
      <Modal open={open} onClose={onClose} title={product ? 'Edit Product' : 'Add Product'} size="lg"
        footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="product-form" loading={saving}>Save</Button></>}
      >
        <form id="product-form" onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Product name" required value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} autoFocus placeholder="e.g. Ponni Rice" />
            <Input label="Category" list="grocery-categories" value={form.categoryName} onChange={(e) => set({ categoryName: e.target.value })} maxLength={80} placeholder="e.g. Rice & Grains" hint="Pick a grocery category or type a new one." />
            <datalist id="grocery-categories">
              {[...new Set([...GROCERY_CATEGORIES.map((g) => g.name), ...categories])].map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>

          <section className="rounded-xl border p-3 sm:p-4 space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Units</h4>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" icon={Sparkles} onClick={() => { unitsTouched.current = true; applySuggestion(); }} disabled={!suggestion}>Suggest units</Button>
                <Button type="button" size="sm" variant="ghost" icon={Plus} onClick={() => setCustomOpen((v) => !v)}>Custom unit</Button>
              </div>
            </div>
            {customOpen && (
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_140px_auto] items-end rounded-lg p-3" style={{ background: 'var(--bg-surface-muted)' }}>
                <Input label="Unit name" value={custom.label} onChange={(e) => setCustom({ ...custom, label: e.target.value })} maxLength={30} placeholder="e.g. Quintal, Cup" />
                <Select label="Kind" value={custom.family} onChange={(e) => setCustom({ ...custom, family: e.target.value })}>
                  <option value="pack">Count / pack</option><option value="mass">Weight</option><option value="volume">Liquid</option>
                </Select>
                {custom.family !== 'pack'
                  ? <Input label={custom.family === 'mass' ? 'Grams in 1 unit' : 'ml in 1 unit'} type="number" min="0" step="any" value={custom.factor} onChange={(e) => setCustom({ ...custom, factor: e.target.value })} />
                  : <div className="text-xs pb-2" style={{ color: 'var(--text-muted)' }}>Counted whole; not converted to g / ml.</div>}
                <Button type="button" onClick={createCustomUnit} disabled={!custom.label.trim()}>Add</Button>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-4">
              <Select label="Product type" value={form.productType} onChange={(e) => setUnits({ productType: e.target.value })}>
                <option value="">Not set</option><option value="loose">Loose (weighed / counted)</option><option value="packed">Pre-packed</option>
              </Select>
              <UnitSelect units={units} label="Selling unit (price per)" value={form.sellingUnit} allowEmpty="Not set"
                onChange={(v) => setUnits({ sellingUnit: v, baseUnit: form.baseUnit && compatible(form.baseUnit, v, units, pack) ? form.baseUnit : v })} />
              <UnitSelect units={units} label="Stock (base) unit" value={form.baseUnit || form.sellingUnit} filter={baseOk} disabled={!form.sellingUnit}
                onChange={(v) => setUnits({ baseUnit: v })} hint={stock ? 'Locked while the product has stock.' : 'Stock is counted in this unit.'} />
              <UnitSelect units={units} label="Purchase unit" value={form.purchaseUnit} allowEmpty="Same as stock" onChange={(v) => setUnits({ purchaseUnit: v })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px_140px] items-end">
              <UnitSelect units={units} label="Pack with fixed net content (optional)" value={form.packUnit} allowEmpty="None" filter={packUnits}
                onChange={(v) => setUnits({ packUnit: v })} hint="e.g. 1 pouch = 500 ml. Without it a pack is never converted to g / ml." />
              <Input label="Net content" type="number" min="0" step="any" value={form.packQuantity} disabled={!form.packUnit} onChange={(e) => setUnits({ packQuantity: e.target.value })} />
              <UnitSelect units={units} label="Net unit" value={form.packQuantityUnit} filter={measureUnits} onChange={(v) => setUnits({ packQuantityUnit: v })} />
            </div>
            <div>
              <span className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Units &amp; sizes at billing</span>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.unitOptions.length === 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>None yet - the cashier can still use {perText} and related units.</span>}
                {form.unitOptions.map((t) => (
                  <span key={t} className={`inline-flex items-center gap-1 pl-2 pr-1 h-7 rounded-full text-xs font-medium border ${optionOk(t) ? '' : 'line-through opacity-60'}`}
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }} title={optionOk(t) ? '' : `Does not convert to ${perText}`}>
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} onClick={() => setUnits({ unitOptions: form.unitOptions.filter((x) => x !== t) })} className="p-0.5 rounded-full hover:bg-rose-50 hover:text-rose-600"><X size={12} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={optionText} onChange={(e) => setOptionText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addOption(e); }}
                  placeholder='Add a unit or size, e.g. "250 g", "1 L", "dozen"' maxLength={30}
                  className="flex-1 h-9 rounded-lg border px-3 text-sm bg-[var(--bg-surface)] focus:outline-none focus:!border-gold-500" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }} />
                <Button type="button" size="sm" variant="outline" onClick={addOption} disabled={!optionText.trim()}>Add</Button>
              </div>
            </div>
          </section>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <Input label={`Unit price (₹ / ${perText})`} type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => set({ sellingPrice: e.target.value })} hint="Empty = rate typed at billing" />
            <Input label={`MRP (₹ / ${perText})`} type="number" min="0" step="0.01" value={form.mrp} onChange={(e) => set({ mrp: e.target.value })} />
            <Select label="GST %" value={form.gstRate} onChange={(e) => set({ gstRate: Number(e.target.value) })}>
              {GST_SLABS.map((g) => <option key={g} value={g}>{g}%</option>)}
            </Select>
            <Input label="Discount %" type="number" min="0" max="100" step="any" value={form.discountPercent} onChange={(e) => set({ discountPercent: e.target.value })} />
          </div>
          {product && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Available stock: <b>{units.size ? fmtQty(stock || 0, productUnits(product, units).baseUnit, units) : stock || 0}</b>
              <span style={{ color: 'var(--text-muted)' }}> — changed through Inward / Outward DC and Stock Adjustment.</span>
            </p>
          )}

        </form>
      </Modal>
    </>
  );
}

export default ProductFormDialog;
