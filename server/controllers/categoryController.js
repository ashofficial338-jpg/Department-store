import Category from '../models/Category.js';
import crudFactory from '../utils/crudFactory.js';

export const categoryController = crudFactory(Category, {
  entityName: 'Category',
  searchFields: ['name'],
  populate: ['parent'],
});

export default categoryController;
