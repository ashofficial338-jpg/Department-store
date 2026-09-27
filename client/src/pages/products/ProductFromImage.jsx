import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { UploadCloud, Sparkles, Info, ArrowRight } from 'lucide-react';
import { PageHeader, Button } from '../../components/ui/index.js';
import { productService } from '../../services/index.js';

const STEPS = ['Upload Image', 'Extract Information', 'Review', 'Create Product'];

export function ProductFromImage() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStep(1);
    setResult(null);
  }

  async function handleExtract() {
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await productService.extractFromImage(formData);
      setResult(res);
      setStep(2);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Create Product from Image" crumbs={[{ label: 'Products', to: '/products' }, { label: 'Create from Image' }]} />

      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${i <= step ? 'bg-gold-500 text-graphite-950' : 'bg-graphite-100 text-graphite-400'}`}>{i + 1}</div>
            <span className="text-xs" style={{ color: i <= step ? 'var(--text-primary)' : 'var(--text-muted)' }}>{s}</span>
            {i < STEPS.length - 1 && <ArrowRight size={12} className="text-graphite-300 mx-1" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card rounded-xl2 shadow-premium p-6">
          <h3 className="font-display text-base font-semibold mb-4">1. Upload Product Image</h3>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl2 py-12 cursor-pointer hover:border-gold-400 transition-colors" style={{ borderColor: 'var(--border-subtle)' }}>
            <UploadCloud size={28} className="text-graphite-400" />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Click to upload a JPG, PNG or WEBP image</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>

          {preview && (
            <div className="mt-4">
              <img src={preview} alt="Preview" className="w-full max-h-64 object-contain rounded-xl2 border" style={{ borderColor: 'var(--border-subtle)' }} />
              <Button className="mt-4 w-full" icon={Sparkles} onClick={handleExtract} loading={extracting}>Extract Product Information</Button>
            </div>
          )}
        </div>

        <div className="surface-card rounded-xl2 shadow-premium p-6">
          <h3 className="font-display text-base font-semibold mb-4">2-3. Extraction Result</h3>
          {!result && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Upload an image and run extraction to see results here.</p>}

          {result && !result.available && (
            <div className="flex gap-3 p-4 rounded-xl bg-sky-50 border border-sky-100">
              <Info size={18} className="text-sky-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-sky-900 mb-1">AI extraction is not configured</p>
                <p className="text-xs text-sky-700">{result.message}</p>
                <Button size="sm" className="mt-3" variant="outline" onClick={() => navigate('/products')}>
                  Create Product Manually
                </Button>
              </div>
            </div>
          )}

          {result?.available && result.extracted && (
            <div className="space-y-3">
              {Object.entries(result.extracted).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="capitalize" style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
              <Button className="w-full mt-2" onClick={() => navigate('/products')}>Review &amp; Create Product</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductFromImage;
