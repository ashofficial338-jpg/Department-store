import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { PageHeader, Button } from '../../components/ui/index.js';
import { settingsService } from '../../services/index.js';

const MODULES = ['dashboard', 'pos', 'sales', 'products', 'inventory', 'dc', 'purchasing', 'vendors', 'customers', 'finance', 'reports', 'users', 'settings', 'audit'];

export function RolesSettings() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState(null);

  useEffect(() => { settingsService.roles().then((r) => setRoles(r.data)).finally(() => setLoading(false)); }, []);

  function toggle(role, moduleKey) {
    setRoles((prev) => prev.map((r) => {
      if (r.role !== role) return r;
      const has = r.permissions.includes(moduleKey);
      return { ...r, permissions: has ? r.permissions.filter((m) => m !== moduleKey) : [...r.permissions, moduleKey] };
    }));
  }

  async function save(role) {
    setSavingRole(role.role);
    try {
      await settingsService.updateRole(role.role, { permissions: role.permissions });
      toast.success(`Permissions updated for ${role.label}.`);
    } catch (err) { toast.error(err.message); } finally { setSavingRole(null); }
  }

  if (loading) return null;

  return (
    <div>
      <PageHeader title="Roles & Permissions" crumbs={[{ label: 'Settings', to: '/settings/system' }, { label: 'Roles & Permissions' }]} />
      <div className="surface-card rounded-xl2 shadow-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase sticky left-0 bg-inherit" style={{ color: 'var(--text-muted)' }}>Role</th>
              {MODULES.map((m) => (
                <th key={m} className="px-3 py-3 text-xs font-semibold uppercase capitalize" style={{ color: 'var(--text-muted)' }}>{m}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const isAll = role.permissions.includes('*');
              return (
                <tr key={role.role} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{role.label}</td>
                  {MODULES.map((m) => (
                    <td key={m} className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        disabled={isAll}
                        checked={isAll || role.permissions.includes(m)}
                        onChange={() => toggle(role.role, m)}
                        className="w-4 h-4 accent-gold-500 cursor-pointer disabled:opacity-50"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    {!isAll && (
                      <Button size="sm" variant="outline" icon={Save} loading={savingRole === role.role} onClick={() => save(role)}>Save</Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RolesSettings;
