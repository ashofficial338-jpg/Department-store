import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('aurelia_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('aurelia_token');
      localStorage.removeItem('aurelia_user');
      window.location.href = '/login';
    }
    const message = error.response?.data?.message || 'Unable to complete this request. Please try again.';
    return Promise.reject(new Error(message));
  }
);

export default api;
