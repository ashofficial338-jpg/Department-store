import api from './api.js';

// Mirrors the server's crudFactory shape: list/listAll/getOne/create/update/remove.
export function createResourceService(basePath) {
  return {
    list: (params) => api.get(basePath, { params }).then((r) => r.data),
    listAll: (params) => api.get(`${basePath}/all`, { params }).then((r) => r.data),
    getOne: (id) => api.get(`${basePath}/${id}`).then((r) => r.data),
    create: (payload) => api.post(basePath, payload).then((r) => r.data),
    update: (id, payload) => api.put(`${basePath}/${id}`, payload).then((r) => r.data),
    remove: (id) => api.delete(`${basePath}/${id}`).then((r) => r.data),
  };
}

export default createResourceService;
