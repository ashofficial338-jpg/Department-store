// Authentication, authorization, input handling and mass-assignment checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { start, stop, api, tokenFor, USERS } from './helpers.js';
import User from '../models/User.js';
import Customer from '../models/Customer.js';

let admin; let cashier; let storeManager;
before(async () => {
  await start();
  admin = await tokenFor(USERS.admin);
  cashier = await tokenFor(USERS.cashier);
  storeManager = await tokenFor(USERS.storeManager);
});
after(stop);

test('SEC-01 requests without a token, with a forged token, or with an expired token are refused', async () => {
  assert.equal((await api('GET', '/sales')).status, 401);
  const forged = jwt.sign({ id: '000000000000000000000000' }, 'not-the-secret');
  assert.equal((await api('GET', '/sales', { token: forged })).status, 401);
  const user = await User.findOne({ email: USERS.cashier });
  const expired = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: -10 });
  assert.equal((await api('GET', '/sales', { token: expired })).status, 401);
});

test('SEC-02 a deactivated account loses access immediately', async () => {
  const user = await User.findOne({ email: USERS.storeManager });
  await User.updateOne({ _id: user._id }, { isActive: false });
  try {
    assert.equal((await api('GET', '/auth/me', { token: storeManager })).status, 401);
  } finally {
    await User.updateOne({ _id: user._id }, { isActive: true });
  }
});

test('SEC-03 a cashier cannot reach admin, finance or reporting APIs', async () => {
  for (const path of ['/users', '/reports/profit-loss', '/reports/advanced/meta', '/accounts', '/expenses', '/audit-logs', '/purchases']) {
    const r = await api('GET', path, { token: cashier });
    assert.equal(r.status, 403, `${path} -> ${r.status}`);
  }
  const r = await api('POST', '/users', { token: cashier, body: { name: 'x', email: 'x@x.test', password: 'Password@123', role: 'admin' } });
  assert.equal(r.status, 403);
  // Settings are readable (receipts need the company name and GSTIN) but only administrators may change them.
  assert.equal((await api('PUT', '/settings', { token: cashier, body: { companyName: 'Hacked' } })).status, 403);
});

test('SEC-04 an admin cannot create a super admin, and nobody can change their own role', async () => {
  const { default: generateToken } = await import('../utils/generateToken.js');
  const adminUser = await User.findOne({ role: 'admin' });
  const plainAdmin = generateToken(adminUser);
  const r = await api('POST', '/users', { token: plainAdmin, body: { name: 'QA', email: `qa${Date.now()}@aurelia.test`, password: 'Password@123', role: 'super_admin' } });
  assert.equal(r.status, 403);
  const self = await api('PUT', `/users/${adminUser._id}`, { token: plainAdmin, body: { role: 'super_admin' } });
  assert.ok([400, 403].includes(self.status));
});

test('SEC-05 login is rate-limited against password guessing', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await api('POST', '/auth/login', { body: { email: 'nobody@aurelia.test', password: `wrong-${i}` } });
  assert.equal(last.status, 429, `after 12 failed logins got ${last.status}`);
});

test('SEC-06 login responses never include the password hash', async () => {
  const r = await api('GET', '/auth/me', { token: admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.password, undefined);
  const list = await api('GET', '/users', { token: admin });
  assert.ok(list.body.data.every((u) => u.password === undefined));
});

test('SEC-07 search boxes accept special characters instead of crashing', async () => {
  for (const [path, token] of [['/products', admin], ['/customers', cashier], ['/sales', cashier], ['/search', admin], ['/purchases', admin], ['/brands', admin], ['/users', admin]]) {
    for (const q of ['(', '[a-', '*', '(a+)+$']) {
      const key = path === '/search' ? 'q' : 'search';
      const r = await api('GET', `${path}?${key}=${encodeURIComponent(q)}`, { token });
      assert.equal(r.status, 200, `${path} search "${q}" -> ${r.status} ${JSON.stringify(r.body)}`);
    }
  }
});

test('SEC-08 creating a customer ignores balance, loyalty and credit fields from the request', async () => {
  const phone = `9${String(Date.now()).slice(-9)}`;
  const r = await api('POST', '/customers', { token: cashier, body: { name: 'QA Customer', phone, outstanding: -50000, loyaltyPoints: 99999, creditLimit: 1000000, loyaltyTier: 'platinum' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const c = await Customer.findById(r.body.data._id);
  assert.equal(c.outstanding, 0);
  assert.equal(c.loyaltyPoints, 0);
  assert.equal(c.creditLimit, 0, 'only administrators set credit limits');
  assert.equal(c.loyaltyTier, 'bronze');
});

test('SEC-09 NoSQL operator injection in login is neutralised', async () => {
  const r = await api('POST', '/auth/login', { body: { email: { $ne: null }, password: { $ne: null } } });
  assert.ok([400, 401, 429].includes(r.status), `got ${r.status}`);
  assert.equal(r.body?.token, undefined);
});

test('SEC-10 security headers are set', async () => {
  const res = await fetch(`${(await start())}/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('content-security-policy'));
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('SEC-11 changing a password signs out other sessions and rejects weak passwords', async () => {
  const email = `qa-pw-${Date.now()}@aurelia.test`;
  const user = await User.create({ name: 'QA Password', email, password: 'Start1234', role: 'cashier' });
  try {
    const { default: generateToken } = await import('../utils/generateToken.js');
    const oldToken = generateToken(user);
    await new Promise((r) => setTimeout(r, 1100)); // tokens carry whole-second timestamps
    const weak = await api('POST', '/auth/change-password', { token: oldToken, body: { currentPassword: 'Start1234', newPassword: 'short' } });
    assert.equal(weak.status, 400);
    const wrong = await api('POST', '/auth/change-password', { token: oldToken, body: { currentPassword: 'nope', newPassword: 'Better12345' } });
    assert.equal(wrong.status, 401);
    const ok = await api('POST', '/auth/change-password', { token: oldToken, body: { currentPassword: 'Start1234', newPassword: 'Better12345' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.ok(ok.body.token, 'a fresh token is returned');
    assert.equal((await api('GET', '/auth/me', { token: oldToken })).status, 401, 'old session revoked');
    assert.equal((await api('GET', '/auth/me', { token: ok.body.token })).status, 200, 'new session works');
  } finally {
    await User.deleteOne({ _id: user._id });
  }
});
