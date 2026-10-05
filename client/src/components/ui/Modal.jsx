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
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-graphite-950/55 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={`relative w-full ${widths[size]} surface-card shadow-premium-lg rounded-[1.5rem] max-h-[88vh] flex flex-col overflow-hidden`}
          >
            <div className="h-[3px] w-full shrink-0 bg-gold-gradient opacity-90" />
            <div className="pointer-events-none absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gold-400/10 blur-3xl" />
            <div className="relative flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <h3 className="font-display text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
              <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-xl hover:bg-graphite-100 text-graphite-500 transition-transform duration-300 hover:rotate-90">
                <X size={18} />
              </button>
            </div>
            <div className="relative px-6 py-5 overflow-y-auto">{children}</div>
            {footer && <div className="relative px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-muted)' }}>{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default Modal;
