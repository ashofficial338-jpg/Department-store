import { supplierController } from '../controllers/supplierController.js';
import crudRouter from '../utils/crudRouter.js';

export default crudRouter(supplierController, { read: ['vendors', 'purchasing'], write: ['vendors'] });
