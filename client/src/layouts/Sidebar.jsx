import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronsLeft, ChevronsRight, ChevronDown, Search, X } from 'lucide-react';
import NAV_SECTIONS from '../routes/navConfig.js';
import { useAuth } from '../context/AuthContext.jsx';
import { roleHasModule } from '../utils/permissions.js';

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
    .map((section) => ({ ...section, items: section.items.filter((item) => !user || roleHasModule(user.role, item.module)) }))
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
      className={clsx('h-screen flex flex-col transition-all duration-300 shrink-0', expanded ? 'w-64' : 'w-[76px]')}
      style={{ background: 'var(--sidebar-bg)' }}
    >
      <div className="flex items-center justify-between gap-2.5 px-5 h-16 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gold-500 flex items-center justify-center font-display font-bold text-graphite-950 shrink-0">A</div>
          {expanded && <span className="font-display text-lg font-semibold text-white tracking-wide">AURELIA</span>}
        </div>
        {mobileOpen && (
          <button onClick={onMobileClose} className="lg:hidden p-1.5 rounded-lg text-graphite-400 hover:text-white" aria-label="Close menu">
            <X size={18} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a page..."
              className="w-full rounded-lg bg-white/5 border border-white/10 pl-8 pr-3 py-2 text-sm text-white placeholder:text-graphite-500 focus:outline-none focus:border-gold-400"
            />
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
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
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors',
                    hasActive ? 'text-gold-400' : 'text-graphite-400 hover:text-white'
                  )}
                >
                  {section.label}
                  {!query && <ChevronDown size={14} className={clsx('transition-transform', isOpen && 'rotate-180')} />}
                </button>
              )}
              {isOpen && (
                <div className={clsx('space-y-0.5', section.label && expanded && 'mb-2')}>
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end
                      title={!expanded ? item.label : undefined}
                      className={({ isActive }) => clsx(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        isActive ? 'bg-gold-500/10 text-gold-400' : 'text-[var(--sidebar-text)] hover:bg-white/5 hover:text-white'
                      )}
                    >
                      <item.icon size={17} className="shrink-0" />
                      {expanded && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {query && !sections.some((s) => s.items.some((item) => item.label.toLowerCase().includes(query))) && (
          <p className="px-3 py-4 text-xs text-graphite-500">No page matches "{filter}".</p>
        )}
      </nav>

      <button
        onClick={onToggle}
        className="hidden lg:flex items-center gap-2 px-5 h-12 text-xs text-graphite-400 hover:text-white border-t border-white/5 shrink-0"
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
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <div className="relative">{nav}</div>
        </div>
      )}
    </>
  );
}

export default Sidebar;
