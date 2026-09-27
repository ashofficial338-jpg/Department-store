import Brand from '../models/Brand.js';
import crudFactory from '../utils/crudFactory.js';

export const brandController = crudFactory(Brand, { entityName: 'Brand', searchFields: ['name'] });

export default brandController;
