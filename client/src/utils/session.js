// Login session storage.
// The token lives in sessionStorage, which the browser clears when the tab or window is closed, so
// reopening the site always starts at the Login page. (A reload in the same tab keeps the session.)
// The server can also revoke a token (logout) and every API call re-checks it, so this is not the only guard.

const TOKEN_KEY = 'aurelia_token';
const USER_KEY = 'aurelia_user';

function store() {
  try { return window.sessionStorage; } catch { return null; }
}

// One-time clean-up: older builds kept the login in localStorage (it survived closing the browser).
try {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
} catch { /* storage unavailable */ }

export function getToken() {
  try { return store()?.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function setToken(token) {
  try { store()?.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
}

export function getCachedUser() {
  try {
    const raw = store()?.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user) {
  try { store()?.setItem(USER_KEY, JSON.stringify(user)); } catch { /* storage unavailable */ }
}

export function clearSession() {
  try {
    store()?.removeItem(TOKEN_KEY);
    store()?.removeItem(USER_KEY);
  } catch { /* storage unavailable */ }
}

// Leave the app for the Login page with a full page load, so no in-memory data from the old session
// survives and the Login page replaces the current history entry.
export function goToLogin() {
  if (!window.location.pathname.startsWith('/login')) window.location.replace('/login');
}
