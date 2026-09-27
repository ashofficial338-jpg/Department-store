import Supplier from '../models/Supplier.js';
import crudFactory from '../utils/crudFactory.js';

export const supplierController = crudFactory(Supplier, { entityName: 'Supplier', searchFields: ['name'] });

export default supplierController;
