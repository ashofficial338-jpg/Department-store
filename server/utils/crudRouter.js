import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';

export function crudRouter(controller, { extra } = {}) {
  const router = Router();
  router.use(protect);
  router.get('/all', controller.listAll);
  router.get('/', controller.list);
  router.get('/:id', controller.getOne);
  router.post('/', controller.create);
  router.put('/:id', adminOnly, controller.update);
  router.delete('/:id', adminOnly, controller.remove);
  if (extra) extra(router);
  return router;
}

export default crudRouter;
