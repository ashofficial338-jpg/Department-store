import { Router } from 'express';
import { protect, adminOnly, requirePermission } from '../middleware/auth.js';

// read:  permission keys (any-of) required for GET / and GET /:id - omit to keep them readable by all signed-in users.
// write: permission keys (any-of) required to create; update/delete additionally require an administrator.
// GET /all (dropdown lookups) stays available to every signed-in user.
export function crudRouter(controller, { extra, read, write } = {}) {
  const router = Router();
  const pass = (req, res, next) => next();
  const canRead = read ? requirePermission(...read) : pass;
  const canWrite = write ? requirePermission(...write) : pass;
  router.use(protect);
  router.get('/all', controller.listAll);
  router.get('/', canRead, controller.list);
  router.get('/:id', canRead, controller.getOne);
  router.post('/', canWrite, controller.create);
  router.put('/:id', canWrite, adminOnly, controller.update);
  router.delete('/:id', canWrite, adminOnly, controller.remove);
  if (extra) extra(router, { canRead, canWrite });
  return router;
}

export default crudRouter;
