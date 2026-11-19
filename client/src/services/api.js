import axios from 'axios';
import { getToken, clearSession, goToLogin } from '../utils/session.js';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    // Blob downloads (exports) receive error bodies as Blobs; read them so the server's message is shown.
    if (error.response?.data instanceof Blob && error.response.data.type.includes('json')) {
      try { error.response.data = JSON.parse(await error.response.data.text()); } catch { /* keep generic message */ }
    }
    // Expired, revoked (logged out elsewhere) or missing session: drop it and go to the Login page.
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      clearSession();
      goToLogin();
    }
    const message = error.response?.data?.message || 'Unable to complete this request. Please try again.';
    const err = new Error(message);
    err.status = error.response?.status;
    err.details = error.response?.data?.details;
    return Promise.reject(err);
  }
);

export default api;
