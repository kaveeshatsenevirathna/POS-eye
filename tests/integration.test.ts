import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('tenant boundaries, roles, concurrent checkout, immutable sales and refund accounting', { skip: process.env.RUN_POS_INTEGRATION !== 'true' }, async () => {
  process.env.ALLOW_SIGNUP = 'true';
  process.env.APP_ORIGIN = 'http://127.0.0.1:5173';
  const { app } = await import('../apps/api/src/app');
  const { db } = await import('../apps/api/src/db');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const endpoint = 'http://127.0.0.1:' + address.port + '/api/';
  async function request(path: string, method = 'GET', body?: unknown, session = '', businessId = '') {
    const response = await fetch(endpoint + path, {
      method, headers: { origin: process.env.APP_ORIGIN!, ...(session && { cookie: session }), ...(businessId && { 'x-business-id': businessId }), ...(body !== undefined && { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json().catch(() => undefined), cookie: response.headers.getSetCookie().at(-1)?.split(';')[0] ?? '' };
  }
  const key = randomUUID().slice(0, 10);
  const password = 'Integration-password!';
  async function setup(suffix: string, staff?: { name: string; email: string; password: string }) {
    const response = await request('setup', 'POST', {
      admin: { email: suffix + '-' + key + '@omnipos.test', name: 'Admin ' + suffix, password },
      ...(staff && { staff }),
      business: { name: 'Integration ' + suffix, type: 'restaurant', currency: 'USD', timezone: 'UTC' },
      settings: { taxRate: 10, staffDiscountLimit: 5 },
    });
    assert.equal(response.status, 201);
    return { id: response.data.businessId as string, cookie: response.cookie };
  }
  try {
    assert.equal((await request('products')).status, 401);
    assert.equal((await request('login', 'POST', { email: 'unknown@omnipos.test', password })).status, 401);
    const initialStaff = { email: 'initial-staff-' + key + '@omnipos.test', name: 'Initial Staff', password };
    const a = await setup('a', initialStaff);
    const b = await setup('b');
    const adminLogin = await request('login', 'POST', { email: 'a-' + key + '@omnipos.test', password });
    const staffLogin = await request('login', 'POST', { email: initialStaff.email, password: initialStaff.password });
    assert.equal(adminLogin.status, 200);
    assert.equal(staffLogin.status, 200);
    const staffIdentity = await request('me', 'GET', undefined, staffLogin.cookie);
    assert.equal(staffIdentity.data.memberships[0].role, 'STAFF');
    assert.equal(staffIdentity.data.memberships[0].business.id, a.id);
    assert.equal((await request('employees', 'GET', undefined, staffLogin.cookie, a.id)).status, 403);
    assert.equal((await request('products', 'GET', undefined, a.cookie, b.id)).status, 403);
    const productData = { name: 'Almond tart', price: '10.00', cost: '4.00' };
    const product = await request('products/new', 'PUT', productData, a.cookie, a.id);
    assert.equal(product.status, 200);
    assert.equal((await request('products/' + product.data.id, 'PUT', { ...productData, price: '20' }, b.cookie, b.id)).status, 404);
    assert.equal((await request('inventory', 'POST', { productId: product.data.id, delta: '1', reason: 'Receiving' }, a.cookie, a.id)).status, 204);
    const cashierEmail = 'cashier-' + key + '@omnipos.test';
    assert.equal((await request('employees', 'POST', { email: cashierEmail, name: 'Cashier', password, role: 'STAFF' }, a.cookie, a.id)).status, 201);
    const login = await request('login', 'POST', { email: cashierEmail, password });
    assert.equal(login.status, 200);
    assert(login.cookie);
    assert.equal((await request('employees', 'GET', undefined, login.cookie, a.id)).status, 403);
    const lines = [{ productId: product.data.id, quantity: '1' }];
    assert.equal((await request('quote', 'POST', { lines, discount: 6 }, login.cookie, a.id)).status, 403);
    const payload = { requestKey: randomUUID(), lines, payments: [{ method: 'CASH', amount: '11.00', tendered: '20.00' }] };
    const rival = { ...payload, requestKey: randomUUID() };
    const [first, second] = await Promise.all([request('checkout', 'POST', payload, login.cookie, a.id), request('checkout', 'POST', rival, a.cookie, a.id)]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const winner = first.status === 200 ? first : second;
    const retry = await request('checkout', 'POST', first.status === 200 ? payload : rival, first.status === 200 ? login.cookie : a.cookie, a.id);
    assert.equal(retry.data.id, winner.data.id);
    assert.equal((await request('products/' + product.data.id, 'PUT', { ...productData, price: '20' }, a.cookie, a.id)).status, 200);
    const sales = await request('sales', 'GET', undefined, a.cookie, a.id);
    assert.equal(sales.data.length, 1);
    assert.equal(sales.data[0].items[0].price, '10');
    assert.equal((await request('products', 'GET', undefined, a.cookie, a.id)).data[0].stock, '0');
    const path = 'report?start=' + new Date(Date.now() - 86400000).toISOString() + '&end=' + new Date(Date.now() + 86400000).toISOString();
    const before = (await request(path, 'GET', undefined, a.cookie, a.id)).data;
    assert.equal(before.revenue, '10');
    assert.equal(before.grossProfit, '6');
    const refundPath = 'sales/' + winner.data.id + '/refund';
    assert.equal((await request(refundPath, 'POST', { reason: 'Returned', restocked: true }, a.cookie, a.id)).status, 201);
    assert.equal((await request(refundPath, 'POST', { reason: 'Duplicate', restocked: true }, a.cookie, a.id)).status, 409);
    assert.equal((await request(path, 'GET', undefined, a.cookie, a.id)).data.revenue, '0');
    assert.equal((await request('products', 'GET', undefined, a.cookie, a.id)).data[0].stock, '1');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.$disconnect();
  }
});


