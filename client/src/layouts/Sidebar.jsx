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

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function roleLabel(role) {
  return (role || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
      className={clsx(
        'relative h-screen flex flex-col transition-[width] duration-500 ease-luxe shrink-0 overflow-hidden border-r backdrop-blur-xl',
        expanded ? 'w-[17rem]' : 'w-[76px]'
      )}
      style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border-subtle)' }}
    >
      {/* Soft brand glow behind the logo gives the rail depth. */}
      <div className="pointer-events-none absolute -top-24 -left-20 w-64 h-64 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-16 w-52 h-52 rounded-full bg-accent-400/10 blur-3xl" />

      <div className={clsx('relative flex items-center gap-2.5 h-16 shrink-0', expanded ? 'justify-between px-5' : 'justify-center')}>
        <div className="relative flex items-center gap-3 min-w-0">
          <div className="relative w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center font-display font-extrabold text-white shrink-0 shadow-brand">
            <span className="relative z-10 text-lg">A</span>
            <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/30" />
          </div>
          {expanded && (
            <div className="leading-none min-w-0">
              <div className="font-display text-[17px] font-extrabold tracking-[0.04em]" style={{ color: 'var(--sidebar-text-strong)' }}>AURELIA</div>
              <div className="text-[10px] font-medium mt-1 truncate" style={{ color: 'var(--sidebar-muted)' }}>Department Store</div>
            </div>
          )}
        </div>
        {mobileOpen && (
          <button onClick={onMobileClose} className="lg:hidden p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)]" style={{ color: 'var(--sidebar-muted)' }} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="relative px-3 pb-3 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--sidebar-muted)' }} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a page..."
              aria-label="Find a page"
              className="w-full rounded-xl border pl-8 pr-3 py-2 text-sm focus:outline-none focus:!border-brand-400 transition-colors placeholder:text-[var(--sidebar-muted)]"
              style={{ background: 'var(--sidebar-hover)', borderColor: 'transparent', color: 'var(--sidebar-text-strong)' }}
            />
          </div>
        </div>
      )}

      <nav className="thin-scroll relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-1 space-y-1">
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
                  aria-expanded={!!isOpen}
                  className="w-full flex items-center justify-between px-3 py-2 mt-1 rounded-lg text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-300 hover:bg-[var(--sidebar-hover)]"
                  style={{ color: hasActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-muted)' }}
                >
                  {section.label}
                  {!query && <ChevronDown size={14} className={clsx('transition-transform duration-300 ease-luxe', isOpen && 'rotate-180')} />}
                </button>
              )}
              {section.label && !expanded && si > 0 && <div className="mx-3 my-2 h-px" style={{ background: 'var(--border-subtle)' }} />}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className={clsx('space-y-0.5 overflow-hidden', section.label && expanded && 'mb-1')}
                  >
                    {items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end
                        title={!expanded ? item.label : undefined}
                        className={clsx(
                          'group relative flex items-center gap-3 py-2 rounded-xl text-sm font-medium transition-colors duration-300',
                          expanded ? 'px-3' : 'justify-center px-0'
                        )}
                        style={({ isActive }) => ({ color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)' })}
                      >
                        {({ isActive }) => (
                          <>
                            {isActive ? (
                              <motion.span
                                layoutId="sidebar-active"
                                className="absolute inset-0 rounded-xl ring-1 ring-inset ring-brand-500/20"
                                style={{ background: 'var(--brand-tint)' }}
                                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                              >
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-brand-gradient shadow-[0_0_10px_rgba(101,88,245,0.7)]" />
                              </motion.span>
                            ) : (
                              <span className="absolute inset-0 rounded-xl transition-colors duration-300 group-hover:bg-[var(--sidebar-hover)]" />
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
          <p className="px-3 py-4 text-xs" style={{ color: 'var(--sidebar-muted)' }}>No page matches &ldquo;{filter}&rdquo;.</p>
        )}
      </nav>

      <div className="relative shrink-0 border-t p-3 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
        {user && (
          <div className={clsx('flex items-center gap-2.5 rounded-xl', expanded ? 'p-2' : 'justify-center py-1')} style={expanded ? { background: 'var(--sidebar-hover)' } : undefined} title={!expanded ? user.name : undefined}>
            <span className="w-8 h-8 rounded-full bg-brand-gradient text-white text-[11px] font-bold flex items-center justify-center shrink-0">{initials(user.name)}</span>
            {expanded && (
              <div className="min-w-0 leading-tight">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--sidebar-text-strong)' }}>{user.name}</div>
                <div className="text-[11px] truncate" style={{ color: 'var(--sidebar-muted)' }}>{roleLabel(user.role)}</div>
              </div>
            )}
          </div>
        )}
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx('hidden lg:flex w-full items-center gap-2 h-9 rounded-xl text-xs font-medium transition-colors hover:bg-[var(--sidebar-hover)]', expanded ? 'px-3' : 'justify-center')}
          style={{ color: 'var(--sidebar-muted)' }}
        >
          {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Collapse</>}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block sticky top-0 h-screen shrink-0">{nav}</div>
      <AnimatePresence>
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-graphite-950/50 backdrop-blur-sm" onClick={onMobileClose} />
            <motion.div initial={{ x: -290 }} animate={{ x: 0 }} exit={{ x: -290 }} transition={{ type: 'spring', stiffness: 380, damping: 38 }} className="relative">{nav}</motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default Sidebar;
