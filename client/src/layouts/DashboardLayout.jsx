import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, RefreshCw, WifiOff } from 'lucide-react';
import PageLoader from '../components/ui/PageLoader.jsx';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import MobileNav from './MobileNav.jsx';
import useResponsiveTables from '../hooks/useResponsiveTables.js';
import { ServerStatusProvider, useServer } from '../context/ServerStatusContext.jsx';

const EASE = [0.22, 1, 0.36, 1];

// Thin gold bar that sweeps across the top on every navigation.
function RouteProgress({ routeKey }) {
  return (
    <AnimatePresence>
      <motion.div
        key={routeKey}
        className="fixed top-0 left-0 right-0 h-[2px] z-[60] origin-left bg-gold-gradient pointer-events-none"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: [1, 1, 0] }}
        transition={{ scaleX: { duration: 0.6, ease: EASE }, opacity: { duration: 0.9, times: [0, 0.7, 1] } }}
        style={{ boxShadow: '0 0 12px rgba(194,154,86,0.7)' }}
      />
    </AnimatePresence>
  );
}

// Slow-moving champagne / slate glows behind every page (same language as the sign-in screen).
function AmbientBackground() {
  return (
    <div aria-hidden className="ambient no-print">
      <span className="ambient-orb ambient-orb--gold animate-aurora" />
      <span className="ambient-orb ambient-orb--slate animate-aurora-slow" />
      <span className="ambient-grid" />
    </div>
  );
}

// Shown under the header whenever the API health check fails.
function OfflineBanner() {
  const { status, recheck } = useServer();
  const [checking, setChecking] = useState(false);
  async function retry() {
    setChecking(true);
    await recheck();
    setChecking(false);
  }
  return (
    <AnimatePresence>
      {status === 'offline' && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="overflow-hidden no-print"
          role="alert"
        >
          <div className="mx-3.5 sm:mx-6 md:mx-8 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-200">
            <span className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0"><WifiOff size={16} /></span>
            <span className="flex-1 min-w-[12rem] leading-snug">
              <b>Server unreachable.</b> Data may be out of date and changes won&apos;t be saved until the API is back. Retrying automatically…
            </span>
            <button
              type="button" onClick={retry}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 px-3 py-1.5 font-semibold hover:bg-amber-500/15 transition-colors"
            >
              <RefreshCw size={13} className={checking ? 'animate-spin' : ''} /> Retry now
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ScrollTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          aria-label="Back to top"
          title="Back to top"
          initial={{ opacity: 0, y: 16, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.8 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.3, ease: EASE }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="no-print fixed bottom-24 lg:bottom-6 right-4 lg:right-6 z-40 w-11 h-11 rounded-2xl bg-gold-gradient text-graphite-950 shadow-gold hover:shadow-gold-glow flex items-center justify-center"
        >
          <ArrowUp size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('aurelia_sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useResponsiveTables();

  useEffect(() => {
    try { localStorage.setItem('aurelia_sidebar_collapsed', String(collapsed)); } catch { /* storage unavailable */ }
  }, [collapsed]);

  // New page starts at the top.
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);

  return (
    <ServerStatusProvider>
      <AmbientBackground />
      <div className="relative flex min-h-screen">
        <RouteProgress routeKey={location.pathname} />
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          <Header onMenuClick={() => setMobileOpen(true)} />
          <OfflineBanner />
          <main className="flex-1 px-3.5 sm:px-6 py-5 sm:py-6 md:px-8 md:py-8 max-w-[1600px] w-full mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
                // Clear the filter afterwards: a lingering filter would trap position:fixed children (POS bars, popovers).
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
                exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <Suspense fallback={<PageLoader />}><Outlet /></Suspense>
              </motion.div>
            </AnimatePresence>
          </main>
          <footer className="px-4 md:px-8 pb-24 lg:pb-6 max-w-[1600px] w-full mx-auto text-[11px] flex items-center justify-between no-print" style={{ color: 'var(--text-muted)' }}>
            <span>© {new Date().getFullYear()} AURELIA Department Store</span>
            <span className="hidden sm:inline tracking-[0.2em] uppercase">Crafted for retail excellence</span>
          </footer>
        </div>
        {/* POS has its own fixed action bar in that corner. */}
        {!location.pathname.startsWith('/pos') && <ScrollTopButton />}
        <MobileNav onMenu={() => setMobileOpen(true)} />
      </div>
    </ServerStatusProvider>
  );
}

export default DashboardLayout;
