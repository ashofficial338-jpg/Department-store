import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-graphite-950/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`relative w-full ${widths[size]} surface-card shadow-premium-lg rounded-2xl max-h-[90vh] flex flex-col overflow-hidden`}
          >
            <div className="relative flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-base sm:text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h3>
              <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-[var(--hover-tint)] transition-colors" style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="relative px-5 sm:px-6 py-5 overflow-y-auto">{children}</div>
            {footer && <div className="relative px-5 sm:px-6 py-3.5 border-t flex flex-wrap justify-end gap-2.5" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-muted)' }}>{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default Modal;
