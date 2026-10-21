// Reporting: the dashboard, the P&L and the reports module must agree; exports must be valid files;
// financial sections stay behind the finance permission.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, tokenFor, USERS } from './helpers.js';

let admin; let storeManager; let base;
before(async () => {
  base = await start();
  admin = await tokenFor(USERS.admin);
  storeManager = await tokenFor(USERS.storeManager);
});
after(stop);

test('RPT-01 dashboard, P&L and the reports overview report the same figures for this month', async () => {
  const [k, pl, ov] = await Promise.all([
    api('GET', '/dashboard/kpis', { token: admin }),
    api('GET', '/reports/profit-loss?range=this_month', { token: admin }),
    api('GET', '/reports/advanced/overview?range=this_month', { token: admin }),
  ]);
  const cur = ov.body.data.summary.current;
  assert.equal(cur.revenue, k.body.data.period.revenue.value, 'revenue');
  assert.equal(cur.expenses, k.body.data.period.expenses.value, 'expenses');
  assert.equal(cur.purchases, k.body.data.period.purchases.value, 'purchases');
  assert.ok(Math.abs(cur.netProfit - pl.body.data.profit.netProfit) < 0.05, `net profit ${cur.netProfit} vs P&L ${pl.body.data.profit.netProfit}`);
  assert.ok(Math.abs(cur.netProfit - k.body.data.period.netProfit.value) < 0.05, 'net profit vs dashboard');
});

test('RPT-02 section totals equal the sum of their rows', async () => {
  const r = await api('GET', '/reports/advanced/section/expenses?range=this_month&limit=200', { token: admin });
  const sum = Math.round(r.body.data.rows.reduce((t, x) => t + x.amount, 0) * 100) / 100;
  assert.equal(r.body.data.pagination.total <= 200 ? sum : r.body.data.totals.amount, r.body.data.totals.amount);
});

async function exportFile(token, body) {
  const res = await fetch(`${base}/reports/advanced/export`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, type: res.headers.get('content-type'), buf: Buffer.from(await res.arrayBuffer()) };
}

test('RPT-03 PDF and Excel exports are real files', async () => {
  const pdf = await exportFile(admin, { format: 'pdf', title: 'QA', sections: ['summary', 'pnl'], filters: { range: 'this_month' } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.buf.subarray(0, 5).toString(), '%PDF-');
  const xlsx = await exportFile(admin, { format: 'xlsx', title: 'QA', sections: ['summary', 'products'], filters: { range: 'this_month' } });
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.buf.subarray(0, 2).toString(), 'PK', 'xlsx is a zip container');
});

test('RPT-04 users without finance access cannot open or export financial sections', async () => {
  assert.equal((await api('GET', '/reports/advanced/section/pnl', { token: storeManager })).status, 403);
  assert.equal((await exportFile(storeManager, { format: 'pdf', sections: ['pnl'] })).status, 403);
  const products = await api('GET', '/reports/advanced/section/products?limit=1', { token: storeManager });
  assert.equal(products.status, 200);
  assert.ok(!products.body.data.columns.some((c) => ['cogs', 'purchasePrice', 'grossProfit'].includes(c.key)), 'cost and profit columns hidden');
});

test('RPT-05 invalid report filters are rejected with 400, not 500', async () => {
  for (const q of ['range=bogus', 'product=not-an-id', 'range=custom&from=2026-06-01', 'granularity=hourly']) {
    const r = await api('GET', `/reports/advanced/overview?${q}`, { token: admin });
    assert.equal(r.status, 400, q);
  }
});
