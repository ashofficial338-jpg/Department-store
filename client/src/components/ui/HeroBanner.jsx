import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1];

function trackGlow(e) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

// Dark, animated welcome panel in the same visual language as the sign-in screen.
// `meta` sits under the title (date, status...), `actions` on the right, `children` below.
export function HeroBanner({ eyebrow, title, meta, actions, children }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      onMouseMove={trackGlow}
      className="hero-panel rounded-[1.75rem] px-5 py-6 sm:px-8 sm:py-8 mb-7 shadow-premium-lg"
    >
      <span className="hero-grid" />
      <span className="absolute -z-10 -top-28 -right-20 w-80 h-80 rounded-full bg-gold-500/25 blur-[90px] animate-aurora motion-reduce:animate-none" />
      <span className="absolute -z-10 -bottom-32 left-1/4 w-72 h-72 rounded-full bg-[#7E90B0]/20 blur-[90px] animate-aurora-slow motion-reduce:animate-none" />
      <span className="absolute top-0 inset-x-16 h-px bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {eyebrow && (
            <motion.span
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
              className="inline-flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.2em] uppercase text-gold-300/90 px-3 py-1.5 rounded-full border border-gold-400/20 bg-gold-500/10 mb-4"
            >
              <Sparkles size={12} /> {eyebrow}
            </motion.span>
          )}
          <motion.h1
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.12 }}
            className="font-display text-[1.9rem] sm:text-[2.4rem] leading-[1.1] font-semibold text-white"
          >
            {title}
          </motion.h1>
          {meta && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }}
              className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-graphite-300"
            >
              {meta}
            </motion.div>
          )}
        </div>
        {actions && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
            className="flex flex-wrap items-center gap-2"
          >
            {actions}
          </motion.div>
        )}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </motion.section>
  );
}

export default HeroBanner;
