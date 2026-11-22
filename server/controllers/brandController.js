import Brand from '../models/Brand.js';
import crudFactory from '../utils/crudFactory.js';
import ApiError from '../utils/ApiError.js';
import { escapeRegex } from '../utils/validate.js';
import { cleanName } from '../utils/masters.js';
import { requireFields } from '../utils/fieldRules.js';

const base = crudFactory(Brand, { entityName: 'Brand', searchFields: ['name'], defaultSort: { name: 1 } });

// Brand names are unique regardless of letter case or spacing ("Aashirvaad" = "aashirvaad ").
const sameName = (name, exceptId) => Brand.exists({ name: new RegExp(`^${escapeRegex(name)}$`, 'i'), ...(exceptId ? { _id: { $ne: exceptId } } : {}) });

const create = async (req, res, next) => {
  try {
    if (req.body?.name !== undefined) req.body.name = cleanName(req.body.name, 80);
    if (req.body?.name && await sameName(req.body.name)) throw new ApiError(409, `Brand "${req.body.name}" already exists.`);
    await requireFields('brand', { description: req.body?.description });
    return base.create(req, res, next);
  } catch (err) { return next(err); }
};

const update = async (req, res, next) => {
  try {
    if (req.body?.name !== undefined) req.body.name = cleanName(req.body.name, 80);
    if (req.body?.name && await sameName(req.body.name, req.params.id)) throw new ApiError(409, `Brand "${req.body.name}" already exists.`);
    return base.update(req, res, next);
  } catch (err) { return next(err); }
};

export const brandController = { ...base, create, update };

export default brandController;
