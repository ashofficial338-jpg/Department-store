import clsx from 'clsx';

const STYLES = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  danger: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  neutral: 'bg-graphite-100 text-graphite-600 ring-graphite-500/20',
  gold: 'bg-gold-100 text-gold-800 ring-gold-600/20',
};

const STATUS_MAP = {
  active: 'success', completed: 'success', received: 'success', paid: 'success', approved: 'success', dispatched: 'success',
  pending: 'warning', draft: 'neutral', held: 'warning', partially_received: 'warning', partially_returned: 'warning', picking: 'warning', packed: 'warning',
  cancelled: 'danger', rejected: 'danger', inactive: 'danger', expired: 'danger', discontinued: 'danger', out_of_stock: 'danger',
  ordered: 'info', invoiced: 'info', in_transit: 'info',
};

export function StatusBadge({ status, variant, label }) {
  const key = (status || '').toLowerCase();
  const resolvedVariant = variant || STATUS_MAP[key] || 'neutral';
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset capitalize', STYLES[resolvedVariant])}>
      {(label || status || '').replace(/_/g, ' ')}
    </span>
  );
}

export default StatusBadge;
