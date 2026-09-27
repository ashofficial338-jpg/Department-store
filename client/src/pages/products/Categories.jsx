import { useEffect, useState } from 'react';
import CrudManager from '../../components/CrudManager.jsx';
import { categoryService } from '../../services/index.js';
import { Input, Select, Textarea } from '../../components/ui/index.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';

export function Categories() {
  const [parents, setParents] = useState([]);

  useEffect(() => { categoryService.listAll().then((r) => setParents(r.data)); }, []);

  return (
    <CrudManager
      title="Categories"
      entityLabel="Category"
      service={categoryService}
      crumbs={[{ label: 'Products', to: '/products' }, { label: 'Categories' }]}
      defaultValues={{ name: '', slug: '', parent: '', description: '', status: 'active' }}
      columns={[
        { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'parent', header: 'Parent', render: (r) => r.parent?.name || <span style={{ color: 'var(--text-muted)' }}>Top-level</span> },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'name', label: 'Category Name', required: true, component: Input },
        { name: 'slug', label: 'Slug', required: true, component: Input, props: { placeholder: 'e.g. mens-fashion' } },
        {
          name: 'parent', label: 'Parent Category (optional)', component: Select,
          options: [{ value: '', label: 'None - top level' }, ...parents.filter((p) => !p.parent).map((p) => ({ value: p._id, label: p.name }))],
        },
        { name: 'description', label: 'Description', component: Textarea },
        { name: 'status', label: 'Status', component: Select, options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
      ]}
    />
  );
}

export default Categories;
