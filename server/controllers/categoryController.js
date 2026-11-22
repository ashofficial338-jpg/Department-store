import Category from '../models/Category.js';
import crudFactory from '../utils/crudFactory.js';
import { requireFields } from '../utils/fieldRules.js';

const base = crudFactory(Category, {
  entityName: 'Category',
  searchFields: ['name'],
  populate: ['parent'],
});

// The slug is optional for users: it is made from the name (unique) when left empty.
async function slugFor(name, exceptId) {
  const stem = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
  let slug = stem;
  for (let i = 2; await Category.exists({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }); i += 1) slug = `${stem}-${i}`;
  return slug;
}

const create = async (req, res, next) => {
  try {
    await requireFields('category', { description: req.body?.description });
    if (!req.body?.slug || !String(req.body.slug).trim()) req.body.slug = await slugFor(req.body?.name);
    if (req.body.parent === '') delete req.body.parent;
    return base.create(req, res, next);
  } catch (err) { return next(err); }
};

const update = async (req, res, next) => {
  try {
    if (req.body && 'slug' in req.body && !String(req.body.slug || '').trim()) req.body.slug = await slugFor(req.body.name, req.params.id);
    if (req.body?.parent === '') req.body.parent = null;
    return base.update(req, res, next);
  } catch (err) { return next(err); }
};

export const categoryController = { ...base, create, update };

export default categoryController;
