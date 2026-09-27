import { vendorController } from '../controllers/vendorController.js';
import crudRouter from '../utils/crudRouter.js';

export default crudRouter(vendorController, {
  extra: (router) => router.get('/:id/dashboard', vendorController.vendorDashboard),
});
