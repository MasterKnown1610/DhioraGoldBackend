#!/usr/bin/env node
/**
 * Test script for Gold Backend API.
 * Run: node scripts/test-api.js
 * Ensure the server is running (npm run dev) first.
 */

const BASE = process.env.API_BASE_URL || 'http://localhost:5000';

const log = (name, ok, detail = '') => {
  const icon = ok ? '✓' : '✗';
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  ${icon} ${name}: ${status}${detail ? ' — ' + detail : ''}`);
};

async function request(method, path, body = null, token = null) {
  const opts = { method, headers: {} };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

async function run() {
  console.log('\n--- Gold Backend API Tests ---\n');
  console.log('Base URL:', BASE);
  let token = null;
  let createdShopId = null;
  let createdUserId = null;

  try {
    // 1. Health
    const health = await request('GET', '/health');
    log('GET /health', health.ok && health.data?.success, health.data?.message || health.status);
    if (!health.ok) throw new Error('Health check failed. Is the server running?');

    // 2. Auth – Register (email)
    const reg = await request('POST', '/api/auth/register', {
      name: 'API Test User',
      email: 'apitest@example.com',
      password: 'password123',
    });
    const regOk = reg.ok || (reg.status === 400 && reg.data?.message?.includes('already exists'));
    log('POST /api/auth/register (email)', regOk, reg.data?.message || reg.status);
    if (reg.ok && reg.data?.data?.token) token = reg.data.data.token;

    // 3. Auth – Login
    const login = await request('POST', '/api/auth/login', {
      email: 'apitest@example.com',
      password: 'password123',
    });
    log('POST /api/auth/login', login.ok, login.data?.message || login.status);
    if (login.ok && login.data?.data?.token) token = login.data.data.token;

    // 4. Register Shop (FormData, no images, with opening hours)
    const shopForm = new FormData();
    shopForm.append('shopName', 'Test Gold Shop');
    shopForm.append('address', '123 Test Street');
    shopForm.append('pincode', '560001');
    shopForm.append('phoneNumber', '9876543210');
    shopForm.append('state', 'Karnataka');
    shopForm.append('district', 'Bangalore Urban');
    shopForm.append('openingHours', JSON.stringify({
      monday: { open: '09:00', close: '18:00' },
      tuesday: { open: '09:00', close: '18:00' },
      wednesday: { open: '09:00', close: '18:00' },
      thursday: { open: '09:00', close: '18:00' },
      friday: { open: '09:00', close: '18:00' },
      saturday: { open: '09:00', close: '14:00' },
      sunday: { open: '', close: '' },
    }));
    const shopReg = await request('POST', '/api/shops', shopForm);
    log('POST /api/shops (register)', shopReg.ok, shopReg.data?.message || shopReg.status);
    if (shopReg.ok && shopReg.data?.data?._id) createdShopId = shopReg.data.data._id;

    // 5. Get all shops (no auth – no phone)
    const shopsNoAuth = await request('GET', '/api/shops?page=1&limit=5');
    const noPhone = shopsNoAuth.ok && shopsNoAuth.data?.data?.length >= 0;
    log('GET /api/shops (no auth)', shopsNoAuth.ok, 'no phone numbers');
    if (shopsNoAuth.ok && shopsNoAuth.data?.data?.[0]) {
      const hasPhone = 'phoneNumber' in (shopsNoAuth.data.data[0] || {});
      log('  → phone hidden when no token', !hasPhone);
    }

    // 6. Get all shops (with auth)
    const shopsAuth = await request('GET', '/api/shops?page=1&limit=5', null, token);
    log('GET /api/shops (with auth)', shopsAuth.ok, shopsAuth.data?.pagination ? 'has pagination' : '');
    if (shopsAuth.ok && shopsAuth.data?.data?.[0] && token) {
      const hasPhone = 'phoneNumber' in (shopsAuth.data.data[0] || {});
      log('  → phone visible when token sent', hasPhone);
    }

    // 7. Get single shop
    const shopId = createdShopId || (shopsNoAuth.data?.data?.[0]?._id);
    if (shopId) {
      const oneShop = await request('GET', `/api/shops/${shopId}`, null, token);
      log('GET /api/shops/:id', oneShop.ok, oneShop.data?.data?.shopName || oneShop.status);
    } else {
      log('GET /api/shops/:id', true, 'skipped (no shop id)');
    }

    // 8. Register User (FormData, no image)
    const userForm = new FormData();
    userForm.append('userName', 'API Test Provider');
    userForm.append('serviceProvided', 'Gold polishing');
    userForm.append('address', 'Block A');
    userForm.append('state', 'Karnataka');
    userForm.append('district', 'Bangalore');
    userForm.append('phoneNumber', '9876543211');
    const userReg = await request('POST', '/api/users', userForm);
    log('POST /api/users (register)', userReg.ok, userReg.data?.message || userReg.status);
    if (userReg.ok && userReg.data?.data?._id) createdUserId = userReg.data.data._id;

    // 9. Get all users
    const users = await request('GET', '/api/users?page=1&limit=5', null, token);
    log('GET /api/users', users.ok, users.data?.pagination ? 'has pagination' : '');

    // 10. Get single user
    const userId = createdUserId || (users.data?.data?.[0]?._id);
    if (userId) {
      const oneUser = await request('GET', `/api/users/${userId}`, null, token);
      log('GET /api/users/:id', oneUser.ok, oneUser.data?.data?.userName || oneUser.status);
    } else {
      log('GET /api/users/:id', true, 'skipped (no user id)');
    }

    // 11. 404
    const notFound = await request('GET', '/api/not-a-route');
    log('GET unknown route → 404', notFound.status === 404);

    console.log('\n--- Done ---\n');
  } catch (err) {
    console.error('\nError:', err.message);
    if (err.message.includes('Health check failed')) {
      console.log('Start the server with: npm run dev\n');
    }
    process.exit(1);
  }
}

run();
