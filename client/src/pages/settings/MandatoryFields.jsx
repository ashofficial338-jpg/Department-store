import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock, RotateCcw, Save } from 'lucide-react';
import { PageHeader, Button } from '../../components/ui/index.js';
import { settingsService } from '../../services/index.js';
import { setFieldRulesCache } from '../../hooks/useFieldRules.js';

// Settings > Mandatory Fields (administrators). Only what a transaction cannot work without is mandatory
// (locked); every other field is optional unless switched on here. The server enforces the same rules.
export function MandatoryFields() {
  const [data, setData] = useState(null);
  const [rules, setRules] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsService.fieldRules().then((r) => { setData(r.data); setRules(r.data.rules); }).catch((err) => toast.error(err.message));
  }, []);

  const toggle = (entity, key) => setRules((r) => ({ ...r, [entity]: { ...r[entity], [key]: !r[entity]?.[key] } }));
  const changed = data && JSON.stringify(rules) !== JSON.stringify(data.rules);
  const mandatoryCount = data ? Object.entries(data.registry).reduce((n, [e, def]) => n + def.fields.filter((f) => !f.essential && rules[e]?.[f.key]).length, 0) : 0;

  async function save(next = rules) {
    setSaving(true);
    try {
      const r = await settingsService.updateFieldRules(next);
      setData(r.data); setRules(r.data.rules); setFieldRulesCache(r.data);
      toast.success('Mandatory fields saved.');
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  function resetDefaults() {
    const next = {};
    Object.entries(data.registry).forEach(([e, def]) => { next[e] = {}; def.fields.forEach((f) => { next[e][f.key] = !!f.essential; }); });
    setRules(next);
    save(next);
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title="Mandatory Fields" crumbs={[{ label: 'Settings' }, { label: 'Mandatory Fields' }]}
        actions={data && (
          <div className="flex gap-2">
            <Button variant="outline" icon={RotateCcw} onClick={resetDefaults} disabled={saving}>Default (all optional)</Button>
            <Button icon={Save} onClick={() => save()} loading={saving} disabled={!changed}>Save</Button>
          </div>
        )} />
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        Only the fields a transaction cannot work without are mandatory (<Lock size={12} className="inline" /> locked). Everything else is optional,
        so staff can save and carry on without filling it. Switch a field on to make it mandatory everywhere it is entered - the forms mark it with *
        and the server refuses to save without it. Values that are entered are still checked for format (e.g. a mobile number must be 10 digits).
        {data && <> Currently <strong>{mandatoryCount}</strong> optional field(s) are switched to mandatory.</>}
      </p>
      {!data ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(data.registry).map(([entity, def]) => (
            <section key={entity} className="surface-card rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{def.label}</h3>
              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {def.fields.map((f) => {
                  const on = !!rules[entity]?.[f.key];
                  return (
                    <label key={f.key} className={`flex items-center justify-between gap-3 py-2 text-sm ${f.essential ? '' : 'cursor-pointer'}`}>
                      <span>
                        <span style={{ color: 'var(--text-primary)' }}>{f.label}</span>
                        {f.note && <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{f.note}</span>}
                      </span>
                      {f.essential ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}><Lock size={12} /> Always mandatory</span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-xs" style={{ color: on ? 'var(--brand)' : 'var(--text-muted)' }}>
                          {on ? 'Mandatory' : 'Optional'}
                          <input type="checkbox" role="switch" aria-label={`${def.label}: ${f.label} mandatory`} checked={on} onChange={() => toggle(entity, f.key)} className="h-4 w-4 accent-indigo-600" />
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default MandatoryFields;
