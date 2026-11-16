import { lazy } from 'react';

const RELOAD_KEY = 'aurelia_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 30000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A page's code can fail to download when the site was redeployed while this tab stayed open (the old
// file names no longer exist) or when the connection drops for a moment. Without handling, the click
// appears to do nothing until the browser is refreshed. So: retry once, then refresh the tab ourselves
// - at most once per cooldown, so a genuinely broken page cannot cause a reload loop.
export function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      return await importer();
    } catch {
      await wait(400);
      try {
        return await importer();
      } catch (error) {
        let last = 0;
        try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { /* storage unavailable */ }
        if (Date.now() - last > RELOAD_COOLDOWN_MS) {
          try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* storage unavailable */ }
          window.location.reload();
          return new Promise(() => {}); // keep the loader up while the tab reloads
        }
        throw error;
      }
    }
  });
}

export default lazyWithRetry;
