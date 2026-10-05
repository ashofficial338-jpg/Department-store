import { Inbox } from 'lucide-react';

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="relative mb-5 animate-float">
        <div className="absolute inset-0 rounded-2xl bg-gold-400/30 blur-xl" />
        <div className="relative w-16 h-16 rounded-2xl bg-gold-gradient text-graphite-950 flex items-center justify-center shadow-gold rotate-3">
          <Icon size={26} />
          <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/40" />
        </div>
      </div>
      <h3 className="font-display text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {description && <p className="text-sm max-w-sm mb-4" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      {action}
    </div>
  );
}

export default EmptyState;
