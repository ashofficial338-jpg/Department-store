import clsx from 'clsx';

const baseInput = 'w-full rounded-xl border px-3.5 py-2.5 text-sm bg-[var(--bg-surface)] hover:border-[var(--border-strong)] focus:outline-none focus:!border-gold-400 transition-all duration-300 placeholder:text-graphite-400';

function Wrapper({ label, error, hint, required, children }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-semibold mb-1.5 tracking-[0.01em]" style={{ color: 'var(--text-secondary)' }}>
          {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
      {error && <span className="block text-xs mt-1 text-rose-600">{error}</span>}
    </label>
  );
}

export function Input({ label, error, hint, required, className, ...props }) {
  return (
    <Wrapper label={label} error={error} hint={hint} required={required}>
      <input
        className={clsx(baseInput, error ? 'border-rose-400' : 'border-graphite-300', className)}
        style={{ color: 'var(--text-primary)', borderColor: error ? undefined : 'var(--border-subtle)' }}
        {...props}
      />
    </Wrapper>
  );
}

export function Select({ label, error, hint, required, className, children, ...props }) {
  return (
    <Wrapper label={label} error={error} hint={hint} required={required}>
      <select
        className={clsx(baseInput, 'cursor-pointer', error ? 'border-rose-400' : 'border-graphite-300', className)}
        style={{ color: 'var(--text-primary)', borderColor: error ? undefined : 'var(--border-subtle)' }}
        {...props}
      >
        {children}
      </select>
    </Wrapper>
  );
}

export function Textarea({ label, error, hint, required, className, ...props }) {
  return (
    <Wrapper label={label} error={error} hint={hint} required={required}>
      <textarea
        className={clsx(baseInput, 'resize-none', error ? 'border-rose-400' : 'border-graphite-300', className)}
        style={{ color: 'var(--text-primary)', borderColor: error ? undefined : 'var(--border-subtle)' }}
        rows={3}
        {...props}
      />
    </Wrapper>
  );
}

export function CurrencyInput({ label, error, hint, required, className, ...props }) {
  return (
    <Wrapper label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>{'₹'}</span>
        <input
          type="number" step="0.01"
          className={clsx(baseInput, 'pl-7', error ? 'border-rose-400' : 'border-graphite-300', className)}
          style={{ color: 'var(--text-primary)', borderColor: error ? undefined : 'var(--border-subtle)' }}
          {...props}
        />
      </div>
    </Wrapper>
  );
}

export default { Input, Select, Textarea, CurrencyInput };
