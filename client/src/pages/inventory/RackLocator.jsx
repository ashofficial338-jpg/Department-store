import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, Plus, Pencil, Trash2, X, MapPin, PackageSearch } from 'lucide-react';
import { rackItemService } from '../../services/index.js';
import { PageHeader, Button, Modal, ConfirmDialog, Input, EmptyState, CardSkeleton } from '../../components/ui/index.js';

const EMPTY_FORM = { name: '', serialNumber: '', rack: '', quantity: '' };
const naturalCompare = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

// Best matches first: exact serial, then names/serials that start with the query, then everything else.
function rank(item, q) {
  const name = item.name.toLowerCase();
  const serial = item.serialNumber.toLowerCase();
  if (serial === q || name === q) return 0;
  if (name.startsWith(q) || serial.startsWith(q)) return 1;
  if (item.rack.toLowerCase() === q) return 2;
  return 3;
}

function RackBadge({ rack, size = 'lg' }) {
  const big = size === 'lg';
  return (
    <div
      className={`shrink-0 flex flex-col items-center justify-center rounded-2xl bg-gold-gradient text-graphite-950 shadow-gold ${big ? 'w-24 h-24 sm:w-28 sm:h-28' : 'w-12 h-12'}`}
      aria-label={`Rack ${rack}`}
    >
      {big && <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-75">Rack</span>}
      <span className={`font-display font-bold leading-none break-all text-center px-1 ${big ? (rack.length > 3 ? 'text-2xl' : 'text-5xl') : (rack.length > 3 ? 'text-xs' : 'text-xl')}`}>
        {rack}
      </span>
    </div>
  );
}

function Quantity({ value }) {
  if (value === 0) return <span className="text-sm font-semibold text-rose-600">Out of stock</span>;
  return (
    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
      Qty <span className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </span>
  );
}

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={onEdit} aria-label="Edit product" className="p-2.5 rounded-xl hover:bg-[var(--hover-tint)]" style={{ color: 'var(--text-secondary)' }}>
        <Pencil size={17} />
      </button>
      <button onClick={onDelete} aria-label="Delete product" className="p-2.5 rounded-xl hover:bg-rose-50 text-rose-600">
        <Trash2 size={17} />
      </button>
    </div>
  );
}

export function RackLocator() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, item = edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [removing, setRemoving] = useState(false);
  const searchRef = useRef(null);

  const load = async () => {
    try {
      const res = await rackItemService.list();
      setItems(res.data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const q = query.trim().toLowerCase();

  // Filtering happens in the browser so results appear on every keystroke.
  const results = useMemo(() => {
    if (!q) return [];
    return items
      .filter((i) => i.name.toLowerCase().includes(q) || i.serialNumber.toLowerCase().includes(q) || i.rack.toLowerCase().includes(q))
      .sort((a, b) => rank(a, q) - rank(b, q) || naturalCompare(a.name, b.name));
  }, [items, q]);

  const byRack = useMemo(() => {
    const groups = new Map();
    items.forEach((i) => {
      if (!groups.has(i.rack)) groups.set(i.rack, []);
      groups.get(i.rack).push(i);
    });
    return [...groups.entries()].sort(([a], [b]) => naturalCompare(a, b));
  }, [items]);

  const racks = byRack.map(([rack]) => rack);

  const openForm = (item) => {
    setEditing(item || {});
    setForm(item ? { name: item.name, serialNumber: item.serialNumber, rack: item.rack, quantity: String(item.quantity) } : EMPTY_FORM);
  };
  const closeForm = () => setEditing(null);

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      serialNumber: form.serialNumber.trim(),
      rack: form.rack.trim(),
      quantity: Number(form.quantity || 0),
    };
    if (!payload.name || !payload.serialNumber || !payload.rack) return toast.error('Name, serial number and rack are required.');
    if (!Number.isFinite(payload.quantity) || payload.quantity < 0) return toast.error('Quantity must be 0 or more.');
    setSaving(true);
    try {
      if (editing._id) {
        await rackItemService.update(editing._id, payload);
        toast.success('Product updated.');
      } else {
        await rackItemService.create(payload);
        toast.success(`Added to Rack ${payload.rack.toUpperCase()}.`);
      }
      closeForm();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setRemoving(true);
    try {
      await rackItemService.remove(deleting._id);
      toast.success('Product deleted.');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemoving(false);
    }
  };

  const setField = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Rack Locator"
        subtitle="Type a product name, serial number or rack to see exactly where it is."
        crumbs={[{ label: 'Inventory', to: '/inventory/overview' }, { label: 'Rack Locator' }]}
        actions={<Button variant="gold" icon={Plus} onClick={() => openForm()}>Add Product</Button>}
      />

      {/* Search */}
      <div className="sticky top-16 z-20 -mx-1 px-1 pb-4 pt-2" style={{ background: 'var(--bg-app)' }}>
        <div className="relative">
          <Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            ref={searchRef}
            autoFocus
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search e.g. Dolo 650, D650001 or rack D"
            aria-label="Search products by name, serial number or rack"
            className="w-full rounded-2xl border pl-12 pr-12 py-4 text-lg surface-card shadow-premium focus:outline-none focus:!border-gold-400 transition-colors"
            style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl hover:bg-[var(--hover-tint)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <CardSkeleton />
      ) : q ? (
        /* Search results: rack shown big so staff can walk straight to it */
        results.length === 0 ? (
          <div className="surface-card rounded-2xl shadow-premium">
            <EmptyState icon={PackageSearch} title="No product found" description={`Nothing matches "${query.trim()}". Check the spelling or add it as a new product.`} />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              {results.length} {results.length === 1 ? 'match' : 'matches'}
            </p>
            {results.map((item) => (
              <div key={item._id} className="surface-card rounded-2xl shadow-premium p-4 flex items-center gap-4">
                <RackBadge rack={item.rack} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gold-700 dark:text-gold-300 mb-1">
                    <MapPin size={13} /> Go to Rack {item.rack}
                  </div>
                  <h3 className="font-display text-lg sm:text-xl font-semibold leading-snug break-words" style={{ color: 'var(--text-primary)' }}>{item.name}</h3>
                  <div className="font-mono text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{item.serialNumber}</div>
                  <div className="mt-1.5"><Quantity value={item.quantity} /></div>
                </div>
                <RowActions onEdit={() => openForm(item)} onDelete={() => setDeleting(item)} />
              </div>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <div className="surface-card rounded-2xl shadow-premium">
          <EmptyState
            icon={MapPin}
            title="No products yet"
            description="Add your first product and assign it to a rack."
            action={<Button variant="gold" icon={Plus} onClick={() => openForm()}>Add Product</Button>}
          />
        </div>
      ) : (
        /* Rack-wise view */
        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            {items.length} products across {byRack.length} {byRack.length === 1 ? 'rack' : 'racks'}
          </p>
          {byRack.map(([rack, list]) => (
            <section key={rack} className="surface-card rounded-2xl shadow-premium overflow-hidden">
              <header className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-muted)' }}>
                <RackBadge rack={rack} size="sm" />
                <div>
                  <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Rack {rack}</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{list.length} {list.length === 1 ? 'product' : 'products'}</p>
                </div>
              </header>
              <ul>
                {list.map((item) => (
                  <li key={item._id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium break-words" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
                      <div className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{item.serialNumber}</div>
                    </div>
                    <Quantity value={item.quantity} />
                    <RowActions onEdit={() => openForm(item)} onDelete={() => setDeleting(item)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={closeForm}
        title={editing?._id ? 'Edit Product' : 'Add Product'}
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button type="submit" form="rack-item-form" loading={saving}>{editing?._id ? 'Save Changes' : 'Add Product'}</Button>
          </>
        )}
      >
        <form id="rack-item-form" onSubmit={save} className="space-y-4">
          <Input label="Product Name" required autoFocus value={form.name} onChange={setField('name')} placeholder="Dolo 650" />
          <Input label="Serial Number" required value={form.serialNumber} onChange={setField('serialNumber')} placeholder="D650001" className="font-mono uppercase" autoCapitalize="characters" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Rack" required value={form.rack} onChange={setField('rack')} placeholder="D" list="rack-options" className="uppercase" autoCapitalize="characters" />
            <Input label="Quantity" type="number" min="0" step="1" inputMode="numeric" value={form.quantity} onChange={setField('quantity')} placeholder="20" />
          </div>
          <datalist id="rack-options">
            {racks.map((r) => <option key={r} value={r} />)}
          </datalist>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={removing}
        title="Delete product?"
        confirmLabel="Delete"
        description={deleting ? `"${deleting.name}" (${deleting.serialNumber}) will be removed from Rack ${deleting.rack}.` : ''}
      />
    </div>
  );
}

export default RackLocator;
