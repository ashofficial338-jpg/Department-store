import api from './api.js';
import createResourceService from './resource.js';

export const categoryService = createResourceService('/categories');
export const brandService = createResourceService('/brands');
export const storeService = createResourceService('/stores');
export const dcMasterService = createResourceService('/distribution-centers');
export const vendorService = { ...createResourceService('/vendors'), dashboard: (id) => api.get(`/vendors/${id}/dashboard`).then((r) => r.data) };
export const supplierService = createResourceService('/suppliers');
export const accountService = { ...createResourceService('/accounts'), ledger: (id, params) => api.get(`/accounts/${id}/ledger`, { params }).then((r) => r.data) };

export const authService = {
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  changePassword: (payload) => api.post('/auth/change-password', payload).then((r) => r.data),
};

export const userService = {
  list: (params) => api.get('/users', { params }).then((r) => r.data),
  create: (payload) => api.post('/users', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/users/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`).then((r) => r.data),
};

export const productService = {
  list: (params) => api.get('/products', { params }).then((r) => r.data),
  getOne: (id) => api.get(`/products/${id}`).then((r) => r.data),
  create: (payload) => api.post('/products', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/products/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/products/${id}`).then((r) => r.data),
  uploadImages: (id, formData) => api.post(`/products/${id}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  setPrimaryImage: (id, imageId) => api.put(`/products/${id}/images/${imageId}/primary`).then((r) => r.data),
  deleteImage: (id, imageId) => api.delete(`/products/${id}/images/${imageId}`).then((r) => r.data),
  extractFromImage: (formData) => api.post('/products/ai/extract-from-image', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
};

export const batchService = {
  list: (params) => api.get('/batches', { params }).then((r) => r.data),
  getOne: (id) => api.get(`/batches/${id}`).then((r) => r.data),
  create: (payload) => api.post('/batches', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/batches/${id}`, payload).then((r) => r.data),
  profitability: (id) => api.get(`/batches/${id}/profitability`).then((r) => r.data),
};

export const inventoryService = {
  overview: (params) => api.get('/inventory/overview', { params }).then((r) => r.data),
  lowStock: () => api.get('/inventory/low-stock').then((r) => r.data),
  expiry: (params) => api.get('/inventory/expiry', { params }).then((r) => r.data),
  ledger: (params) => api.get('/inventory/ledger', { params }).then((r) => r.data),
  locations: () => api.get('/inventory/locations').then((r) => r.data),
  adjust: (payload) => api.post('/inventory/adjust', payload).then((r) => r.data),
  transfers: (params) => api.get('/inventory/transfers', { params }).then((r) => r.data),
  createTransfer: (payload) => api.post('/inventory/transfers', payload).then((r) => r.data),
  completeTransfer: (id) => api.post(`/inventory/transfers/${id}/complete`).then((r) => r.data),
};

export const dcService = {
  listInward: (params) => api.get('/dc/inward', { params }).then((r) => r.data),
  getInward: (id) => api.get(`/dc/inward/${id}`).then((r) => r.data),
  createInward: (payload) => api.post('/dc/inward', payload).then((r) => r.data),
  processInward: (id, payload) => api.post(`/dc/inward/${id}/process`, payload).then((r) => r.data),
  listOutward: (params) => api.get('/dc/outward', { params }).then((r) => r.data),
  getOutward: (id) => api.get(`/dc/outward/${id}`).then((r) => r.data),
  createOutward: (payload) => api.post('/dc/outward', payload).then((r) => r.data),
  advanceOutward: (id) => api.post(`/dc/outward/${id}/advance`).then((r) => r.data),
  cancelOutward: (id) => api.post(`/dc/outward/${id}/cancel`).then((r) => r.data),
  stock: (id) => api.get(id ? `/dc/stock/${id}` : '/dc/stock').then((r) => r.data),
};

export const customerService = {
  list: (params) => api.get('/customers', { params }).then((r) => r.data),
  getOne: (id) => api.get(`/customers/${id}`).then((r) => r.data),
  create: (payload) => api.post('/customers', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/customers/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/customers/${id}`).then((r) => r.data),
  dashboard: (id) => api.get(`/customers/${id}/dashboard`).then((r) => r.data),
  history: (id, params) => api.get(`/customers/${id}/history`, { params }).then((r) => r.data),
  outstanding: () => api.get('/customers/outstanding').then((r) => r.data),
};

export const salesService = {
  preview: (payload) => api.post('/sales/preview', payload).then((r) => r.data),
  create: (payload) => api.post('/sales', payload).then((r) => r.data),
  resume: (id, payload) => api.post(`/sales/${id}/resume`, payload).then((r) => r.data),
  list: (params) => api.get('/sales', { params }).then((r) => r.data),
  getOne: (id) => api.get(`/sales/${id}`).then((r) => r.data),
  held: () => api.get('/sales/held').then((r) => r.data),
  cancel: (id) => api.post(`/sales/${id}/cancel`).then((r) => r.data),
  createReturn: (payload) => api.post('/sales/returns', payload).then((r) => r.data),
  listReturns: (params) => api.get('/sales/returns', { params }).then((r) => r.data),
};

export const purchaseService = {
  list: (params) => api.get('/purchases', { params }).then((r) => r.data),
  getOne: (id) => api.get(`/purchases/${id}`).then((r) => r.data),
  create: (payload) => api.post('/purchases', payload).then((r) => r.data),
  receive: (id, payload) => api.post(`/purchases/${id}/receive`, payload).then((r) => r.data),
  pay: (id, payload) => api.post(`/purchases/${id}/pay`, payload).then((r) => r.data),
  createReturn: (payload) => api.post('/purchases/returns', payload).then((r) => r.data),
  listReturns: (params) => api.get('/purchases/returns', { params }).then((r) => r.data),
};

export const paymentService = {
  list: (params) => api.get('/payments', { params }).then((r) => r.data),
  create: (payload) => api.post('/payments', payload).then((r) => r.data),
};

export const expenseService = {
  list: (params) => api.get('/expenses', { params }).then((r) => r.data),
  create: (payload) => api.post('/expenses', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/expenses/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/expenses/${id}`).then((r) => r.data),
};

export const gstService = {
  rates: () => api.get('/gst/rates').then((r) => r.data),
  createRate: (payload) => api.post('/gst/rates', payload).then((r) => r.data),
  updateRate: (id, payload) => api.put(`/gst/rates/${id}`, payload).then((r) => r.data),
  removeRate: (id) => api.delete(`/gst/rates/${id}`).then((r) => r.data),
  summary: (params) => api.get('/gst/summary', { params }).then((r) => r.data),
  salesReport: (params) => api.get('/gst/sales-report', { params }).then((r) => r.data),
  purchaseReport: (params) => api.get('/gst/purchase-report', { params }).then((r) => r.data),
};

export const reportService = {
  sales: (params) => api.get('/reports/sales', { params }).then((r) => r.data),
  purchases: (params) => api.get('/reports/purchases', { params }).then((r) => r.data),
  stock: (params) => api.get('/reports/stock', { params }).then((r) => r.data),
  batches: (params) => api.get('/reports/batches', { params }).then((r) => r.data),
  vendors: (params) => api.get('/reports/vendors', { params }).then((r) => r.data),
  customers: (params) => api.get('/reports/customers', { params }).then((r) => r.data),
  products: (params) => api.get('/reports/products', { params }).then((r) => r.data),
  dc: (params) => api.get('/reports/dc', { params }).then((r) => r.data),
  expenses: (params) => api.get('/reports/expenses', { params }).then((r) => r.data),
  payments: (params) => api.get('/reports/payments', { params }).then((r) => r.data),
  outstanding: (params) => api.get('/reports/outstanding', { params }).then((r) => r.data),
  cashBank: (params) => api.get('/reports/cash-bank', { params }).then((r) => r.data),
  profitLoss: (params) => api.get('/reports/profit-loss', { params }).then((r) => r.data),
  downloadCsvUrl: (endpoint, params) => `/api${endpoint}?${new URLSearchParams({ ...params, format: 'csv' }).toString()}`,
};

export const dashboardService = {
  kpis: () => api.get('/dashboard/kpis').then((r) => r.data),
  topProducts: (params) => api.get('/dashboard/top-products', { params }).then((r) => r.data),
  salesTrend: (params) => api.get('/dashboard/sales-trend', { params }).then((r) => r.data),
  categoryBrandSales: (params) => api.get('/dashboard/category-brand-sales', { params }).then((r) => r.data),
};

export const auditLogService = {
  list: (params) => api.get('/audit-logs', { params }).then((r) => r.data),
};

export const settingsService = {
  get: () => api.get('/settings').then((r) => r.data),
  update: (payload) => api.put('/settings', payload).then((r) => r.data),
  roles: () => api.get('/settings/roles').then((r) => r.data),
  updateRole: (role, payload) => api.put(`/settings/roles/${role}`, payload).then((r) => r.data),
};

export const notificationService = {
  list: () => api.get('/notifications').then((r) => r.data),
};

export const searchService = {
  global: (q) => api.get('/search', { params: { q } }).then((r) => r.data),
};

export default api;
