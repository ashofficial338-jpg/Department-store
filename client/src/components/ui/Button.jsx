import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'btn-primary bg-gold-600 text-white hover:bg-gold-700 shadow-[0_1px_2px_rgba(15,23,42,0.12),0_4px_10px_-4px_rgba(79,70,229,0.45)] focus-visible:ring-gold-500',
  gold: 'bg-gold-gradient text-white shadow-gold hover:shadow-gold-glow focus-visible:ring-gold-500',
  outline: 'border border-[var(--border-strong)] text-[var(--text-primary)] bg-[var(--bg-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-[var(--bg-surface-muted)] hover:border-gold-300 hover:text-gold-700 dark:hover:text-gold-300 focus-visible:ring-gold-400',
  ghost: 'text-[var(--text-secondary)] hover:bg-[var(--hover-tint)] hover:text-[var(--text-primary)] focus-visible:ring-graphite-300',
  danger: 'bg-rose-600 text-white shadow-[0_1px_2px_rgba(15,23,42,0.12),0_4px_10px_-4px_rgba(225,29,72,0.45)] hover:bg-rose-700 focus-visible:ring-rose-600',
};

// Fixed heights keep buttons, inputs and selects on one baseline in every toolbar.
const SIZES = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-9 px-4 text-sm rounded-lg',
  lg: 'h-11 px-5 text-sm rounded-lg',
};

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...props }) {
  return (
    <button
      className={clsx(
        'group inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none transition-all duration-200 ease-luxe',
        'active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none',
        VARIANTS[variant], SIZES[size], className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading
        ? <Loader2 size={16} className="relative z-[2] animate-spin" />
        : Icon ? <Icon size={16} strokeWidth={2} className="relative z-[2] shrink-0" /> : null}
      {children !== undefined && children !== null && <span className="relative z-[2]">{children}</span>}
    </button>
  );
}

export default Button;
