import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, ChevronDown, Search, X } from 'lucide-react';
import NAV_SECTIONS from '../routes/navConfig.js';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../utils/permissions.js';

const OPEN_KEY = 'aurelia_sidebar_open_sections';

function isItemActive(item, pathname) {
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function loadOpenSections() {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY)) || {}; } catch { return {}; }
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [filter, setFilter] = useState('');
  const [openSections, setOpenSections] = useState(loadOpenSections);

  const sections = useMemo(() => NAV_SECTIONS
    .map((section) => ({ ...section, items: section.items.filter((item) => !user || hasPermission(user, item.module)) }))
    .filter((section) => section.items.length), [user]);

  // Always expand the section containing the current page.
  useEffect(() => {
    const active = sections.find((s) => s.label && s.items.some((item) => isItemActive(item, pathname)));
    if (active && !openSections[active.label]) setOpenSections((o) => ({ ...o, [active.label]: true }));
    onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(openSections)); } catch { /* ignore */ }
  }, [openSections]);

  const query = filter.trim().toLowerCase();
  const expanded = !collapsed || mobileOpen;

  const nav = (
    <aside
      className={clsx('relative h-screen flex flex-col transition-[width] duration-500 ease-luxe shrink-0 overflow-hidden', expanded ? 'w-64' : 'w-[76px]')}
      style={{ background: 'var(--sidebar-bg)' }}
    >
      {/* Ambient champagne glow and a hairline edge give the rail depth. */}
      <div className="pointer-events-none absolute -top-24 -left-16 w-64 h-64 rounded-full bg-gold-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 rounded-full bg-gold-500/5 blur-3xl" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      <div className="relative flex items-center justify-between gap-2.5 px-5 h-[72px] shrink-0">
        <div className="relative flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl bg-gold-gradient flex items-center justify-center font-display font-bold text-graphite-950 shrink-0 shadow-gold">
            <span className="relative z-10 text-lg">A</span>
            <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/40" />
          </div>
          {expanded && (
            <div className="leading-none">
              <div className="font-display text-lg font-semibold text-white tracking-[0.12em]">AURELIA</div>
              <div className="text-[9px] tracking-[0.32em] uppercase text-gold-400/80 mt-1">Department Store</div>
            </div>
          )}
        </div>
        {mobileOpen && (
          <button onClick={onMobileClose} className="lg:hidden p-1.5 rounded-lg text-graphite-400 hover:text-white" aria-label="Close menu">
            <X size={18} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="relative px-3 pb-3 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a page..."
              className="w-full rounded-xl bg-white/[0.04] border border-white/10 pl-8 pr-3 py-2 text-sm text-white placeholder:text-graphite-500 focus:outline-none focus:border-gold-400/70 focus:bg-white/[0.07] transition-colors"
            />
          </div>
        </div>
      )}

      <nav className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-1">
        {sections.map((section, si) => {
          const items = query ? section.items.filter((item) => item.label.toLowerCase().includes(query)) : section.items;
          if (!items.length) return null;
          const hasActive = items.some((item) => isItemActive(item, pathname));
          // Collapsed rail and search results show every item; otherwise sections are an accordion.
          const isOpen = !section.label || !expanded || !!query || openSections[section.label];
          return (
            <div key={si}>
              {section.label && expanded && (
                <button
                  onClick={() => setOpenSections((o) => ({ ...o, [section.label]: !o[section.label] }))}
                  className={clsx(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10.5px] font-bold uppercase tracking-[0.16em] transition-colors duration-300',
                    hasActive ? 'text-gold-400' : 'text-graphite-500 hover:text-graphite-200'
                  )}
                >
                  {section.label}
                  {!query && <ChevronDown size={14} className={clsx('transition-transform duration-300 ease-luxe', isOpen && 'rotate-180')} />}
                </button>
              )}
              <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className={clsx('space-y-0.5 overflow-hidden', section.label && expanded && 'mb-2')}
                >
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end
                      title={!expanded ? item.label : undefined}
                      className={({ isActive }) => clsx(
                        'group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors duration-300',
                        isActive ? 'text-gold-300' : 'text-[var(--sidebar-text)] hover:text-white'
                      )}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive ? (
                            <motion.span
                              layoutId="sidebar-active"
                              className="absolute inset-0 rounded-xl bg-gradient-to-r from-gold-500/20 via-gold-500/[0.08] to-transparent ring-1 ring-inset ring-gold-400/20"
                              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                            >
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gold-gradient shadow-[0_0_10px_rgba(210,170,108,0.8)]" />
                            </motion.span>
                          ) : (
                            <span className="absolute inset-0 rounded-xl group-hover:bg-white/[0.045] transition-colors duration-300" />
                          )}
                          <item.icon size={17} className="relative shrink-0 transition-transform duration-300 ease-luxe group-hover:scale-110" />
                          {expanded && <span className="relative truncate transition-transform duration-300 ease-luxe group-hover:translate-x-0.5">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  ))}
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          );
        })}
        {query && !sections.some((s) => s.items.some((item) => item.label.toLowerCase().includes(query))) && (
          <p className="px-3 py-4 text-xs text-graphite-500">No page matches &ldquo;{filter}&rdquo;.</p>
        )}
      </nav>

      <button
        onClick={onToggle}
        className="relative hidden lg:flex items-center gap-2 px-5 h-12 text-xs text-graphite-500 hover:text-gold-300 border-t border-white/5 shrink-0 transition-colors"
      >
        {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Collapse</>}
      </button>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block sticky top-0 h-screen shrink-0">{nav}</div>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onMobileClose} />
          <motion.div initial={{ x: -280 }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 38 }} className="relative">{nav}</motion.div>
        </div>
      )}
    </>
  );
}

export default Sidebar;
