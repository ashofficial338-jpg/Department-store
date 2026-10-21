import { Loader2 } from 'lucide-react';

// Shown while a code-split page is downloading.
export function PageLoader() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-live="polite">
      <Loader2 size={22} className="animate-spin text-gold-600" />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}

export default PageLoader;
