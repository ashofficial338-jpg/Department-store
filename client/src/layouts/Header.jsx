import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Moon, Sun, LogOut, ChevronDown, Menu, ShoppingCart, ShieldCheck, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import GlobalSearch from '../components/GlobalSearch.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { hasPermission, isAdmin } from '../utils/permissions.js';

function roleLabel(role) {
  return (role || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const canBill = user && hasPermission(user, 'pos');
  const { theme, toggleTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'F2' && canBill) {
        e.preventDefault();
        navigate('/pos');
      } else if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canBill, navigate]);

  // The bar gains depth once content scrolls beneath it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    function onDoc(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const iconBtn = 'relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ease-luxe hover:bg-[var(--hover-tint)] active:scale-95';

  return (
    <>
      <header
        className="glass h-16 sticky top-0 z-30 flex items-center justify-between gap-3 px-4 md:px-8 border-b transition-shadow duration-500"
        style={{
          borderColor: scrolled ? 'var(--border-subtle)' : 'transparent',
          boxShadow: scrolled ? '0 10px 30px -18px rgba(17,18,24,0.35)' : 'none',
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button onClick={onMenuClick} className={`lg:hidden ${iconBtn}`} aria-label="Open menu">
            <Menu size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search" className="group flex items-center gap-2.5 px-3 sm:px-3.5 py-2 rounded-xl border text-sm min-w-0 sm:w-full sm:max-w-[22rem] transition-all duration-300 ease-luxe hover:border-gold-400/70 hover:shadow-[0_0_0_4px_rgba(194,154,86,0.10)]"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)', background: 'var(--bg-surface)' }}
          >
            <Search size={15} className="shrink-0 transition-colors group-hover:text-gold-600" />
            <span className="hidden sm:block flex-1 text-left truncate">Search pages, products, customers…</span>
            <kbd className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded-md border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-muted)' }}>Ctrl K</kbd>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canBill && (
            <button
              onClick={() => navigate('/pos')}
              title="New Bill (F2)"
              className="sheen flex items-center gap-1.5 bg-gold-gradient text-graphite-950 rounded-xl px-3.5 py-2 text-sm font-semibold mr-1 shadow-gold transition-transform duration-300 ease-luxe hover:-translate-y-0.5 active:translate-y-0"
            >
              <ShoppingCart size={15} />
              <span className="hidden sm:inline">New Bill</span>
              <kbd className="hidden md:inline text-[10px] px-1 rounded bg-black/10">F2</kbd>
            </button>
          )}
          <button onClick={toggleTheme} className={iconBtn} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} title="Toggle theme">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="flex"
              >
                {theme === 'light' ? <Moon size={17} style={{ color: 'var(--text-secondary)' }} /> : <Sun size={17} className="text-gold-400" />}
              </motion.span>
            </AnimatePresence>
          </button>
          <NotificationBell />

          <div className="relative ml-1.5" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-xl transition-colors duration-300 hover:bg-[var(--hover-tint)]"
            >
              <span className="relative p-[2px] rounded-full bg-gold-gradient">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold tracking-wide" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                  {initials(user?.name)}
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2" style={{ '--tw-ring-color': 'var(--bg-surface)' }} />
              </span>
              <div className="text-left hidden md:block">
                <div className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{user?.name}</div>
                <div className="text-[10px] leading-tight mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  {isAdmin(user) && <ShieldCheck size={10} className="text-gold-600" />}
                  {roleLabel(user?.role)}
                </div>
              </div>
              <ChevronDown size={14} className={`transition-transform duration-300 ${menuOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 mt-2 w-64 surface-card shadow-premium-lg rounded-2xl overflow-hidden origin-top-right"
                >
                  <div className="px-4 py-4 border-b relative overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gold-500/10 blur-2xl" />
                    <div className="relative text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{user?.name}</div>
                    <div className="relative text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</div>
                    <span className="relative inline-flex items-center gap-1 mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-gold-100 text-gold-800">
                      {isAdmin(user) && <ShieldCheck size={10} />} {roleLabel(user?.role)}
                    </span>
                  </div>
                  <div className="p-1.5">
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); navigate('/dashboard'); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors hover:bg-[var(--hover-tint)]"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <LayoutDashboard size={15} className="text-gold-600" /> Dashboard
                    </button>
                    <button
                      role="menuitem"
                      onClick={logout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

export default Header;
