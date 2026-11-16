import { useEffect, useSyncExternalStore } from 'react';
import { settingsService } from '../services/index.js';

export const DEFAULT_COMPANY_NAME = 'AURELIA Department Store';
const CACHE_KEY = 'aurelia_company_name';

// One shared value for the whole app: painted from the last known name, then refreshed from
// System Settings once per page load. Saving System Settings pushes the new name here directly.
let current = DEFAULT_COMPANY_NAME;
try { current = localStorage.getItem(CACHE_KEY) || DEFAULT_COMPANY_NAME; } catch { /* storage unavailable */ }
let requested = false;
const listeners = new Set();

export function setCompanyName(name) {
  const next = String(name || '').trim() || DEFAULT_COMPANY_NAME;
  if (next === current) return;
  current = next;
  try { localStorage.setItem(CACHE_KEY, next); } catch { /* storage unavailable */ }
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useCompanyName() {
  const name = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    if (requested) return;
    requested = true;
    settingsService.get()
      .then((r) => setCompanyName(r.data?.companyName))
      .catch(() => { requested = false; }); // keep the cached name; retry on the next mount
  }, []);
  return name;
}

export default useCompanyName;
