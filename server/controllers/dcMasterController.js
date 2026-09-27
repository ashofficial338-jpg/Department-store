import DistributionCenter from '../models/DistributionCenter.js';
import crudFactory from '../utils/crudFactory.js';

export const dcMasterController = crudFactory(DistributionCenter, {
  entityName: 'DistributionCenter',
  searchFields: ['name', 'code'],
  populate: ['manager'],
});

export default dcMasterController;
