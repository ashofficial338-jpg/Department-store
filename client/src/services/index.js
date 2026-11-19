import api from './api.js';
import createResourceService from './resource.js';
import { setToken } from '../utils/session.js';

export const categoryService = createResourceService('/categories');
export const brandService = createResourceService('/brands');
export const storeService = createResourceService('/stores');
export const dcMasterService = createResourceService('/distribution-centers');
export const vendorService = {
  ...createResourceService('/vendors'),
  dashboard: (id) => api.get(`/vendors/${id}/dashboard`).then((r) => r.data),
  verified: () => api.get('/vendors/all', { params: { verified: true } }).then((r) => r.data),
  checklist: (id) => api.get(`/vendors/${id}/checklist`).then((r) => r.data),
  verify: (id, payload) => api.post(`/vendors/${id}/verify`, payload).then((r) => r.data),
  uploadDocument: (id, docType, file) => {
    const form = new FormData();
    form.append('docType', docType);
    form.append('file', file);
    return api.post(`/vendors/${id}/documents`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }).then((r) => r.data);
  },
  // Documents are private: fetched with the login token, then opened from a temporary blob URL.
  documentBlob: (id, docId) => api.get(`/vendors/${id}/documents/${docId}`, { responseType: 'blob' }).then((r) => r.data),
  removeDocument: (id, docId) => api.delete(`/vendors/${id}/documents/${docId}`).then((r) => r.data),
};
export const supplierService = createResourceService('/suppliers');
export const accountService = { ...createResourceService('/accounts'), ledger: (id, params) => api.get(`/accounts/${id}/ledger`, { params }).then((r) => r.data) };
export const rackItemService = createResourceService('/rack-items');

export const authService = {
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  // Ends this session on the server (the token is revoked even if someone copied it).
  logout: () => api.post('/auth/logout').then((r) => r.data),
  // The server signs out other sessions on a password change and returns a fresh token for this one.
  changePassword: (payload) => api.post('/auth/change-password', payload).then((r) => {
    if (r.data?.token) setToken(r.data.token);
    return r.data;
  }),
};

export const userService = {
  list: (params) => api.get('/users', { params }).then((r) => r.data),
  create: (payload) => api.post('/users', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/users/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`).then((r) => r.data),
};

export const productService = {
  list: (params) => api.get('/products', { params }).then((r) => r.data),
  names: () => api.get('/products/names').then((r) => r.data),
  getOne: (id) => api.get(`/products/${id}`).then((r) => r.data),
  create: (payload) => api.post('/products', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/products/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/products/${id}`).then((r) => r.data),
  uploadImages: (id, formData) => api.post(`/products/${id}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  setPrimaryImage: (id, imageId) => api.put(`/products/${id}/images/${imageId}/primary`).then((r) => r.data),
  deleteImage: (id, imageId) => api.delete(`/products/${id}/images/${imageId}`).then((r) => r.data),
  exportFile: (format = 'xlsx') => downloadFile('/products/export', { format }, `products.${format}`),
  importTemplate: () => downloadFile('/products/import/template', {}, 'product-import-template.xlsx'),
  importFile: (file, { dryRun = false, onProgress } = {}) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/products/import', form, { params: { dryRun }, timeout: 300000, onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : 0) }).then((r) => r.data);
  },
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
  stockReportOptions: () => api.get('/inventory/report/options').then((r) => r.data),
  stockReport: (params) => api.get('/inventory/report', { params }).then((r) => r.data),
  exportStockReport: (params, format) => downloadFile('/inventory/report/export', { ...params, format }, `stock-report.${format}`),
};

export const dcService = {
  listInward: (params) => api.get('/dc/inward', { params }).then((r) => r.data),
  getInward: (id) => api.get(`/dc/inward/${id}`).then((r) => r.data),
  createInward: (payload) => api.post('/dc/inward', payload).then((r) => r.data),
  processInward: (id, payload) => api.post(`/dc/inward/${id}/process`, payload).then((r) => r.data),
  listOutward: (params) => api.get('/dc/outward', { params }).then((r) => r.data),
  getOutward: (id) => api.get(`/dc/outward/${id}`).then((r) => r.data),
  createOutward: (payload) => api.post('/dc/outward', payload).then((r) => r.data),
  submitOutward: (id, payload) => api.post(`/dc/outward/${id}/submit`, payload).then((r) => r.data),
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
  createSimple: (payload) => api.post('/sales/simple', payload).then((r) => r.data),
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
  approve: (id) => api.post(`/purchases/${id}/approve`).then((r) => r.data),
  pay: (id, payload) => api.post(`/purchases/${id}/pay`, payload).then((r) => r.data),
  createReturn: (payload) => api.post('/purchases/returns', payload).then((r) => r.data),
  listReturns: (params) => api.get('/purchases/returns', { params }).then((r) => r.data),
  getReturn: (id) => api.get(`/purchases/returns/${id}`).then((r) => r.data),
  listInvoices: (params) => api.get('/purchases/invoices', { params }).then((r) => r.data),
  getInvoice: (id) => api.get(`/purchases/invoices/${id}`).then((r) => r.data),
  createInvoice: (payload) => api.post('/purchases/invoices', payload).then((r) => r.data),
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
  // CSV export through the authenticated API (a plain link would carry no login and get a 401).
  downloadCsv: (endpoint, params) => downloadFile(endpoint, { ...params, format: 'csv' }, `${endpoint.split('/').pop() || 'report'}.csv`),
};

// Downloads a file from an authenticated endpoint (a plain link would not carry the bearer token).
async function downloadFile(url, params, fallbackName) {
  const res = await api.get(url, { params, responseType: 'blob', timeout: 120000 });
  const disposition = res.headers['content-disposition'] || '';
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] || fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

// Advanced reporting module (Reports > Analytics & Exports).
export const advancedReportService = {
  meta: () => api.get('/reports/advanced/meta').then((r) => r.data),
  overview: (params) => api.get('/reports/advanced/overview', { params, timeout: 60000 }).then((r) => r.data),
  section: (key, params) => api.get(`/reports/advanced/section/${key}`, { params, timeout: 60000 }).then((r) => r.data),
  // Returns { blob, name } so the caller can preview or save it; onProgress gets 0..1 while downloading.
  exportFile: async (body, { onProgress } = {}) => {
    const res = await api.post('/reports/advanced/export', body, {
      responseType: 'blob', timeout: 300000,
      onDownloadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : null),
    });
    const disposition = res.headers['content-disposition'] || '';
    return { blob: res.data, name: /filename="?([^";]+)"?/.exec(disposition)?.[1] || `report.${body.format}` };
  },
  createTemplate: (payload) => api.post('/reports/advanced/templates', payload).then((r) => r.data),
  updateTemplate: (id, payload) => api.put(`/reports/advanced/templates/${id}`, payload).then((r) => r.data),
  deleteTemplate: (id) => api.delete(`/reports/advanced/templates/${id}`).then((r) => r.data),
};

export function saveBlob(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const dashboardService = {
  kpis: (params) => api.get('/dashboard/kpis', { params }).then((r) => r.data),
  productRoi: (params) => api.get('/dashboard/product-roi', { params }).then((r) => r.data),
  filterOptions: () => api.get('/dashboard/filter-options').then((r) => r.data),
  itrAnalysis: (params) => api.get('/dashboard/itr-analysis', { params, timeout: 60000 }).then((r) => r.data),
  details: (metric, params) => api.get(`/dashboard/details/${metric}`, { params, timeout: 60000 }).then((r) => r.data),
  exportFile: (metric, params, format) => downloadFile(`/dashboard/export/${metric}`, { ...params, format }, `${metric}.${format}`),
  topProducts: (params) => api.get('/dashboard/top-products', { params }).then((r) => r.data),
  productCatalog: (params) => api.get('/dashboard/product-catalog', { params }).then((r) => r.data),
  salesTrend: (params) => api.get('/dashboard/sales-trend', { params }).then((r) => r.data),
  categoryBrandSales: (params) => api.get('/dashboard/category-brand-sales', { params }).then((r) => r.data),
};

export const auditLogService = {
  list: (params) => api.get('/audit-logs', { params }).then((r) => r.data),
};

export const settingsService = {
  get: () => api.get('/settings').then((r) => r.data),
  update: (payload) => api.put('/settings', payload).then((r) => r.data),
  permissions: () => api.get('/settings/permissions').then((r) => r.data),
  roles: () => api.get('/settings/roles').then((r) => r.data),
  createRole: (payload) => api.post('/settings/roles', payload).then((r) => r.data),
  updateRole: (role, payload) => api.put(`/settings/roles/${role}`, payload).then((r) => r.data),
  deleteRole: (role) => api.delete(`/settings/roles/${role}`).then((r) => r.data),
};

export const notificationService = {
  list: () => api.get('/notifications').then((r) => r.data),
};

export const searchService = {
  global: (q) => api.get('/search', { params: { q } }).then((r) => r.data),
};

export default api;

// Database status, backups and restore from a backup file (administrators only).
export const databaseService = {
  status: () => api.get('/database/status').then((r) => r.data),
  runs: () => api.get('/database/runs').then((r) => r.data),
  run: (id) => api.get(`/database/runs/${id}`).then((r) => r.data),
  backups: () => api.get('/database/backups').then((r) => r.data),
  restore: (payload) => api.post('/database/restore', payload).then((r) => r.data),
  backup: (payload) => api.post('/database/backups', payload).then((r) => r.data),
  download: (name) => api.get(`/database/backups/${encodeURIComponent(name)}/download`, { responseType: 'blob', timeout: 0 }).then((r) => r.data),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/database/backups/upload', form, { timeout: 0 }).then((r) => r.data);
  },
};
