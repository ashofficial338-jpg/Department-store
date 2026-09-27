import clsx from 'clsx';

export function Skeleton({ className }) {
  return <div className={clsx('skeleton animate-shimmer rounded-md', className)} />;
}

export function CardSkeleton() {
  return (
    <div className="surface-card rounded-xl2 p-5 shadow-premium">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-7 w-32 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
