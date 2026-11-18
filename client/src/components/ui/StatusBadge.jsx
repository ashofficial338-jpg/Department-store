// One status language for the whole app: colour + dot + text label (never colour alone).
// Colours come from the --status-* tokens in index.css, so light and dark mode stay in step.
const VARIANT_VARS = {
  success: ['--status-success', '--status-success-bg'],
  warning: ['--status-warning', '--status-warning-bg'],
  danger: ['--status-danger', '--status-danger-bg'],
  info: ['--status-info', '--status-info-bg'],
  neutral: ['--status-neutral', '--status-neutral-bg'],
  gold: ['--brand', '--brand-soft'],
};

const STATUS_MAP = {
  active: 'success', completed: 'success', received: 'success', paid: 'success', approved: 'success', dispatched: 'success', success: 'success', restocked: 'success',
  pending: 'warning', held: 'warning', partially_received: 'warning', partially_returned: 'warning', picking: 'warning', packed: 'warning', warning: 'warning', low_stock: 'warning', partial: 'warning',
  cancelled: 'danger', rejected: 'danger', expired: 'danger', discontinued: 'danger', out_of_stock: 'danger', error: 'danger', failed: 'danger', blocked: 'danger', damaged: 'danger', overdue: 'danger',
  ordered: 'info', invoiced: 'info', in_transit: 'info', returned: 'info', info: 'info',
  inactive: 'neutral', draft: 'neutral', exhausted: 'neutral',
};

export function StatusBadge({ status, variant, label }) {
  const key = (status || '').toLowerCase();
  const resolved = variant || STATUS_MAP[key] || 'neutral';
  const [fg, bg] = VARIANT_VARS[resolved] || VARIANT_VARS.neutral;
  return (
    <span
      className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold capitalize whitespace-nowrap"
      style={{ color: `var(${fg})`, background: `var(${bg})`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(${fg}) 20%, transparent)` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'currentColor' }} aria-hidden />
      {(label || status || '').replace(/_/g, ' ')}
    </span>
  );
}

export default StatusBadge;
