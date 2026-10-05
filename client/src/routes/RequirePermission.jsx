import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { hasAnyPermission, isAdmin } from '../utils/permissions.js';

// Route-level guard. The API enforces the same permissions; this just avoids rendering pages
// whose data the user cannot load when they open a URL directly.
export function RequirePermission({ any = [], admin = false, children }) {
  const { user } = useAuth();
  const allowed = admin ? isAdmin(user) : (!any.length || hasAnyPermission(user, any));
  if (allowed) return children;
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-3">
      <span className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center"><ShieldAlert size={22} /></span>
      <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>You don&apos;t have access to this page</h1>
      <p className="text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>
        Ask an administrator to grant the required permission in Settings &rsaquo; Roles &amp; Permissions.
      </p>
      <Link to="/dashboard" className="text-sm font-medium text-gold-600 hover:text-gold-500">Back to dashboard</Link>
    </div>
  );
}

export default RequirePermission;
