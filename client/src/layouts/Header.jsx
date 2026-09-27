import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Moon, Sun, LogOut, ChevronDown, Menu, ShoppingCart } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import GlobalSearch from '../components/GlobalSearch.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { roleHasModule } from '../utils/permissions.js';

function roleLabel(role) {
  return (role || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const canBill = user && roleHasModule(user.role, 'pos');
  const { theme, toggleTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'F2' && canBill) {
        e.preventDefault();
        navigate('/pos');
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canBill, navigate]);

  return (
    <>
      <header
        className="h-16 sticky top-0 z-30 flex items-center justify-between gap-3 px-4 md:px-6 border-b backdrop-blur-sm"
        style={{ background: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-graphite-100" aria-label="Open menu">
            <Menu size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm w-full max-w-80 hover:border-gold-400 transition-colors"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
          >
            <Search size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Search pages, products, customers...</span>
            <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border-subtle)' }}>Ctrl K</kbd>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canBill && (
            <button
              onClick={() => navigate('/pos')}
              title="New Bill (F2)"
              className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-400 text-graphite-950 rounded-lg px-3 py-2 text-sm font-medium mr-1"
            >
              <ShoppingCart size={15} />
              <span className="hidden sm:inline">New Bill</span>
              <kbd className="hidden md:inline text-[10px] px-1 rounded bg-black/10">F2</kbd>
            </button>
          )}
          <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-graphite-100">
            {theme === 'light' ? <Moon size={17} style={{ color: 'var(--text-secondary)' }} /> : <Sun size={17} style={{ color: 'var(--text-secondary)' }} />}
          </button>
          <NotificationBell />

          <div className="relative ml-2">
            <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-graphite-100">
              <div className="w-8 h-8 rounded-full bg-gold-500 text-graphite-950 flex items-center justify-center text-xs font-semibold font-display">
                {user?.name?.charAt(0) || '?'}
              </div>
              <div className="text-left hidden md:block">
                <div className="text-xs font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>{user?.name}</div>
                <div className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>{roleLabel(user?.role)}</div>
              </div>
              <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 surface-card rounded-xl shadow-premium-lg overflow-hidden">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

export default Header;
