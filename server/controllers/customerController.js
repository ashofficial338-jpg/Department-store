import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';

export const listCustomers = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.search) {
    filter.$or = [
      { name: new RegExp(req.query.search, 'i') },
      { phone: new RegExp(req.query.search, 'i') },
      { email: new RegExp(req.query.search, 'i') },
      { customerId: new RegExp(req.query.search, 'i') },
    ];
  }
  // Deleted (inactive) customers are hidden unless a status is asked for explicitly.
  filter.status = req.query.status || { $ne: 'inactive' };
  if (req.query.outstandingOnly === 'true') filter.outstanding = { $gt: 0 };

  const [docs, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Customer.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const getCustomer = catchAsync(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new ApiError(404, 'Customer not found.');
  res.json({ success: true, data: customer });
});

export const createCustomer = catchAsync(async (req, res) => {
  const count = await Customer.countDocuments();
  const customerId = `CUST${String(count + 1).padStart(5, '0')}`;
  const customer = await Customer.create({ ...req.body, customerId });
  await recordAudit({ req, action: 'customer.create', entity: 'Customer', entityId: customer._id, newValue: { name: customer.name, phone: customer.phone } });
  res.status(201).json({ success: true, data: customer });
});

export const updateCustomer = catchAsync(async (req, res) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!customer) throw new ApiError(404, 'Customer not found.');
  await recordAudit({ req, action: 'customer.update', entity: 'Customer', entityId: customer._id, newValue: req.body });
  res.json({ success: true, data: customer });
});

// Soft delete: the customer is marked inactive so their past invoices stay intact.
export const deleteCustomer = catchAsync(async (req, res) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true });
  if (!customer) throw new ApiError(404, 'Customer not found.');
  await recordAudit({ req, action: 'customer.delete', entity: 'Customer', entityId: customer._id });
  res.json({ success: true, message: 'Customer removed.' });
});

export const customerDashboard = catchAsync(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new ApiError(404, 'Customer not found.');

  const sales = await Sale.find({ customer: customer._id, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 });
  const totalPurchases = sales.reduce((s, x) => s + (x.grandTotal || 0), 0);
  const orderCount = sales.length;
  const avgOrderValue = orderCount ? totalPurchases / orderCount : 0;

  const categoryCount = {};
  sales.forEach((s) => s.items.forEach((i) => {
    categoryCount[i.sku] = (categoryCount[i.sku] || 0) + i.quantity;
  }));

  res.json({
    success: true,
    data: {
      customer,
      totalPurchases,
      orderCount,
      avgOrderValue,
      outstanding: customer.outstanding,
      lastPurchase: sales[0]?.createdAt || null,
      recentPurchases: sales.slice(0, 10),
    },
  });
});

export const customerHistory = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { customer: req.params.id };
  const [docs, total] = await Promise.all([
    Sale.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Sale.countDocuments(filter),
  ]);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }) });
});

export const outstandingCustomers = catchAsync(async (req, res) => {
  const docs = await Customer.find({ outstanding: { $gt: 0 } }).sort({ outstanding: -1 });
  res.json({ success: true, data: docs });
});

export default {
  listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer,
  customerDashboard, customerHistory, outstandingCustomers,
};
