import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-graphite-900 text-white hover:bg-graphite-800 focus-visible:ring-graphite-900',
  gold: 'bg-gold-500 text-graphite-950 hover:bg-gold-600 shadow-gold focus-visible:ring-gold-500',
  outline: 'border border-graphite-300 text-graphite-800 hover:bg-graphite-50 focus-visible:ring-graphite-400',
  ghost: 'text-graphite-700 hover:bg-graphite-100 focus-visible:ring-graphite-300',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...props }) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        VARIANTS[variant], SIZES[size], className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

export default Button;
