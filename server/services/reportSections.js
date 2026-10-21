import Product from '../models/Product.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Supplier from '../models/Supplier.js';
import Vendor from '../models/Vendor.js';
import Settings from '../models/Settings.js';
import ApiError from '../utils/ApiError.js';
import { round2 } from '../utils/gstCalculator.js';
import { can } from '../middleware/auth.js';
import {
  parseReportFilters, resolveScope, describeFilters, buildFacts, summarize, trendRows, productRows, groupRows, stockRows,
  cashflow, outstanding, salesInvoiceRows, expenseRows, purchaseRows, customerRows, vendorRows, transactionRows, gstRows, pnlRows, summaryRows,
} from './reportEngine.js';

// Column spec used by the page, the PDF and the workbook:
//   type     text | currency | int | number | percent | date | datetime | mixed (row.type decides)
//   total    'sum' | { ratio: [numeratorKey, denominatorKey] }  -> totals row (SUBTOTAL formulas in Excel)
//   formula  Excel row formula with {columnKey} placeholders, e.g. '{netSales}-{cogs}'
//   financial  hidden from users without finance access; unscopedOnly hidden while product/payment filters apply
//   cf       conditional format: 'negative' (red when < 0), 'bar' (data bar), 'stock' (low/out highlight)

const C = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const money = (key, label, extra) => C(key, label, 'currency', { total: 'sum', ...extra });

export const SECTIONS = {
  summary: {
    title: 'Dashboard Summary', sheet: 'Dashboard Summary', group: 'Overview',
    description: 'Key figures for the period compared with the previous period of the same length.',
    columns: [C('metric', 'Metric'), C('current', 'This period', 'mixed'), C('previous', 'Previous period', 'mixed'), C('change', 'Change', 'number', { suffixFrom: 'changeType', cf: 'negative' })],
    build: async (ctx) => summaryRows(await ctx.summary(), ctx.f.compare ? await ctx.prevSummary() : null, { financial: ctx.financial }),
  },
  trend: {
    title: 'Performance Trend', sheet: 'Dashboard Summary', group: 'Overview',
    description: 'Revenue, expenses, purchases and profit for each period bucket.',
    columns: [
      C('label', 'Period'), money('revenue', 'Revenue', { cf: 'bar' }), C('invoices', 'Invoices', 'int', { total: 'sum' }), money('netSales', 'Net sales'),
      money('cogs', 'COGS', { financial: true }), money('grossProfit', 'Gross profit', { financial: true, formula: '{netSales}-{cogs}', cf: 'negative' }),
      money('expenses', 'Expenses'), money('purchases', 'Purchases', { financial: true }),
      money('netProfit', 'Net profit', { financial: true, unscopedOnly: true, formula: '{grossProfit}-{expenses}', cf: 'negative' }),
      C('netMargin', 'Net margin', 'percent', { financial: true, unscopedOnly: true, total: { ratio: ['netProfit', 'netSales'] }, formula: 'IF({netSales}=0,"",{netProfit}/{netSales}*100)', cf: 'negative' }),
      C('profitGrowth', 'Profit growth', 'percent', { financial: true, cf: 'negative' }),
    ],
    build: async (ctx) => trendRows(await ctx.facts(), ctx.f),
    note: (ctx) => (ctx.scoped ? 'Net profit is hidden while product or payment filters are active, because expenses are not allocated to products. Profit growth uses gross profit.' : null),
  },
  sales: {
    title: 'Revenue & Sales Invoices', sheet: 'Revenue and Sales', group: 'Sales',
    description: 'Every invoice in the period with GST and payment method.',
    columns: [
      C('invoice', 'Invoice #'), C('date', 'Date', 'datetime'), C('store', 'Store'), C('customer', 'Customer'), C('payment', 'Payment'),
      C('units', 'Units', 'int', { total: 'sum' }), money('subtotal', 'Subtotal'), money('discount', 'Discount'), money('taxable', 'Taxable value', { formula: '{subtotal}-{discount}' }),
      money('gst', 'GST'), money('total', 'Invoice total', { cf: 'bar' }), C('status', 'Status'),
    ],
    build: (ctx) => salesInvoiceRows(ctx.f, ctx.ids),
  },
  products: {
    title: 'Product Performance', sheet: 'Products and Brands', group: 'Products',
    description: 'Full product catalogue with brand, manufacturer, pricing, GST, stock-independent margins and period sales.',
    columns: [
      C('sku', 'SKU'), C('name', 'Product'), C('brand', 'Brand'), C('category', 'Category'), C('supplier', 'Manufacturer'), C('hsn', 'HSN'),
      C('gstRate', 'GST %', 'percent'), C('mrp', 'MRP', 'currency'), C('sellingPrice', 'Selling price (ex-GST)', 'currency'), C('purchasePrice', 'Purchase price', 'currency', { financial: true }),
      C('unitMargin', 'Unit margin', 'percent', { financial: true, formula: 'IF({sellingPrice}=0,"",({sellingPrice}-{purchasePrice})/{sellingPrice}*100)' }),
      C('units', 'Units sold', 'int', { total: 'sum' }), money('revenue', 'Revenue (incl. GST)', { cf: 'bar' }), money('netSales', 'Sales (ex-GST)'),
      money('cogs', 'COGS', { financial: true, formula: '{units}*{purchasePrice}' }), money('grossProfit', 'Gross profit', { financial: true, formula: '{netSales}-{cogs}', cf: 'negative' }),
      C('profitMargin', 'Profit margin', 'percent', { financial: true, total: { ratio: ['grossProfit', 'netSales'] }, formula: 'IF({netSales}=0,"",{grossProfit}/{netSales}*100)', cf: 'negative' }),
    ],
    build: async (ctx) => productRows(await ctx.facts()).sort((a, b) => b.revenue - a.revenue),
  },
  brands: {
    title: 'Brand Performance', sheet: 'Products and Brands', group: 'Products',
    description: 'Sales and profit by brand (before returns, which are recorded per invoice).',
    columns: brandCols('Brand'),
    build: async (ctx) => groupRows(productRows(await ctx.facts()), 'brand'),
  },
  categories: {
    title: 'Category-wise Sales', sheet: 'Products and Brands', group: 'Products',
    description: 'Sales and profit by product category.',
    columns: brandCols('Category'),
    build: async (ctx) => groupRows(productRows(await ctx.facts()), 'category'),
  },
  expenses: {
    title: 'Expenses', sheet: 'Expenses', group: 'Finance',
    description: 'Every expense entry in the period.',
    columns: [C('date', 'Date', 'date'), C('category', 'Category'), C('description', 'Description'), C('store', 'Store'), C('method', 'Paid via'), money('amount', 'Amount', { cf: 'bar' })],
    build: (ctx) => expenseRows(ctx.f),
    summary: async (ctx) => Object.entries((await ctx.summary()).expensesByCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k.replace('_', ' '), value: v, type: 'currency' })),
  },
  purchases: {
    title: 'Purchases', sheet: 'Purchases', group: 'Purchasing', financial: true,
    description: 'Purchase orders and vendor bills with payment status.',
    columns: [
      C('po', 'PO #'), C('vendorInvoice', 'Vendor invoice'), C('date', 'Date', 'date'), C('vendor', 'Vendor'), C('location', 'Delivered to'),
      C('units', 'Units', 'int', { total: 'sum' }), money('taxable', 'Taxable value'), money('gst', 'GST'), money('total', 'Bill total', { formula: '{taxable}+{gst}', cf: 'bar' }),
      money('paid', 'Paid'), money('balance', 'Balance due', { formula: '{total}-{paid}' }), C('status', 'Status'),
    ],
    build: (ctx) => purchaseRows(ctx.f, ctx.ids),
  },
  inventory: {
    title: 'Inventory & Stock Valuation', sheet: 'Inventory and Stock', group: 'Inventory',
    description: 'Current stock across all stores and DCs, valued at cost and selling price, with expected profit.',
    columns: [
      C('sku', 'SKU'), C('name', 'Product'), C('brand', 'Brand'), C('category', 'Category'), C('stock', 'Stock qty', 'int', { total: 'sum', cf: 'stock' }), C('reorderLevel', 'Reorder level', 'int'),
      C('statusLabel', 'Status', 'text', { cf: 'status' }), C('purchasePrice', 'Cost price', 'currency'), C('sellingPrice', 'Selling price (ex-GST)', 'currency'),
      money('stockValue', 'Stock value (cost)', { formula: '{stock}*{purchasePrice}', cf: 'bar' }), money('retailValue', 'Retail value', { formula: '{stock}*{sellingPrice}' }),
      money('expectedProfit', 'Expected profit', { financial: true, formula: '{retailValue}-{stockValue}', cf: 'negative' }),
      C('dailySales', 'Avg units / day', 'number'), C('daysOfCover', 'Days of cover', 'number'),
    ],
    build: async (ctx) => (await ctx.stock()).sort((a, b) => b.stockValue - a.stockValue),
    note: () => 'Stock quantities are as of now; average daily sales use the selected period.',
  },
  alerts: {
    title: 'Low & Out of Stock Alerts', sheet: 'Inventory and Stock', group: 'Inventory',
    description: 'Products at or below their reorder level, with a suggested reorder quantity.',
    columns: [
      C('sku', 'SKU'), C('name', 'Product'), C('brand', 'Brand'), C('supplier', 'Manufacturer'), C('statusLabel', 'Status', 'text', { cf: 'status' }),
      C('stock', 'Stock qty', 'int', { cf: 'stock' }), C('reorderLevel', 'Reorder level', 'int'), C('daysOfCover', 'Days of cover', 'number'),
      C('reorderQty', 'Suggested reorder', 'int', { total: 'sum', formula: 'MAX(0,{reorderLevel}*2-{stock})' }), money('reorderCost', 'Reorder cost', { formula: '{reorderQty}*{purchasePrice}', financial: true }),
      C('purchasePrice', 'Cost price', 'currency', { financial: true }),
    ],
    build: async (ctx) => (await ctx.stock()).filter((r) => r.status !== 'in_stock')
      .map((r) => ({ ...r, reorderCost: round2(r.reorderQty * r.purchasePrice) }))
      .sort((a, b) => (a.status === b.status ? a.stock - b.stock : a.status === 'out_of_stock' ? -1 : 1)),
  },
  customers: {
    title: 'Customers', sheet: 'Customers and Suppliers', group: 'Parties',
    description: 'Customer spend in the period, loyalty tier and outstanding credit.',
    columns: [
      C('code', 'Customer ID'), C('name', 'Customer'), C('phone', 'Phone'), C('type', 'Type'), C('tier', 'Tier'), C('orders', 'Orders', 'int', { total: 'sum' }),
      money('spend', 'Spend', { cf: 'bar' }), C('averageBill', 'Average bill', 'currency', { formula: 'IF({orders}=0,0,{spend}/{orders})' }), C('lastPurchase', 'Last purchase', 'date'),
      C('creditLimit', 'Credit limit', 'currency'), money('outstanding', 'Outstanding', { financial: true }),
    ],
    build: (ctx) => customerRows(ctx.f),
  },
  suppliers: {
    title: 'Suppliers & Vendors', sheet: 'Customers and Suppliers', group: 'Parties', financial: true,
    description: 'Vendor purchases and payments in the period, returns and total outstanding.',
    columns: [
      C('name', 'Vendor'), C('gstin', 'GSTIN'), C('phone', 'Phone'), C('terms', 'Terms'), C('orders', 'Orders', 'int', { total: 'sum' }),
      money('purchases', 'Purchases', { cf: 'bar' }), money('paid', 'Paid'), money('returns', 'Returns'), money('outstanding', 'Outstanding (all time)'),
    ],
    build: (ctx) => vendorRows(ctx.f),
  },
  gst: {
    title: 'GST & Tax Summary', sheet: 'GST and Tax Reports', group: 'Finance', financial: true,
    description: 'Output GST on sales vs input tax credit on purchases, by GST rate.',
    columns: [
      C('rate', 'GST slab'), money('salesTaxable', 'Sales taxable value'), money('cgst', 'CGST'), money('sgst', 'SGST'), money('igst', 'IGST'),
      money('outputTax', 'Output GST', { formula: '{cgst}+{sgst}+{igst}' }), money('purchaseTaxable', 'Purchase taxable value'), money('inputTax', 'Input tax credit'),
      money('net', 'Net GST', { formula: '{outputTax}-{inputTax}', cf: 'negative' }),
    ],
    build: async (ctx) => gstRows(await ctx.facts()),
    summary: async (ctx) => {
      const s = await ctx.summary();
      return [
        { label: 'Output GST', value: s.gstOutput, type: 'currency' }, { label: 'Input tax credit', value: s.gstInput, type: 'currency' },
        { label: s.gstNet >= 0 ? 'Net GST payable' : 'ITC carried forward', value: Math.abs(s.gstNet), type: 'currency' },
      ];
    },
    note: () => 'Indicative summary from recorded invoices and bills. File returns from your GSTR-1 / GSTR-3B working papers.',
  },
  pnl: {
    title: 'Profit & Loss Statement', sheet: 'Profit and Loss', group: 'Finance', financial: true,
    description: 'Net sales to net profit and EBITDA.',
    columns: [C('line', 'Particulars'), C('amount', 'Amount', 'currency', { cf: 'negative' }), C('ofSales', '% of net sales', 'percent')],
    build: async (ctx) => pnlRows(await ctx.summary()),
    note: (ctx) => (ctx.scoped ? 'Net profit is not shown while product or payment filters are active, because expenses are not allocated to products.' : null),
  },
  cashflow: {
    title: 'Cash Flow Summary', sheet: 'Profit and Loss', group: 'Finance', financial: true,
    description: 'Money in and out of cash, bank and UPI accounts by source (internal transfers excluded).',
    columns: [C('source', 'Source'), money('inflow', 'Inflow'), money('outflow', 'Outflow'), money('net', 'Net', { formula: '{inflow}-{outflow}', cf: 'negative' })],
    build: async (ctx) => (await ctx.cashflow()).sources,
    summary: async (ctx) => (await ctx.cashflow()).accounts.flatMap((a) => [
      { label: `${a.account} opening`, value: a.opening, type: 'currency' }, { label: `${a.account} closing`, value: a.closing, type: 'currency' },
    ]),
    note: (ctx) => (ctx.cache.cashflow && !ctx.cache.cashflow.hasLedger ? 'No ledger postings recorded yet.' : 'Based on ledger postings to cash, bank and UPI accounts.'),
  },
  outstanding: {
    title: 'Receivables & Payables', sheet: 'Profit and Loss', group: 'Finance', financial: true,
    description: 'Money customers owe you and unpaid vendor bills, as of today.',
    columns: [
      C('type', 'Type'), C('party', 'Party'), C('reference', 'Reference'), C('date', 'Date', 'date'), C('ageDays', 'Age (days)', 'int'),
      money('total', 'Bill total'), money('paid', 'Paid'), money('due', 'Amount due', { cf: 'bar' }),
    ],
    build: async (ctx) => (await ctx.outstanding()).rows,
    summary: async (ctx) => {
      const o = await ctx.outstanding();
      return [
        { label: `Receivables (${o.receivableCount} customers)`, value: o.receivables, type: 'currency' },
        { label: `Payables (${o.payableCount} bills)`, value: o.payables, type: 'currency' },
      ];
    },
    note: () => 'Balances are as of today and are not limited to the selected period.',
  },
  transactions: {
    title: 'Transaction History', sheet: 'Transaction History', group: 'Overview', financial: true,
    description: 'Sales, returns, purchase bills, expenses and payment vouchers in one timeline.',
    columns: [
      C('date', 'Date', 'datetime'), C('type', 'Type'), C('reference', 'Reference'), C('party', 'Party'), C('method', 'Method / status'),
      money('inflow', 'Money in'), money('outflow', 'Money out'), money('net', 'Net', { formula: '{inflow}-{outflow}', cf: 'negative' }),
    ],
    build: (ctx) => transactionRows(ctx.f, ctx.ids),
    note: () => 'Purchase bills are shown at bill value; vendor payments appear separately as payments.',
  },
};

function brandCols(label) {
  return [
    C('name', label), C('products', 'Products', 'int', { total: 'sum' }), C('activeProducts', 'Products sold', 'int', { total: 'sum' }), C('units', 'Units sold', 'int', { total: 'sum' }),
    money('revenue', 'Revenue (incl. GST)', { cf: 'bar' }), money('netSales', 'Sales (ex-GST)'), money('cogs', 'COGS', { financial: true }),
    money('grossProfit', 'Gross profit', { financial: true, formula: '{netSales}-{cogs}', cf: 'negative' }),
    C('profitMargin', 'Profit margin', 'percent', { financial: true, total: { ratio: ['grossProfit', 'netSales'] }, formula: 'IF({netSales}=0,"",{grossProfit}/{netSales}*100)', cf: 'negative' }),
    C('share', 'Revenue share', 'percent', { total: 'sum' }),
  ];
}

export const SHEET_ORDER = ['Dashboard Summary', 'Revenue and Sales', 'Expenses', 'Purchases', 'Products and Brands', 'Inventory and Stock', 'Customers and Suppliers', 'GST and Tax Reports', 'Profit and Loss', 'Transaction History'];

// Built-in templates. Range is a suggestion the user can change before exporting.
export const BUILT_IN_TEMPLATES = [
  { key: 'daily', name: 'Daily Report', range: 'today', granularity: 'day', sections: ['summary', 'sales', 'expenses', 'purchases', 'alerts', 'transactions'] },
  { key: 'weekly', name: 'Weekly Report', range: 'this_week', granularity: 'day', sections: ['summary', 'trend', 'products', 'categories', 'expenses', 'purchases', 'alerts'] },
  { key: 'monthly', name: 'Monthly Report', range: 'this_month', granularity: 'day', sections: ['summary', 'trend', 'products', 'brands', 'categories', 'expenses', 'purchases', 'gst', 'pnl'] },
  { key: 'quarterly', name: 'Quarterly Report', range: 'this_quarter', granularity: 'month', sections: ['summary', 'trend', 'brands', 'categories', 'expenses', 'purchases', 'gst', 'pnl', 'cashflow'] },
  { key: 'yearly', name: 'Yearly Report', range: 'this_year', granularity: 'month', sections: ['summary', 'trend', 'products', 'brands', 'categories', 'expenses', 'purchases', 'customers', 'suppliers', 'gst', 'pnl', 'cashflow', 'outstanding'] },
  { key: 'inventory', name: 'Inventory Report', range: 'this_month', granularity: 'week', sections: ['inventory', 'alerts', 'products'] },
  { key: 'financial', name: 'Financial Report', range: 'this_month', granularity: 'week', sections: ['summary', 'trend', 'pnl', 'cashflow', 'outstanding', 'gst', 'expenses', 'purchases'] },
  { key: 'product_performance', name: 'Product Performance', range: 'this_month', granularity: 'week', sections: ['summary', 'products', 'brands', 'categories', 'trend'] },
];

export const hasFinancialAccess = (req) => can(req, 'finance') || can(req, 'dashboard.financials');

export function allowedSections(req) {
  const financial = hasFinancialAccess(req);
  return Object.entries(SECTIONS).filter(([, s]) => financial || !s.financial).map(([key]) => key);
}

// Per-request context: each expensive piece is computed at most once and shared by every section.
export async function createContext(req) {
  const f = parseReportFilters(req.query);
  const ids = await resolveScope(f);
  const cache = {};
  const once = (k, fn) => () => { if (!cache[k]) cache[k] = fn(); return cache[k]; };
  const ctx = {
    req, f, ids, cache, financial: hasFinancialAccess(req), scoped: !!ids || !!f.paymentMethod,
    facts: once('facts', () => buildFacts(f.from, f.to, f, ids)),
    prevFacts: once('prevFacts', () => buildFacts(f.prevFrom, f.prevTo, f, ids)),
    summary: once('summary', async () => summarize(await ctx.facts())),
    prevSummary: once('prevSummary', async () => summarize(await ctx.prevFacts())),
    stock: once('stock', async () => stockRows(await ctx.facts(), f)),
    cashflow: once('cashflowP', async () => { const c = await cashflow(f); cache.cashflow = c; return c; }),
    outstanding: once('outstanding', () => outstanding()),
    settings: once('settings', () => Settings.findOne().lean()),
    names: once('names', async () => {
      const get = async (Model, id) => (id ? (await Model.findById(id).select('name').lean())?.name : undefined);
      return { product: await get(Product, f.product), category: await get(Category, f.category), brand: await get(Brand, f.brand), supplier: await get(Supplier, f.supplier), vendor: await get(Vendor, f.vendor) };
    }),
  };
  ctx.filtersText = async () => describeFilters(f, await ctx.names());
  return ctx;
}

// Builds one section: rows plus totals, with financial columns removed for users without access.
export async function buildSection(ctx, key) {
  const def = SECTIONS[key];
  if (!def) throw new ApiError(404, `Unknown report section: ${key}`);
  if (def.financial && !ctx.financial) throw new ApiError(403, 'You do not have access to financial reports.');
  const columns = def.columns.filter((c) => (ctx.financial || !c.financial) && (!c.unscopedOnly || !ctx.scoped));
  const rows = await def.build(ctx);
  const totals = {};
  for (const c of columns) {
    if (c.total === 'sum') totals[c.key] = round2(rows.reduce((t, r) => t + (Number(r[c.key]) || 0), 0));
  }
  for (const c of columns) {
    if (c.total?.ratio) {
      const [a, b] = c.total.ratio;
      const den = rows.reduce((t, r) => t + (Number(r[b]) || 0), 0);
      totals[c.key] = den ? round2((rows.reduce((t, r) => t + (Number(r[a]) || 0), 0) / den) * 100) : null;
    }
  }
  return {
    key, title: def.title, sheet: def.sheet, description: def.description, columns, rows,
    totals: Object.keys(totals).length ? totals : null,
    summary: def.summary ? await def.summary(ctx) : [],
    note: def.note ? def.note(ctx) : null,
  };
}
