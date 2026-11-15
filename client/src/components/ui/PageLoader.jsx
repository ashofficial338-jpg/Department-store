// Shown while a code-split page is downloading: the AURELIA mark with a pulsing gold ring.
export function PageLoader() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <span className="relative w-12 h-12">
        <span className="absolute inset-0 rounded-2xl bg-gold-400/40 animate-pulse-ring motion-reduce:animate-none" />
        <span className="relative w-12 h-12 rounded-2xl bg-gold-gradient shadow-gold flex items-center justify-center font-display font-bold text-xl text-graphite-950">
          A
          <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/40" />
        </span>
      </span>
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
      <span className="sr-only">Loading page…</span>
    </div>
  );
}

export default PageLoader;
