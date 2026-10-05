import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';

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

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('aurelia_sidebar_collapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem('aurelia_sidebar_collapsed', String(collapsed));
  }, [collapsed]);

  // New page starts at the top.
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);

  return (
    <div className="flex min-h-screen">
      <RouteProgress routeKey={location.pathname} />
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8 max-w-[1600px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
              // Clear the filter afterwards: a lingering filter would trap position:fixed children (POS bars, popovers).
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="px-4 md:px-8 pb-6 max-w-[1600px] w-full mx-auto text-[11px] flex items-center justify-between no-print" style={{ color: 'var(--text-muted)' }}>
          <span>© {new Date().getFullYear()} AURELIA Department Store</span>
          <span className="hidden sm:inline tracking-[0.2em] uppercase">Crafted for retail excellence</span>
        </footer>
      </div>
    </div>
  );
}

export default DashboardLayout;
