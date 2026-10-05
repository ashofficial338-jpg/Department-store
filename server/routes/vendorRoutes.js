import { vendorController } from '../controllers/vendorController.js';
import crudRouter from '../utils/crudRouter.js';

export default crudRouter(vendorController, {
  read: ['vendors', 'purchasing'],
  write: ['vendors'],
  extra: (router, { canRead }) => router.get('/:id/dashboard', canRead, vendorController.vendorDashboard),
});
