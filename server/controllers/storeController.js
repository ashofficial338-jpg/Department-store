import Store from '../models/Store.js';
import crudFactory from '../utils/crudFactory.js';

export const storeController = crudFactory(Store, { entityName: 'Store', searchFields: ['name', 'code'], populate: ['manager'] });

export default storeController;
