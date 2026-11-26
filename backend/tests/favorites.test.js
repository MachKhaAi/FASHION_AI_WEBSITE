const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.JWT_SECRET = 'test-only-favorites-secret';
const { signAuthToken } = require('../utils/authTokens');

const products = new Set(['sp4', 'sp10']);
const favorites = new Map();
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async (sql, args = []) => {
    const userId = String(args[0]);
    if (sql.startsWith('SELECT product_id FROM favorite_products')) {
      return { rows: (favorites.get(userId) || []).map(product_id => ({ product_id })) };
    }
    if (sql.startsWith('SELECT id FROM products')) {
      return { rows: products.has(args[0]) ? [{ id: args[0] }] : [] };
    }
    if (sql.startsWith('INSERT INTO favorite_products')) {
      const current = favorites.get(userId) || [];
      if (!current.includes(args[1])) current.unshift(args[1]);
      favorites.set(userId, current);
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM favorite_products')) {
      favorites.set(userId, (favorites.get(userId) || []).filter(id => id !== args[1]));
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  } },
};
const router = require('../routes/favorites');
const app = express();
app.use(express.json());
app.use('/api/favorites', router);

function auth(id, role = 'customer') {
  return { Authorization: `Bearer ${signAuthToken({ id, role, email: `${id}@example.com` }, '1h')}` };
}

test('Favorites API: chỉ đúng khách hàng được đọc/thêm/xóa; chống trùng và kiểm tra sản phẩm', async (t) => {
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/favorites`;
  const req = async (path = '', method = 'GET', headers = {}) => {
    const response = await fetch(base + path, { method, headers });
    return { status: response.status, data: await response.json() };
  };

  await t.test('Không có token / admin không truy cập được', async () => {
    assert.equal((await req()).status, 401);
    assert.equal((await req('', 'GET', auth(1, 'admin'))).status, 403);
    assert.equal((await req('/sp4', 'POST', auth(1, 'admin'))).status, 403);
  });

  await t.test('Mỗi tài khoản có danh sách riêng và thêm lặp không nhân đôi', async () => {
    assert.equal((await req('/sp4', 'POST', auth(10))).status, 200);
    assert.equal((await req('/sp4', 'POST', auth(10))).status, 200);
    assert.deepEqual((await req('', 'GET', auth(10))).data.data, ['sp4']);
    assert.deepEqual((await req('', 'GET', auth(11))).data.data, []);
    assert.equal((await req('/sp10', 'POST', auth(11))).status, 200);
    assert.deepEqual((await req('', 'GET', auth(10))).data.data, ['sp4']);
    assert.deepEqual((await req('', 'GET', auth(11))).data.data, ['sp10']);
  });

  await t.test('Từ chối sản phẩm không tồn tại / mã không hợp lệ', async () => {
    assert.equal((await req('/invalid-product', 'POST', auth(10))).status, 404);
    assert.equal((await req('/' + 'a'.repeat(51), 'POST', auth(10))).status, 400);
    assert.deepEqual((await req('', 'GET', auth(10))).data.data, ['sp4']);
  });

  await t.test('Xóa không ảnh hưởng tới tài khoản khác; xóa lặp an toàn', async () => {
    assert.equal((await req('/sp4', 'DELETE', auth(11))).status, 200);
    assert.deepEqual((await req('', 'GET', auth(10))).data.data, ['sp4']);
    assert.equal((await req('/sp4', 'DELETE', auth(10))).status, 200);
    assert.equal((await req('/sp4', 'DELETE', auth(10))).status, 200);
    assert.deepEqual((await req('', 'GET', auth(10))).data.data, []);
    assert.deepEqual((await req('', 'GET', auth(11))).data.data, ['sp10']);
  });
});
