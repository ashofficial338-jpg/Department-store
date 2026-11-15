import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { LayoutDashboard, Menu, Package, Search, ShoppingCart } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../utils/permissions.js';

export const OPEN_SEARCH_EVENT = 'aurelia:open-search';

// Thumb-reachable tab bar for phones and tablets (hidden on desktop, where the sidebar is visible).
export function MobileNav({ onMenu }) {
  const { user } = useAuth();
  const can = (m) => !!user && hasPermission(user, m);

  const tab = 'relative flex-1 flex flex-col items-center justify-center gap-1 h-full text-[10.5px] font-semibold transition-colors';
  const link = ({ isActive }) => clsx(tab, isActive ? 'text-gold-600 dark:text-gold-300' : 'text-[var(--text-muted)]');
  const indicator = (isActive) => isActive && (
    <motion.span layoutId="mobile-nav-active" className="absolute top-0 h-[3px] w-8 rounded-b-full bg-gold-gradient" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
  );

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden no-print fixed inset-x-0 bottom-0 z-40 glass border-t pb-safe"
      style={{ borderColor: 'var(--border-subtle)', boxShadow: '0 -10px 30px -18px rgba(17,18,24,0.35)' }}
    >
      <div className="flex items-stretch h-16 max-w-xl mx-auto px-2">
        {can('dashboard') && (
          <NavLink to="/dashboard" end className={link}>
            {({ isActive }) => (<>{indicator(isActive)}<LayoutDashboard size={20} />Home</>)}
          </NavLink>
        )}
        {can('products') && (
          <NavLink to="/products" end className={link}>
            {({ isActive }) => (<>{indicator(isActive)}<Package size={20} />Products</>)}
          </NavLink>
        )}
        {can('pos') && (
          <NavLink to="/pos" className={clsx(tab, 'text-graphite-950')} aria-label="New bill">
            {({ isActive }) => (
              <span className={clsx('-mt-7 w-14 h-14 rounded-2xl bg-gold-gradient shadow-gold flex items-center justify-center ring-4 ring-[var(--bg-app)] transition-transform', isActive && 'scale-105')}>
                <ShoppingCart size={22} />
              </span>
            )}
          </NavLink>
        )}
        <button type="button" className={clsx(tab, 'text-[var(--text-muted)]')} onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}>
          <Search size={20} />Search
        </button>
        <button type="button" className={clsx(tab, 'text-[var(--text-muted)]')} onClick={onMenu} aria-label="Open menu">
          <Menu size={20} />Menu
        </button>
      </div>
    </nav>
  );
}

export default MobileNav;
