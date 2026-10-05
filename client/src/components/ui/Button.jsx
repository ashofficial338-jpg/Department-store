import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'btn-primary sheen bg-graphite-900 text-white hover:bg-graphite-800 shadow-[0_8px_20px_-10px_rgba(11,12,16,0.6)] focus-visible:ring-graphite-900',
  gold: 'sheen bg-gold-gradient text-graphite-950 shadow-gold hover:shadow-gold-glow focus-visible:ring-gold-500',
  outline: 'border border-[var(--border-strong)] text-[var(--text-primary)] bg-[var(--bg-surface)] hover:border-gold-400 hover:text-gold-700 dark:hover:text-gold-300 focus-visible:ring-gold-400',
  ghost: 'text-[var(--text-secondary)] hover:bg-[var(--hover-tint)] hover:text-[var(--text-primary)] focus-visible:ring-graphite-300',
  danger: 'sheen bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-[0_8px_20px_-10px_rgba(225,29,72,0.7)] hover:from-rose-600 hover:to-rose-700 focus-visible:ring-rose-600',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-5 py-2.5 text-sm rounded-xl',
};

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...props }) {
  return (
    <button
      className={clsx(
        'group inline-flex items-center justify-center gap-2 font-semibold tracking-[-0.005em] transition-all duration-300 ease-luxe',
        'hover:-translate-y-px active:translate-y-0 active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none',
        VARIANTS[variant], SIZES[size], className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading
        ? <Loader2 size={16} className="relative z-[2] animate-spin" />
        : Icon ? <Icon size={16} className="relative z-[2] transition-transform duration-300 ease-luxe group-hover:scale-110" /> : null}
      {children !== undefined && children !== null && <span className="relative z-[2]">{children}</span>}
    </button>
  );
}

export default Button;
