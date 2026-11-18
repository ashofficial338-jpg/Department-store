import { Inbox } from 'lucide-react';

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="relative mb-4">
        <div className="absolute -inset-3 rounded-full bg-gold-500/10 blur-md" aria-hidden />
        <div className="relative w-14 h-14 rounded-2xl bg-gold-50 text-gold-600 ring-1 ring-inset ring-gold-600/15 flex items-center justify-center">
          <Icon size={24} strokeWidth={1.8} />
        </div>
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {description && <p className="text-sm max-w-sm mb-4" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      {action}
    </div>
  );
}

export default EmptyState;
