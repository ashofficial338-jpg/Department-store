import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Button } from '../../components/ui/index.js';
import PageLoader from '../../components/ui/PageLoader.jsx';
import { ProductForm } from '../../components/products/ProductFormDialog.jsx';
import { productService } from '../../services/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';

// Create / edit one product with all its details on its own page (Products > Product Master > New Product).
// Administrators save directly; other users can create new products, and send changes to existing ones to an
// administrator as an Edit Request.
export function ProductEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    productService.getOne(id).then((r) => setProduct(r.data)).catch((err) => { toast.error(err.message); navigate('/products'); }).finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return <PageLoader />;
  const requestMode = !!id && !admin;
  const title = id ? (requestMode ? `Request change: ${product?.name || ''}` : `Edit ${product?.name || 'product'}`) : 'New Product';

  return (
    <div className="max-w-5xl">
      <PageHeader title={title} crumbs={[{ label: 'Products', to: '/products' }, { label: 'Product Master', to: '/products' }, { label: id ? 'Edit' : 'New' }]}
        actions={(
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(id ? `/products/${id}` : '/products')}>Cancel</Button>
            <Button type="submit" form="product-page-form" loading={saving}>{requestMode ? 'Send to Admin' : 'Save Product'}</Button>
          </div>
        )} />
      <div className="surface-card rounded-xl p-4 sm:p-6">
        <ProductForm full product={product} requestMode={requestMode} formId="product-page-form" onSavingChange={setSaving}
          onSaved={(p, info) => navigate(info?.requested ? `/products/${id}` : `/products/${p._id}`)} />
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={() => navigate(id ? `/products/${id}` : '/products')}>Cancel</Button>
        <Button type="submit" form="product-page-form" loading={saving}>{requestMode ? 'Send to Admin' : 'Save Product'}</Button>
      </div>
    </div>
  );
}

export default ProductEditor;
