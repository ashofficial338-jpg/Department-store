import { useCallback, useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Polls the API health endpoint so the UI can show whether the server is reachable.
// status: 'checking' | 'online' | 'offline'
export function useServerStatus(intervalMs = 15000) {
  const [status, setStatus] = useState('checking');

  const check = useCallback(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal, cache: 'no-store' });
      setStatus(res.ok ? 'online' : 'offline');
    } catch {
      setStatus('offline');
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, intervalMs);
    const onWake = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', onWake);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [check, intervalMs]);

  return { status, recheck: check };
}

export default useServerStatus;
