import { BadgeCheck, Clock3, XCircle, PauseCircle } from 'lucide-react';

export const VENDOR_STATUS = {
  pending: { label: 'Pending Verification', short: 'Pending', fg: '--status-warning', bg: '--status-warning-bg', icon: Clock3 },
  verified: { label: 'Verified', short: 'Verified', fg: '--status-success', bg: '--status-success-bg', icon: BadgeCheck },
  rejected: { label: 'Rejected', short: 'Rejected', fg: '--status-danger', bg: '--status-danger-bg', icon: XCircle },
  on_hold: { label: 'On Hold', short: 'On Hold', fg: '--status-info', bg: '--status-info-bg', icon: PauseCircle },
};

// Verification status pill shown next to a vendor's name everywhere (Vendor Management, POs, invoices,
// DCs, payables). `compact` = icon + short label.
export function VendorStatusBadge({ status = 'pending', compact = false }) {
  const s = VENDOR_STATUS[status] || VENDOR_STATUS.pending;
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold whitespace-nowrap align-middle"
      style={{ color: `var(${s.fg})`, background: `var(${s.bg})` }} title={`Vendor: ${s.label}`}>
      <Icon size={12} strokeWidth={2.4} aria-hidden />
      {compact ? s.short : s.label}
    </span>
  );
}

// "Vendor name  [status]" - status hidden for verified vendors in compact lists unless `always`.
export function VendorName({ vendor, always = false }) {
  if (!vendor) return <span>-</span>;
  const status = vendor.verificationStatus || 'pending';
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span>{vendor.name}</span>
      {(always || status !== 'verified') && <VendorStatusBadge status={status} compact />}
    </span>
  );
}

export default VendorStatusBadge;
