import TaxRate from '../models/TaxRate.js';
import crudFactory from '../utils/crudFactory.js';

export const taxRateController = crudFactory(TaxRate, { entityName: 'TaxRate', searchFields: ['name'] });

export default taxRateController;
