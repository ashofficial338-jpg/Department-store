import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/index.js';
import { getToken, setToken, getCachedUser, setCachedUser, clearSession, goToLogin } from '../utils/session.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Only trust a cached profile when this tab still holds a token (see utils/session.js).
  const [user, setUser] = useState(() => (getToken() ? getCachedUser() : null));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    authService.me()
      .then((res) => { setUser(res.user); setCachedUser(res.user); })
      // An expired/revoked session (401) is cleared by the API interceptor. Any other failure - the API
      // restarting, a dropped connection - must not sign the user out: keep the cached profile.
      .catch(() => { if (!getToken()) setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  // Re-read the profile (incl. effective permissions) when the tab regains focus, so changes made in
  // Roles & Permissions reach signed-in users without a fresh login. A revoked session gets a 401 here.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible' || !getToken()) return;
      authService.me()
        .then((res) => { setUser(res.user); setCachedUser(res.user); })
        .catch(() => { /* 401s are handled by the API interceptor */ });
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Back button after logout: the browser may restore an old page from its memory cache (bfcache)
  // without running any code. When that happens and this tab has no session, go to the Login page.
  useEffect(() => {
    function onPageShow(e) {
      if (e.persisted && !getToken()) goToLogin();
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authService.login({ email, password });
    setToken(res.token);
    setCachedUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  // Revoke the session on the server, forget it in this tab, then reload onto the Login page so no
  // internal page or data stays in memory (and Back cannot bring one back).
  const logout = useCallback(async () => {
    try {
      if (getToken()) await authService.logout();
    } catch { /* already expired or offline - the local session is cleared anyway */ }
    clearSession();
    setUser(null);
    goToLogin();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
