import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Expense from '../models/Expense.js';
import Customer from '../models/Customer.js';
import { round2 } from '../utils/gstCalculator.js';
import {
  SALE_STATUSES, resolveProductScope, salesByProduct, productProfitability, inventoryAnalysis, financialSummary,
  expensesTotal, salesTotal, purchasesTotal, receivablesTotal, payablesTotal, todayAndYesterday,
} from './analyticsService.js';

// Every clickable dashboard element maps to one dataset here. The same dataset powers the detail page
// and its CSV / Excel / PDF export, so what a user sees is exactly what they export.
//
// section: the dashboard.* permission needed to view it.  defaultRange: used when no date filter is supplied.
// Column types: text | int | number | currency | percent | days | date | datetime

const ROW_LIMIT = 5000;
const label = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const share = (v, total) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);
const productMatch = (ids) => (ids ? { 'items.product': { $in: ids } } : {});

function saleQuery(f, ids) {
  const q = { createdAt: { $gte: f.from, $lte: f.to }, status: { $in: SALE_STATUSES }, ...productMatch(ids) };
  if (f.paymentMethod) q['payments.method'] = f.paymentMethod;
  return q;
}

async function salesInvoices(f) {
  const ids = await resolveProductScope(f);
  const docs = await Sale.find(saleQuery(f, ids)).populate('customer', 'name').sort({ createdAt: -1 }).limit(ROW_LIMIT).lean();
  const rows = docs.map((d) => ({
    invoice: d.invoiceNumber, date: d.createdAt, customer: d.customer?.name || 'Walk-in',
    items: d.items.reduce((s, i) => s + i.quantity, 0),
    payment: Array.from(new Set((d.payments || []).map((p) => label(p.method)))).join(', '),
    taxable: d.taxableAmount, tax: d.taxAmount, total: d.grandTotal, status: label(d.status),
  }));
  const total = round2(rows.reduce((s, r) => s + (r.total || 0), 0));
  return {
    columns: [
      { key: 'invoice', label: 'Invoice' }, { key: 'date', label: 'Date', type: 'datetime' }, { key: 'customer', label: 'Customer' },
      { key: 'items', label: 'Units', type: 'int' }, { key: 'payment', label: 'Payment' }, { key: 'taxable', label: 'Taxable', type: 'currency' },
      { key: 'tax', label: 'GST', type: 'currency' }, { key: 'total', label: 'Total', type: 'currency' }, { key: 'status', label: 'Status' },
    ],
    rows,
    summary: [
      { label: 'Revenue (incl. GST)', value: total, type: 'currency' },
      { label: 'Invoices', value: rows.length, type: 'int' },
      { label: 'Average bill', value: rows.length ? round2(total / rows.length) : 0, type: 'currency' },
    ],
    note: ids ? 'Product filters show invoices containing the selected products; totals are full invoice values.' : undefined,
  };
}

async function revenueTrend(f) {
  const ids = await resolveProductScope(f);
  const monthly = f.days > 62;
  const format = monthly ? '%Y-%m' : '%Y-%m-%d';
  const pipeline = [{ $match: saleQuery(f, null) }];
  if (ids) {
    pipeline.push({ $unwind: '$items' }, { $match: { 'items.product': { $in: ids } } },
      { $group: { _id: { $dateToString: { format, date: '$createdAt' } }, revenue: { $sum: '$items.totalAmount' }, invoices: { $addToSet: '$_id' } } },
      { $project: { revenue: 1, invoices: { $size: '$invoices' } } });
  } else {
    pipeline.push({ $group: { _id: { $dateToString: { format, date: '$createdAt' } }, revenue: { $sum: '$grandTotal' }, invoices: { $sum: 1 } } });
  }
  pipeline.push({ $sort: { _id: 1 } });
  const rows = (await Sale.aggregate(pipeline)).map((r) => ({
    period: r._id, invoices: r.invoices, revenue: round2(r.revenue), averageBill: r.invoices ? round2(r.revenue / r.invoices) : 0,
  }));
  const total = round2(rows.reduce((s, r) => s + r.revenue, 0));
  return {
    columns: [
      { key: 'period', label: monthly ? 'Month' : 'Date' }, { key: 'invoices', label: 'Invoices', type: 'int' },
      { key: 'revenue', label: 'Revenue', type: 'currency' }, { key: 'averageBill', label: 'Average bill', type: 'currency' },
    ],
    rows,
    summary: [
      { label: 'Revenue (incl. GST)', value: total, type: 'currency' },
      { label: 'Average per day', value: round2(total / f.days), type: 'currency' },
    ],
  };
}

async function expensesList(f) {
  const match = { expenseDate: { $gte: f.from, $lte: f.to } };
  if (f.expenseCategory) match.category = f.expenseCategory;
  const docs = await Expense.find(match).populate('store', 'name').sort({ expenseDate: -1 }).limit(ROW_LIMIT).lean();
  const rows = docs.map((d) => ({
    date: d.expenseDate, category: label(d.category), description: d.description,
    paymentMethod: label(d.paymentMethod), store: d.store?.name || '-', amount: d.amount,
  }));
  const byCategory = {};
  rows.forEach((r) => { byCategory[r.category] = round2((byCategory[r.category] || 0) + r.amount); });
  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  return {
    columns: [
      { key: 'date', label: 'Date', type: 'date' }, { key: 'category', label: 'Category' }, { key: 'description', label: 'Description' },
      { key: 'paymentMethod', label: 'Paid via' }, { key: 'store', label: 'Store' }, { key: 'amount', label: 'Amount', type: 'currency' },
    ],
    rows,
    summary: [
      { label: 'Total expenses', value: total, type: 'currency' },
      { label: 'Entries', value: rows.length, type: 'int' },
      ...Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, type: 'currency' })),
    ],
  };
}

async function purchasesList(f) {
  const docs = await Purchase.find({ createdAt: { $gte: f.from, $lte: f.to }, status: { $ne: 'draft' } })
    .populate('vendor', 'name').sort({ createdAt: -1 }).limit(ROW_LIMIT).lean();
  const rows = docs.map((d) => ({
    poNumber: d.poNumber, date: d.createdAt, vendor: d.vendor?.name || '-', status: label(d.status),
    subtotal: d.subtotal, tax: d.taxAmount, total: d.grandTotal, paid: d.amountPaid, balance: round2((d.grandTotal || 0) - (d.amountPaid || 0)),
  }));
  return {
    columns: [
      { key: 'poNumber', label: 'PO #' }, { key: 'date', label: 'Date', type: 'datetime' }, { key: 'vendor', label: 'Vendor' },
      { key: 'status', label: 'Status' }, { key: 'subtotal', label: 'Subtotal', type: 'currency' }, { key: 'tax', label: 'GST', type: 'currency' },
      { key: 'total', label: 'Total', type: 'currency' }, { key: 'paid', label: 'Paid', type: 'currency' }, { key: 'balance', label: 'Balance', type: 'currency' },
    ],
    rows,
    summary: [
      { label: 'Purchases', value: round2(rows.reduce((s, r) => s + (r.total || 0), 0)), type: 'currency' },
      { label: 'Orders', value: rows.length, type: 'int' },
    ],
  };
}

const PRODUCT_PROFIT_COLUMNS = [
  { key: 'name', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'category', label: 'Category' },
  { key: 'units', label: 'Units sold', type: 'int' }, { key: 'revenue', label: 'Revenue (ex-GST)', type: 'currency' },
  { key: 'cogs', label: 'COGS', type: 'currency' }, { key: 'profit', label: 'Profit', type: 'currency' },
  { key: 'marginPercent', label: 'Margin', type: 'percent' }, { key: 'roiPercent', label: 'ROI', type: 'percent' },
];

async function productRoi(f) {
  const ids = await resolveProductScope(f);
  const { products, totals } = await productProfitability(f.from, f.to, ids);
  return {
    columns: PRODUCT_PROFIT_COLUMNS,
    rows: products,
    summary: [
      { label: 'Product ROI', value: totals.roiPercent, type: 'percent' },
      { label: 'Revenue (ex-GST)', value: totals.revenue, type: 'currency' },
      { label: 'COGS', value: totals.cogs, type: 'currency' },
      { label: 'Profit', value: totals.profit, type: 'currency' },
      { label: 'Margin', value: totals.marginPercent, type: 'percent' },
    ],
    formula: 'Product ROI = (Revenue ex-GST − COGS) ÷ COGS × 100',
  };
}

async function marginByCategory(f) {
  const ids = await resolveProductScope(f);
  const { products, totals } = await productProfitability(f.from, f.to, ids);
  const map = new Map();
  products.forEach((p) => {
    const c = map.get(p.category) || { category: p.category, units: 0, revenue: 0, cogs: 0 };
    c.units += p.units; c.revenue += p.revenue; c.cogs += p.cogs;
    map.set(p.category, c);
  });
  const rows = Array.from(map.values()).map((c) => {
    const profit = round2(c.revenue - c.cogs);
    return {
      category: c.category, units: c.units, revenue: round2(c.revenue), cogs: round2(c.cogs), profit,
      marginPercent: c.revenue ? Math.round((profit / c.revenue) * 1000) / 10 : null,
    };
  }).sort((a, b) => b.revenue - a.revenue);
  return {
    columns: [
      { key: 'category', label: 'Category' }, { key: 'units', label: 'Units sold', type: 'int' },
      { key: 'revenue', label: 'Revenue (ex-GST)', type: 'currency' }, { key: 'cogs', label: 'COGS', type: 'currency' },
      { key: 'profit', label: 'Gross profit', type: 'currency' }, { key: 'marginPercent', label: 'Margin', type: 'percent' },
    ],
    rows,
    summary: [
      { label: 'Gross margin', value: totals.marginPercent, type: 'percent' },
      { label: 'Gross profit', value: totals.profit, type: 'currency' },
      { label: 'Revenue (ex-GST)', value: totals.revenue, type: 'currency' },
    ],
    formula: 'Gross margin = (Revenue ex-GST − COGS) ÷ Revenue ex-GST × 100',
  };
}

async function ebitdaBreakdown(f) {
  const fin = await financialSummary(f.from, f.to);
  const rows = [
    { item: 'Gross sales', amount: fin.revenue.grossSales },
    { item: 'Less: discounts', amount: -fin.revenue.discounts },
    { item: 'Less: returns', amount: -fin.revenue.returns },
    { item: 'Net sales', amount: fin.revenue.netSales, emphasis: true },
    { item: 'Less: cost of goods sold', amount: -fin.cost.costOfGoodsSold },
    { item: 'Gross profit', amount: fin.profit.grossProfit, emphasis: true },
    ...Object.entries(fin.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => ({ item: `Less: ${label(cat)}`, amount: -amt })),
    { item: 'Net profit', amount: fin.ebitda.netProfit, emphasis: true },
    { item: 'Add back: interest', amount: fin.ebitda.interest },
    { item: 'Add back: taxes', amount: fin.ebitda.taxes },
    { item: 'Add back: depreciation', amount: fin.ebitda.depreciation },
    { item: 'Add back: amortization', amount: fin.ebitda.amortization },
    { item: 'EBITDA', amount: fin.ebitda.value, emphasis: true },
  ];
  return {
    columns: [{ key: 'item', label: 'Line item' }, { key: 'amount', label: 'Amount', type: 'currency' }],
    rows,
    summary: [
      { label: 'EBITDA', value: fin.ebitda.value, type: 'currency' },
      { label: 'Net profit', value: fin.ebitda.netProfit, type: 'currency' },
      { label: 'EBITDA margin', value: fin.ebitda.marginPercent, type: 'percent' },
    ],
    formula: 'EBITDA = Net Profit + Interest + Taxes + Depreciation + Amortization',
    note: 'EBITDA is company-wide; product, category and stock filters do not apply. Record interest, income tax, depreciation and amortization as expenses with those categories.',
  };
}

async function itrBreakdown(f) {
  const ids = await resolveProductScope(f);
  const { rows, totals } = await inventoryAnalysis(f, ids);
  return {
    columns: [
      { key: 'name', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'category', label: 'Category' },
      { key: 'openingQty', label: 'Opening qty', type: 'int' }, { key: 'closingQty', label: 'Closing qty', type: 'int' },
      { key: 'openingValue', label: 'Opening inventory', type: 'currency' }, { key: 'closingValue', label: 'Closing inventory', type: 'currency' },
      { key: 'averageInventory', label: 'Average inventory', type: 'currency' }, { key: 'cogs', label: 'COGS', type: 'currency' },
      { key: 'itr', label: 'ITR', type: 'number' },
    ],
    rows: rows.sort((a, b) => (b.itr ?? -1) - (a.itr ?? -1)),
    summary: [
      { label: 'Inventory turnover ratio', value: totals.itr, type: 'number' },
      { label: 'COGS', value: totals.cogs, type: 'currency' },
      { label: 'Opening inventory', value: totals.openingInventory, type: 'currency' },
      { label: 'Closing inventory', value: totals.closingInventory, type: 'currency' },
      { label: 'Average inventory', value: totals.averageInventory, type: 'currency' },
    ],
    formula: 'ITR = COGS ÷ Average Inventory;  Average Inventory = (Opening Inventory + Closing Inventory) ÷ 2  (valued at purchase price)',
  };
}

async function holdingBreakdown(f) {
  const ids = await resolveProductScope(f);
  const { rows, totals } = await inventoryAnalysis(f, ids);
  return {
    columns: [
      { key: 'name', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'category', label: 'Category' },
      { key: 'currentQty', label: 'Current stock', type: 'int' }, { key: 'unitsSold', label: 'Units sold', type: 'int' },
      { key: 'avgDailyUnits', label: 'Avg daily sales (units)', type: 'number' }, { key: 'currentValue', label: 'Stock value', type: 'currency' },
      { key: 'holdingDays', label: 'Holding period', type: 'days' },
    ],
    // Soonest to run out first; items with no sales in the period last.
    rows: rows.sort((a, b) => (a.holdingDays ?? Infinity) - (b.holdingDays ?? Infinity)),
    summary: [
      { label: 'Inventory holding period', value: totals.holdingDays, type: 'days' },
      { label: 'Current inventory', value: totals.currentInventory, type: 'currency' },
      { label: 'Avg daily consumption (COGS)', value: totals.avgDailyConsumption, type: 'currency' },
      { label: 'Days in period', value: totals.days, type: 'int' },
    ],
    formula: 'Inventory Holding Period = Current Inventory ÷ Average Daily Consumption (COGS for the period ÷ days in period)',
  };
}

async function stockPositions(f, { onlyLow = false } = {}) {
  const ids = await resolveProductScope(f);
  const { rows, totals } = await inventoryAnalysis(f, ids);
  const list = (onlyLow ? rows.filter((r) => r.stockStatus !== 'in_stock') : rows)
    .map((r) => ({ ...r, status: label(r.stockStatus) }))
    .sort((a, b) => (onlyLow ? a.currentQty - b.currentQty : b.currentValue - a.currentValue));
  return {
    columns: [
      { key: 'name', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'category', label: 'Category' },
      { key: 'currentQty', label: 'Current stock', type: 'int' }, { key: 'reorderLevel', label: 'Reorder level', type: 'int' },
      { key: 'status', label: 'Status' }, { key: 'purchasePrice', label: 'Unit cost', type: 'currency' },
      { key: 'currentValue', label: 'Stock value', type: 'currency' },
    ],
    rows: list,
    summary: [
      { label: 'Stock value', value: round2(list.reduce((s, r) => s + r.currentValue, 0)), type: 'currency' },
      { label: 'Products', value: list.length, type: 'int' },
      { label: 'Low / out of stock', value: totals.lowStockItems, type: 'int' },
    ],
  };
}

async function receivablesList() {
  const docs = await Customer.find({ outstanding: { $gt: 0 } }).sort({ outstanding: -1 }).limit(ROW_LIMIT).lean();
  const rows = docs.map((c) => ({ customerId: c.customerId, name: c.name, phone: c.phone, type: label(c.customerType), creditLimit: c.creditLimit, outstanding: c.outstanding }));
  return {
    columns: [
      { key: 'customerId', label: 'Customer ID' }, { key: 'name', label: 'Customer' }, { key: 'phone', label: 'Phone' },
      { key: 'type', label: 'Type' }, { key: 'creditLimit', label: 'Credit limit', type: 'currency' }, { key: 'outstanding', label: 'Outstanding', type: 'currency' },
    ],
    rows,
    summary: [
      { label: 'Outstanding receivables', value: round2(rows.reduce((s, r) => s + r.outstanding, 0)), type: 'currency' },
      { label: 'Customers', value: rows.length, type: 'int' },
    ],
    note: 'Receivables are a current balance; date and product filters do not apply.',
  };
}

async function payablesList() {
  const docs = await Purchase.find({ status: { $in: ['received', 'invoiced'] }, $expr: { $gt: ['$grandTotal', '$amountPaid'] } })
    .populate('vendor', 'name').sort({ createdAt: 1 }).limit(ROW_LIMIT).lean();
  const rows = docs.map((d) => ({
    poNumber: d.poNumber, invoiceNumber: d.invoiceNumber || '-', date: d.createdAt, vendor: d.vendor?.name || '-',
    total: d.grandTotal, paid: d.amountPaid, balance: round2(d.grandTotal - d.amountPaid),
  }));
  return {
    columns: [
      { key: 'poNumber', label: 'PO #' }, { key: 'invoiceNumber', label: 'Vendor invoice' }, { key: 'date', label: 'Date', type: 'date' },
      { key: 'vendor', label: 'Vendor' }, { key: 'total', label: 'Total', type: 'currency' }, { key: 'paid', label: 'Paid', type: 'currency' },
      { key: 'balance', label: 'Balance due', type: 'currency' },
    ],
    rows,
    summary: [
      { label: 'Outstanding payables', value: round2(rows.reduce((s, r) => s + r.balance, 0)), type: 'currency' },
      { label: 'Open bills', value: rows.length, type: 'int' },
    ],
    note: 'Payables are a current balance; date and product filters do not apply.',
  };
}

async function paymentMethods(f) {
  const rows = await Sale.aggregate([
    { $match: saleQuery(f, null) },
    { $unwind: '$payments' },
    ...(f.paymentMethod ? [{ $match: { 'payments.method': f.paymentMethod } }] : []),
    { $group: { _id: '$payments.method', amount: { $sum: '$payments.amount' }, transactions: { $sum: 1 } } },
    { $sort: { amount: -1 } },
  ]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    columns: [
      { key: 'method', label: 'Payment method' }, { key: 'transactions', label: 'Transactions', type: 'int' },
      { key: 'amount', label: 'Collected', type: 'currency' }, { key: 'share', label: 'Share', type: 'percent' },
    ],
    rows: rows.map((r) => ({ method: label(r._id), transactions: r.transactions, amount: round2(r.amount), share: share(r.amount, total) })),
    summary: [{ label: 'Total collected', value: round2(total), type: 'currency' }],
  };
}

async function salesByCategory(f) {
  const ids = await resolveProductScope(f);
  const products = await salesByProduct(f.from, f.to, ids, { paymentMethod: f.paymentMethod });
  const map = new Map();
  products.forEach((p) => {
    const c = map.get(p.category) || { category: p.category, units: 0, revenue: 0, products: 0 };
    c.units += p.units; c.revenue += p.grossRevenue; c.products += 1;
    map.set(p.category, c);
  });
  const total = products.reduce((s, p) => s + p.grossRevenue, 0);
  return {
    columns: [
      { key: 'category', label: 'Category' }, { key: 'products', label: 'Products sold', type: 'int' },
      { key: 'units', label: 'Units', type: 'int' }, { key: 'revenue', label: 'Revenue (incl. GST)', type: 'currency' },
      { key: 'share', label: 'Share', type: 'percent' },
    ],
    rows: Array.from(map.values()).map((c) => ({ ...c, revenue: round2(c.revenue), share: share(c.revenue, total) })).sort((a, b) => b.revenue - a.revenue),
    summary: [{ label: 'Revenue (incl. GST)', value: round2(total), type: 'currency' }],
  };
}

async function topProducts(f) {
  const ids = await resolveProductScope(f);
  const products = await salesByProduct(f.from, f.to, ids, { paymentMethod: f.paymentMethod });
  const total = products.reduce((s, p) => s + p.grossRevenue, 0);
  return {
    columns: [
      { key: 'name', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'category', label: 'Category' },
      { key: 'units', label: 'Units sold', type: 'int' }, { key: 'grossRevenue', label: 'Revenue (incl. GST)', type: 'currency' },
      { key: 'profit', label: 'Profit (ex-GST)', type: 'currency' }, { key: 'share', label: 'Share', type: 'percent' },
    ],
    rows: products
      .map((p) => ({ name: p.name, sku: p.sku, category: p.category, units: p.units, grossRevenue: round2(p.grossRevenue), profit: round2(p.revenue - p.cogs), share: share(p.grossRevenue, total) }))
      .sort((a, b) => b.grossRevenue - a.grossRevenue),
    summary: [{ label: 'Revenue (incl. GST)', value: round2(total), type: 'currency' }, { label: 'Products sold', value: products.length, type: 'int' }],
  };
}

// The whole dashboard as one table (only the sections the caller may view).
async function dashboardSummary(f, { canSection }) {
  const ids = await resolveProductScope(f);
  const { today } = todayAndYesterday();
  const rows = [];
  const add = (group, metric, value, type) => rows.push({ group, metric, value, type });

  if (canSection('sales')) {
    const [t, p] = await Promise.all([salesTotal(today.from, today.to, null), salesTotal(f.from, f.to, ids, f)]);
    add('Revenue', "Today's sales", t.value, 'currency');
    add('Revenue', 'Sales in period', p.value, 'currency');
  }
  if (canSection('expenses')) {
    const [t, p] = await Promise.all([expensesTotal(today.from, today.to), expensesTotal(f.from, f.to, f)]);
    add('Expenses', "Today's expenses", t.value, 'currency');
    add('Expenses', 'Expenses in period', p.value, 'currency');
  }
  if (canSection('inventory')) {
    const { totals } = await inventoryAnalysis(f, ids);
    add('Inventory', 'Current stock value', totals.currentInventory, 'currency');
    add('Inventory', 'Low / out of stock items', totals.lowStockItems, 'int');
    add('Inventory', 'Opening inventory', totals.openingInventory, 'currency');
    add('Inventory', 'Closing inventory', totals.closingInventory, 'currency');
    add('Inventory', 'Average inventory', totals.averageInventory, 'currency');
    add('Inventory', 'COGS', totals.cogs, 'currency');
    add('Inventory', 'Inventory turnover ratio (ITR)', totals.itr, 'number');
    add('Inventory', 'Inventory holding period (days)', totals.holdingDays, 'days');
  }
  if (canSection('financials')) {
    const [fin, roi, tp, rec, pay] = await Promise.all([
      financialSummary(f.from, f.to), productProfitability(f.from, f.to, ids), purchasesTotal(today.from, today.to), receivablesTotal(), payablesTotal(),
    ]);
    add('Financials', "Today's purchases", tp, 'currency');
    add('Financials', 'Gross margin', roi.totals.marginPercent, 'percent');
    add('Financials', 'Product ROI', roi.totals.roiPercent, 'percent');
    add('Financials', 'Net profit', fin.ebitda.netProfit, 'currency');
    add('Financials', 'Interest', fin.ebitda.interest, 'currency');
    add('Financials', 'Taxes', fin.ebitda.taxes, 'currency');
    add('Financials', 'Depreciation', fin.ebitda.depreciation, 'currency');
    add('Financials', 'Amortization', fin.ebitda.amortization, 'currency');
    add('Financials', 'EBITDA', fin.ebitda.value, 'currency');
    add('Financials', 'Outstanding receivables', rec.value, 'currency');
    add('Financials', 'Outstanding payables', pay.value, 'currency');
  }
  return {
    columns: [{ key: 'group', label: 'Section' }, { key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', type: 'mixed' }],
    rows,
    summary: [],
  };
}

export const DATASETS = {
  summary: { title: 'Dashboard Summary', section: null, defaultRange: 'this_month', build: dashboardSummary },
  'daily-sales': { title: "Today's Sales", section: 'sales', defaultRange: 'today', build: salesInvoices },
  sales: { title: 'Sales Invoices', section: 'sales', defaultRange: 'this_month', build: salesInvoices },
  'revenue-trend': { title: 'Revenue Trend', section: 'sales', defaultRange: 'this_month', build: revenueTrend },
  'payment-methods': { title: 'Collections by Payment Method', section: 'sales', defaultRange: 'this_month', build: paymentMethods },
  'category-sales': { title: 'Category-wise Sales', section: 'sales', defaultRange: 'this_month', build: salesByCategory },
  'top-products': { title: 'Top Selling Products', section: 'sales', defaultRange: 'this_month', build: topProducts },
  'daily-expenses': { title: "Today's Expenses", section: 'expenses', defaultRange: 'today', build: expensesList },
  expenses: { title: 'Expenses', section: 'expenses', defaultRange: 'this_month', build: expensesList },
  'stock-value': { title: 'Stock Value by Product', section: 'inventory', defaultRange: 'this_month', build: (f) => stockPositions(f) },
  'low-stock': { title: 'Low & Out of Stock Items', section: 'inventory', defaultRange: 'this_month', build: (f) => stockPositions(f, { onlyLow: true }) },
  itr: { title: 'Inventory Turnover Ratio', section: 'inventory', defaultRange: 'this_month', build: itrBreakdown },
  'holding-period': { title: 'Inventory Holding Period', section: 'inventory', defaultRange: 'this_month', build: holdingBreakdown },
  'daily-purchases': { title: "Today's Purchases", section: 'financials', defaultRange: 'today', build: purchasesList },
  'daily-profit': { title: "Today's Profit by Product", section: 'financials', defaultRange: 'today', build: productRoi },
  'gross-margin': { title: 'Gross Margin by Category', section: 'financials', defaultRange: 'this_month', build: marginByCategory },
  'product-roi': { title: 'Product ROI', section: 'financials', defaultRange: 'this_month', build: productRoi },
  ebitda: { title: 'EBITDA Breakdown', section: 'financials', defaultRange: 'this_month', build: ebitdaBreakdown },
  receivables: { title: 'Outstanding Receivables', section: 'financials', defaultRange: 'this_month', build: receivablesList },
  payables: { title: 'Outstanding Payables', section: 'financials', defaultRange: 'this_month', build: payablesList },
};

export default DATASETS;
