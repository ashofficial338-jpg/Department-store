import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('aurelia_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('aurelia_token');
    if (!token) { setLoading(false); return; }
    authService.me()
      .then((res) => { setUser(res.user); localStorage.setItem('aurelia_user', JSON.stringify(res.user)); })
      .catch(() => { localStorage.removeItem('aurelia_token'); localStorage.removeItem('aurelia_user'); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authService.login({ email, password });
    localStorage.setItem('aurelia_token', res.token);
    localStorage.setItem('aurelia_user', JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('aurelia_token');
    localStorage.removeItem('aurelia_user');
    setUser(null);
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
