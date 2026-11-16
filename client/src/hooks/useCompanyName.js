import { useEffect, useSyncExternalStore } from 'react';
import { settingsService } from '../services/index.js';

export const DEFAULT_COMPANY_NAME = 'AURELIA Department Store';
const CACHE_KEY = 'aurelia_company_name';

// One shared value for the whole app: painted from the last known name, then refreshed from
// System Settings (the existing signed-in /settings endpoint) once per page load. Saving System
// Settings pushes the new name here directly. Before sign-in there is no token, so the login
// page shows the name remembered from the last session on this browser, or the default.
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

function hasToken() {
  try { return !!localStorage.getItem('aurelia_token'); } catch { return false; }
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// "AURELIA Department Store" reads best as a wordmark over a small descriptor; any other
// company name is shown whole on one line.
export function splitCompanyName(name) {
  const m = /^(.+?)\s+(department\s+store)$/i.exec(name);
  return m ? { title: m[1], tagline: m[2] } : { title: name, tagline: '' };
}

export function useCompanyName() {
  const name = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    if (requested || !hasToken()) return;
    requested = true;
    settingsService.get()
      .then((r) => setCompanyName(r.data?.companyName))
      .catch(() => { requested = false; }); // keep the cached name; retry on the next mount
  }, []);
  return name;
}

export default useCompanyName;
