import { Inbox } from 'lucide-react';

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="relative mb-5 animate-float">
        <div className="absolute inset-0 rounded-2xl bg-brand-400/30 blur-xl" />
        <div className="relative w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center ring-1 ring-inset ring-brand-500/20">
          <Icon size={24} />
        </div>
      </div>
      <h3 className="font-display text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {description && <p className="text-sm max-w-sm mb-4" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      {action}
    </div>
  );
}

export default EmptyState;
