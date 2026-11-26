const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'only-for-auth-session-unit-test';
const authFile = require.resolve('../utils/authTokens');

test('token customer/admin hợp lệ khi backend chưa restart', () => {
  const { signAuthToken, verifyAuthToken } = require(authFile);
  for (const role of ['customer', 'admin']) {
    const token = signAuthToken({ id: 10, email: 'demo@example.com', role }, '1h');
    assert.equal(verifyAuthToken(token).role, role);
  }
});

test('token của backend cũ không còn hợp lệ sau restart', () => {
  const old = require(authFile).signAuthToken({ id: 2, email: 'user@example.com', role: 'customer' }, '1h');
  delete require.cache[authFile]; // mô phỏng backend khởi động lại với cùng JWT_SECRET
  const fresh = require(authFile);
  assert.throws(() => fresh.verifyAuthToken(old), /Phiên đăng nhập thuộc lần chạy server trước/);
  assert.equal(fresh.verifyAuthToken(fresh.signAuthToken({ id: 2, role: 'customer' }, '1h')).id, 2);
});

test('token không có mã phiên server bị từ chối', () => {
  const legacyToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
  assert.throws(() => require(authFile).verifyAuthToken(legacyToken), /Phiên đăng nhập thuộc lần chạy server trước/);
});
