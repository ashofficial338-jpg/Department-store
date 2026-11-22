import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X, Sparkles, Trash2 } from 'lucide-react';
import { Modal, Button, Input, Select, Textarea } from '../ui/index.js';
import { productService, categoryService, brandService, vendorService, editRequestService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';
import { useFieldRules } from '../../hooks/useFieldRules.js';
import { GROCERY_CATEGORIES, suggestUnits, parseOption, formatOption, compatible, isMeasure, fmtQty, toUnitMap, productUnits, convert, productUnitList } from '../../utils/units.js';

// Add / Edit Product: name, category, unit setup (loose / pre-packed, selling, stock and purchase unit,
// net content per pack, the units / sizes offered at billing), prices, GST and discount. Units are suggested
// from the name and category and can all be changed. Stock is shown here but changes only through
// Inward / Outward DC and Stock Adjustment.

const GST_SLABS = [0, 5, 12, 18, 28];
const FAMILY_LABEL = { mass: 'Weight', volume: 'Liquid', each: 'Quantity', length: 'Length' };
const familyGroup = (u) => (u.family.startsWith('pack:') ? 'Quantity' : FAMILY_LABEL[u.family] || 'Other');

const emptyForm = {
  name: '', categoryName: '', productType: '', sellingUnit: '', baseUnit: '', purchaseUnit: '', unitOptions: [],
  packUnit: '', packQuantity: '', packQuantityUnit: 'g', sellingPrice: '', mrp: '', gstRate: 0, discountPercent: '',
  // Full details (Product Master > New / Edit product page)
  sku: '', barcode: '', hsn: '', description: '', status: 'active', subcategoryName: '', brandName: '', brandNames: [],
  purchasePrice: '', reorderLevel: '10', minStock: '', maxStock: '', shelfLifeDays: '', primaryVendor: '', attributes: [],
  // Units of measure: conversion rules (1 box = 24 pcs) and separate rates per unit.
  conversions: [], unitPrices: [],
};
const ATTRIBUTE_SUGGESTIONS = ['Variety', 'Pack size', 'Origin', 'Grade', 'Flavour', 'Colour', 'Ingredients', 'Storage', 'Veg / Non-veg', 'Country of origin'];
const numOrEmpty = (v) => (v === undefined || v === null ? '' : String(v));

function UnitSelect({ units, value, onChange, label, allowEmpty, filter, hint, disabled }) {
  const groups = ['Weight', 'Liquid', 'Length', 'Quantity'].map((g) => [g, [...units.values()].filter((u) => familyGroup(u) === g && (!filter || filter(u)))]);
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)} hint={hint} disabled={disabled}>
      {allowEmpty && <option value="">{allowEmpty}</option>}
      {groups.map(([g, list]) => list.length > 0 && (
        <optgroup key={g} label={g}>{list.map((u) => <option key={u.code} value={u.code}>{u.label}{u.custom ? ' (custom)' : ''}</option>)}</optgroup>
      ))}
    </Select>
  );
}

// The product form. `full` adds identity, brands, sub-category, purchase price, stock limits, supplier and
// custom attributes (used by the Product page); without it this is the original quick Add / Edit form.
// `requestMode`: the user is not an administrator - saving an existing product sends an Edit Request instead.
export function ProductForm({ open = true, product, onSaved, full = false, requestMode = false, formId = 'product-form', onSavingChange }) {
  const [form, setForm] = useState(emptyForm);
  const [unitList, setUnitList] = useState([]);
  const units = useMemo(() => toUnitMap(unitList), [unitList]);
  const [categories, setCategories] = useState([]);
  const [, setSaving] = useState(false);
  const [optionText, setOptionText] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ label: '', family: 'pack', factor: '' });
  const unitsTouched = useRef(false);
  const stock = product?.stock;
  const [brandList, setBrandList] = useState([]);
  const [vendorList, setVendorList] = useState([]);
  const [subcats, setSubcats] = useState([]);
  const [brandText, setBrandText] = useState('');
  const [reason, setReason] = useState('');
  const { user } = useAuth();
  const admin = isAdmin(user);
  const { req } = useFieldRules();

  useEffect(() => {
    if (!open) return;
    productService.units().then((r) => setUnitList(r.data)).catch((err) => toast.error(err.message));
    categoryService.list({ limit: 200 }).then((r) => {
      setCategories((r.data || []).filter((c) => !c.parent).map((c) => c.name));
      setSubcats((r.data || []).filter((c) => c.parent).map((c) => ({ name: c.name, parent: c.parent?.name || c.parent })));
    }).catch(() => {});
    if (full) {
      brandService.listAll().then((r) => setBrandList((r.data || []).filter((b) => b.status !== 'inactive').map((b) => b.name))).catch(() => {});
      vendorService.listAll().then((r) => setVendorList(r.data || [])).catch(() => {});
    }
    setBrandText(''); setReason('');
    unitsTouched.current = !!product?.sellingUnit;
    setOptionText(''); setCustomOpen(false);
    setForm(product ? {
      ...emptyForm,
      name: product.name || '', categoryName: product.category?.name || '', productType: product.productType || '',
      sellingUnit: product.sellingUnit || '', baseUnit: product.baseUnit || '', purchaseUnit: product.purchaseUnit || '',
      unitOptions: product.unitOptions || [], packUnit: product.packUnit || '', packQuantity: product.packQuantity || '',
      packQuantityUnit: product.packQuantityUnit || 'g', sellingPrice: product.sellingPrice || '', mrp: product.mrp || '',
      gstRate: product.gstRate || 0, discountPercent: product.discountPercent || '',
      sku: product.sku || '', barcode: product.barcode || '', hsn: product.hsn || '', description: product.description || '',
      status: product.status === 'inactive' ? 'inactive' : 'active', subcategoryName: product.subcategory?.name || '',
      brandName: product.brand?.name || '', brandNames: [...new Set([product.brand?.name, ...(product.brands || []).map((b) => b.name)].filter(Boolean))],
      purchasePrice: product.purchasePrice || '', reorderLevel: numOrEmpty(product.reorderLevel), minStock: product.minStock || '',
      maxStock: numOrEmpty(product.maxStock),
      shelfLifeDays: product.shelfLifeDays ?? '', primaryVendor: product.primaryVendor?._id || product.primaryVendor || '',
      attributes: (product.attributes || []).map((a) => ({ name: a.name, value: a.value })),
      conversions: (product.conversions || []).map((c) => ({ unit: c.unit, quantity: c.quantity, ofUnit: c.ofUnit })),
      unitPrices: (product.unitPrices || []).map((r) => ({ unit: r.unit, sellingPrice: r.sellingPrice || '', purchasePrice: r.purchasePrice || '' })),
    } : emptyForm);
  }, [open, product, full]);

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

  const convRules = form.conversions.filter((c) => c.unit && c.ofUnit && Number(c.quantity) > 0).map((c) => ({ ...c, quantity: Number(c.quantity) }));
  const pack = { ...(form.packUnit ? { packUnit: form.packUnit, packQuantity: Number(form.packQuantity) || 0, packQuantityUnit: form.packQuantityUnit } : {}), conversions: convRules };
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

  function addBrand(name) {
    const n = String(name || brandText).trim().replace(/\s+/g, ' ');
    if (!n) return;
    if (!form.brandNames.some((b) => b.toLowerCase() === n.toLowerCase())) set({ brandNames: [...form.brandNames, n], brandName: form.brandName || n });
    setBrandText('');
  }
  const setAttr = (i, patch) => set({ attributes: form.attributes.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Type a product name.'); return; }
    if (full && form.hsn && !/^[0-9]{4,8}$/.test(form.hsn.trim())) { toast.error('HSN code must be 4 to 8 digits.'); return; }
    if (full && form.minStock !== '' && form.maxStock !== '' && Number(form.maxStock) > 0 && Number(form.minStock) > Number(form.maxStock)) { toast.error('Minimum stock cannot be more than the maximum.'); return; }
    if (requestMode && product && req('editRequest', 'reason') && !reason.trim()) { toast.error('Tell the administrator what you changed and why.'); return; }
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
        conversions: convRules,
        unitPrices: form.unitPrices.filter((r) => r.unit && (Number(r.sellingPrice) > 0 || Number(r.purchasePrice) > 0))
          .map((r) => ({ unit: r.unit, sellingPrice: Number(r.sellingPrice) || 0, purchasePrice: Number(r.purchasePrice) || 0 })),
      } : {}),
      ...(full ? {
        ...(form.sku.trim() ? { sku: form.sku.trim() } : {}), barcode: form.barcode.trim(), hsn: form.hsn.trim(), description: form.description.trim(),
        status: form.status, subcategoryName: form.subcategoryName.trim(), brandName: form.brandName, brandNames: form.brandNames,
        purchasePrice: form.purchasePrice === '' ? 0 : Number(form.purchasePrice), reorderLevel: form.reorderLevel === '' ? 0 : Number(form.reorderLevel),
        minStock: form.minStock === '' ? 0 : Number(form.minStock), maxStock: form.maxStock === '' ? 0 : Number(form.maxStock),
        shelfLifeDays: form.shelfLifeDays === '' ? '' : Number(form.shelfLifeDays), primaryVendor: form.primaryVendor,
        attributes: form.attributes.filter((a) => a.name.trim() && String(a.value).trim()),
      } : {}),
    };
    setSaving(true); onSavingChange?.(true);
    try {
      if (requestMode && product) {
        await editRequestService.create({ entity: 'Product', entityId: product._id, action: 'update', changes: body, reason: reason.trim() });
        toast.success('Change request sent to the administrator for approval.');
        onSaved?.(product, { requested: true });
        return;
      }
      const res = product ? await productService.update(product._id, body) : await productService.create(body);
      toast.success(product ? 'Product updated.' : `"${res.data.name}" added.`);
      onSaved?.(res.data);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); onSavingChange?.(false); }
  }

  // Price check (same rules as the Excel model): margin on purchase price, price incl. GST, MRP limit.
  const pp = Number(form.purchasePrice) || 0;
  const sp = Number(form.sellingPrice) || 0;
  const disc = Number(form.discountPercent) || 0;
  const netSp = sp * (1 - disc / 100);
  const withGst = Math.round(netSp * (1 + (Number(form.gstRate) || 0) / 100) * 100) / 100;
  const margin = pp > 0 && sp > 0 ? ((netSp - pp) / pp) * 100 : null;
  const mrpOk = !(Number(form.mrp) > 0 && sp > Number(form.mrp));

  const baseOk = (u) => compatible(u.code, sellingUnit, units, pack);
  const packUnits = (u) => u.family.startsWith('pack:');
  const measureUnits = (u) => isMeasure(u);

  const sectionCls = 'rounded-xl border p-3 sm:p-4 space-y-3';
  const sectionStyle = { borderColor: 'var(--border-subtle)' };
  const H = ({ children, hint }) => (
    <div><h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{children}</h4>{hint && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}</div>
  );
  const subcatOptions = subcats.filter((c) => !form.categoryName || String(c.parent).toLowerCase() === form.categoryName.toLowerCase() || typeof c.parent !== 'string').map((c) => c.name);

  return (
        <form id={formId} onSubmit={submit} className="space-y-5">
          <div className={`grid gap-3 ${full ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            <Input label="Product name" required value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} autoFocus placeholder="e.g. Ponni Rice" />
            <Input label="Category" required={req('product', 'category')} list="grocery-categories" value={form.categoryName} onChange={(e) => set({ categoryName: e.target.value })} maxLength={80} placeholder="e.g. Rice & Grains" hint="Pick a grocery category or type a new one." />
            <datalist id="grocery-categories">
              {[...new Set([...GROCERY_CATEGORIES.map((g) => g.name), ...categories])].map((n) => <option key={n} value={n} />)}
            </datalist>
            {full && (
              <>
                <Input label="Sub-category (optional)" list="product-subcategories" value={form.subcategoryName} onChange={(e) => set({ subcategoryName: e.target.value })} maxLength={80} placeholder="e.g. Raw Rice" disabled={!form.categoryName.trim()} hint={form.categoryName.trim() ? 'Pick one or type a new one.' : 'Choose the category first.'} />
                <datalist id="product-subcategories">{[...new Set(subcatOptions)].map((n) => <option key={n} value={n} />)}</datalist>
              </>
            )}
          </div>

          {full && (
            <section className={sectionCls} style={sectionStyle}>
              <H hint="All optional. SKU is created automatically when left empty.">Identification</H>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                <Input label="SKU / item code" required={req('product', 'sku')} value={form.sku} onChange={(e) => set({ sku: e.target.value.toUpperCase() })} maxLength={40} placeholder="Auto" />
                <Input label="Barcode" required={req('product', 'barcode')} value={form.barcode} onChange={(e) => set({ barcode: e.target.value })} maxLength={48} />
                <Input label="HSN code" required={req('product', 'hsn')} inputMode="numeric" value={form.hsn} onChange={(e) => set({ hsn: e.target.value.replace(/\D/g, '') })} maxLength={8} placeholder="e.g. 1006" />
                <Select label="Status" value={form.status} onChange={(e) => set({ status: e.target.value })}>
                  <option value="active">Active (sold & purchased)</option><option value="inactive">Inactive (hidden from billing)</option>
                </Select>
              </div>
              <Textarea label="Description" required={req('product', 'description')} rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} />
            </section>
          )}

          {full && (
            <section className={sectionCls} style={sectionStyle}>
              <H hint="The same product can be bought and sold under several brands; each brand keeps its own stock, rate and supplier history.">Brands</H>
              <div className="flex flex-wrap gap-1.5">
                {form.brandNames.length === 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No brand yet (optional).</span>}
                {form.brandNames.map((b) => (
                  <span key={b} className="inline-flex items-center gap-1 pl-2.5 pr-1 h-7 rounded-full text-xs font-medium border"
                    style={{ borderColor: form.brandName === b ? 'var(--brand)' : 'var(--border-subtle)', color: 'var(--text-secondary)', background: form.brandName === b ? 'var(--brand-soft)' : undefined }}>
                    <button type="button" title="Make this the main brand" onClick={() => set({ brandName: b })}>{b}{form.brandName === b ? ' (main)' : ''}</button>
                    <button type="button" aria-label={`Remove ${b}`} onClick={() => set({ brandNames: form.brandNames.filter((x) => x !== b), brandName: form.brandName === b ? (form.brandNames.find((x) => x !== b) || '') : form.brandName })}
                      className="p-0.5 rounded-full hover:bg-rose-50 hover:text-rose-600"><X size={12} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input list="product-brands" value={brandText} onChange={(e) => setBrandText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBrand(); } }}
                  placeholder="Pick a brand or type a new one" maxLength={80} aria-label="Add brand"
                  className="flex-1 h-9 rounded-lg border px-3 text-sm bg-[var(--bg-surface)] focus:outline-none focus:!border-gold-500" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }} />
                <datalist id="product-brands">{brandList.map((n) => <option key={n} value={n} />)}</datalist>
                <Button type="button" size="sm" variant="outline" onClick={() => addBrand()} disabled={!brandText.trim()}>Add brand</Button>
              </div>
            </section>
          )}

          <section className="rounded-xl border p-3 sm:p-4 space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Units</h4>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" icon={Sparkles} onClick={() => { unitsTouched.current = true; applySuggestion(); }} disabled={!suggestion}>Suggest units</Button>
                {admin && <Button type="button" size="sm" variant="ghost" icon={Plus} onClick={() => setCustomOpen((v) => !v)}>Custom unit</Button>}
              </div>
            </div>
            {customOpen && (
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_140px_auto] items-end rounded-lg p-3" style={{ background: 'var(--bg-surface-muted)' }}>
                <Input label="Unit name" value={custom.label} onChange={(e) => setCustom({ ...custom, label: e.target.value })} maxLength={30} placeholder="e.g. Quintal, Cup" />
                <Select label="Kind" value={custom.family} onChange={(e) => setCustom({ ...custom, family: e.target.value })}>
                  <option value="pack">Pack (box, crate...)</option><option value="each">Count (pieces)</option><option value="mass">Weight</option><option value="volume">Liquid</option><option value="length">Length</option>
                </Select>
                {custom.family !== 'pack'
                  ? <Input label={{ mass: 'Grams in 1 unit', volume: 'ml in 1 unit', each: 'Pieces in 1 unit', length: 'cm in 1 unit' }[custom.family]} type="number" min="0" step="any" value={custom.factor} onChange={(e) => setCustom({ ...custom, factor: e.target.value })} />
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

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>Conversions (box, bundle, packet...)</span>
                <Button type="button" size="sm" variant="ghost" icon={Plus} onClick={() => set({ conversions: [...form.conversions, { unit: 'box', quantity: '', ofUnit: form.baseUnit || form.sellingUnit || 'pcs' }] })}>Add conversion</Button>
              </div>
              {form.conversions.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>e.g. 1 Box = 24 pcs, 1 Bundle = 10 pcs, 1 Packet = 500 g. Then the product can be bought and sold by box / bundle / packet and stock is converted automatically.</p>}
              {form.conversions.map((c, i) => {
                const setC = (patch) => set({ conversions: form.conversions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                const base = form.baseUnit || form.sellingUnit;
                const back = base && c.unit && Number(c.quantity) > 0 ? convert(1, c.unit, base, units, pack) : NaN;
                return (
                  <div key={i} className="grid grid-cols-[auto_1fr_auto_100px_1fr_auto] gap-2 items-center text-sm">
                    <span>1</span>
                    <UnitSelect units={units} label="" value={c.unit} filter={(u) => u.family.startsWith('pack:')} onChange={(v) => setC({ unit: v })} />
                    <span>=</span>
                    <input type="number" min="0" step="any" value={c.quantity} onChange={(e) => setC({ quantity: e.target.value })} aria-label={`Conversion ${i + 1} quantity`}
                      className="h-10 rounded-lg border px-2 text-sm text-right bg-[var(--bg-surface)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }} />
                    <UnitSelect units={units} label="" value={c.ofUnit} filter={(u) => !u.family.startsWith('pack:')} onChange={(v) => setC({ ofUnit: v })} />
                    <button type="button" aria-label="Remove conversion" onClick={() => set({ conversions: form.conversions.filter((_, j) => j !== i) })} className="p-1.5 text-graphite-400 hover:text-rose-600"><Trash2 size={15} /></button>
                    {base && c.unit && Number(c.quantity) > 0 && (
                      <span className={`col-span-6 text-xs ${Number.isNaN(back) ? 'text-rose-600' : ''}`} style={Number.isNaN(back) ? undefined : { color: 'var(--text-muted)' }}>
                        {Number.isNaN(back) ? `Does not convert to the stock unit (${units.get(base)?.short}).` : `1 ${units.get(c.unit)?.short} = ${back} ${units.get(base)?.short} of stock`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>Separate rates per unit (optional)</span>
                <Button type="button" size="sm" variant="ghost" icon={Plus} disabled={!form.sellingUnit}
                  onClick={() => set({ unitPrices: [...form.unitPrices, { unit: productUnitList({ ...form, ...pack }, units).find((u) => !form.unitPrices.some((r) => r.unit === u)) || '', sellingPrice: '', purchasePrice: '' }] })}>Add rate</Button>
              </div>
              {form.unitPrices.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Without a separate rate, any unit is priced from the unit price above (e.g. 500 g = half the price per kg). Add one for special rates, e.g. a box sold at Rs 250 instead of 24 x Rs 11.</p>}
              {form.unitPrices.map((r, i) => {
                const setR = (patch) => set({ unitPrices: form.unitPrices.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                const options = productUnitList({ ...form, ...pack, sellingUnit: form.sellingUnit, baseUnit: form.baseUnit || form.sellingUnit }, units);
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                    <Select label="Per unit" value={r.unit} onChange={(e) => setR({ unit: e.target.value })}>
                      <option value="">Choose</option>
                      {[...new Set([r.unit, ...options].filter(Boolean))].map((u) => <option key={u} value={u}>{units.get(u)?.label || u}</option>)}
                    </Select>
                    <Input label="Selling rate (Rs)" type="number" min="0" step="0.01" value={r.sellingPrice} onChange={(e) => setR({ sellingPrice: e.target.value })} />
                    <Input label="Purchase rate (Rs)" type="number" min="0" step="0.01" value={r.purchasePrice} onChange={(e) => setR({ purchasePrice: e.target.value })} />
                    <button type="button" aria-label="Remove rate" onClick={() => set({ unitPrices: form.unitPrices.filter((_, j) => j !== i) })} className="p-1.5 mb-1.5 text-graphite-400 hover:text-rose-600"><Trash2 size={15} /></button>
                  </div>
                );
              })}
            </div>
          </section>

          {full && <H hint={`Prices are per ${perText}, before GST.`}>Pricing &amp; GST</H>}
          <div className={`grid gap-3 grid-cols-2 ${full ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
            {full && <Input label={`Purchase price (₹ / ${perText})`} required={req('product', 'purchasePrice')} type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => set({ purchasePrice: e.target.value })} hint="Default rate on purchase orders" />}
            <Input label={`Unit price (₹ / ${perText})`} required={req('product', 'sellingPrice')} type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => set({ sellingPrice: e.target.value })} hint="Empty = rate typed at billing" />
            <Input label={`MRP (₹ / ${perText})`} required={req('product', 'mrp')} type="number" min="0" step="0.01" value={form.mrp} onChange={(e) => set({ mrp: e.target.value })} />
            <Select label="GST %" value={form.gstRate} onChange={(e) => set({ gstRate: Number(e.target.value) })}>
              {GST_SLABS.map((g) => <option key={g} value={g}>{g}%</option>)}
            </Select>
            <Input label="Discount %" type="number" min="0" max="100" step="any" value={form.discountPercent} onChange={(e) => set({ discountPercent: e.target.value })} />
          </div>
          {full && (sp > 0 || pp > 0) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm rounded-lg px-3 py-2" style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-secondary)' }}>
              {margin !== null && <span>Margin on purchase: <b className={margin < 0 ? 'text-rose-600' : ''}>{margin.toFixed(1)}%</b></span>}
              {pp > 0 && sp > 0 && <span>Profit per {perText}: <b>{formatCurrency(netSp - pp)}</b></span>}
              {sp > 0 && <span>Customer pays (incl. GST): <b>{formatCurrency(withGst)}</b></span>}
              <span className={mrpOk ? '' : 'text-rose-600 font-medium'}>{mrpOk ? 'Within MRP' : 'Above MRP - reduce the price'}</span>
            </div>
          )}

          {full && (
            <section className={sectionCls} style={sectionStyle}>
              <H hint="Stock itself is added only by Inward DC (and changed by Outward DC, billing, returns and Stock Adjustment).">Stock settings &amp; supplier</H>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
                <Input label="Reorder level" type="number" min="0" step="any" value={form.reorderLevel} onChange={(e) => set({ reorderLevel: e.target.value })} hint="Low Stock alert at or below" />
                <Input label="Minimum stock" type="number" min="0" step="any" value={form.minStock} onChange={(e) => set({ minStock: e.target.value })} />
                <Input label="Maximum stock" type="number" min="0" step="any" value={form.maxStock} onChange={(e) => set({ maxStock: e.target.value })} />
                <Input label="Shelf life (days)" type="number" min="0" step="1" value={form.shelfLifeDays} onChange={(e) => set({ shelfLifeDays: e.target.value })} placeholder="e.g. 270" />
                <Select label="Preferred supplier" value={form.primaryVendor} onChange={(e) => set({ primaryVendor: e.target.value })}>
                  <option value="">None</option>
                  {vendorList.map((v) => <option key={v._id} value={v._id}>{v.name}{v.verificationStatus && v.verificationStatus !== 'verified' ? ' (not verified)' : ''}</option>)}
                </Select>
              </div>
            </section>
          )}

          {full && (
            <section className={sectionCls} style={sectionStyle}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <H hint="Your own fields, e.g. Variety, Pack size, Origin, Grade, Flavour.">Additional details</H>
                <Button type="button" size="sm" variant="ghost" icon={Plus} onClick={() => set({ attributes: [...form.attributes, { name: '', value: '' }] })} disabled={form.attributes.length >= 30}>Add detail</Button>
              </div>
              <datalist id="attribute-names">{ATTRIBUTE_SUGGESTIONS.map((n) => <option key={n} value={n} />)}</datalist>
              {form.attributes.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>None yet.</p>}
              {form.attributes.map((a, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
                  <input list="attribute-names" value={a.name} placeholder="Detail (e.g. Variety)" maxLength={40} onChange={(e) => setAttr(i, { name: e.target.value })} aria-label={`Detail ${i + 1} name`}
                    className="h-9 rounded-lg border px-3 text-sm bg-[var(--bg-surface)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }} />
                  <input value={a.value} placeholder="Value (e.g. Ponni)" maxLength={120} onChange={(e) => setAttr(i, { value: e.target.value })} aria-label={`Detail ${i + 1} value`}
                    className="h-9 rounded-lg border px-3 text-sm bg-[var(--bg-surface)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }} />
                  <button type="button" aria-label="Remove detail" onClick={() => set({ attributes: form.attributes.filter((_, j) => j !== i) })} className="p-1.5 rounded-lg text-graphite-400 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
              ))}
            </section>
          )}

          {requestMode && product && (
            <Textarea label="Reason for the change (sent to the administrator)" required={req('editRequest', 'reason')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          )}

          {product && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Available stock: <b>{units.size ? fmtQty(stock || 0, productUnits(product, units).baseUnit, units) : stock || 0}</b>
              <span style={{ color: 'var(--text-muted)' }}> — changed through Inward / Outward DC and Stock Adjustment.</span>
            </p>
          )}

        </form>
  );
}

// The original quick Add / Edit dialog (Product Master), unchanged in behaviour.
export function ProductFormDialog({ open, product, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={product ? 'Edit Product' : 'Add Product'} size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="product-form" loading={saving}>Save</Button></>}
    >
      {open && <ProductForm open={open} product={product} onSaved={onSaved} onSavingChange={setSaving} />}
    </Modal>
  );
}

export default ProductFormDialog;
