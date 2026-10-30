const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Chặn dò mật khẩu: sai 5 lần (cùng IP + email) thì khóa 15 phút.
// Lưu trong bộ nhớ, tắt server là xóa; đủ dùng cho bản đầu.
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map();

function lockKey(req, email) {
  return `${req.ip}|${email}`;
}
function isLocked(key) {
  const entry = fails.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > LOCK_MS) {
    fails.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILS;
}
function registerFail(key) {
  const entry = fails.get(key);
  if (!entry || Date.now() - entry.first > LOCK_MS) {
    fails.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

// POST /api/admin/login
// Admin KHÔNG có đăng ký: tài khoản được cấp trực tiếp trong database (role = 'admin').
router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu!' });
  }

  const key = lockKey(req, email);
  if (isLocked(key)) {
    return res.status(429).json({
      success: false,
      message: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút!',
    });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    // Email không tồn tại, sai mật khẩu, hoặc không phải admin đều trả cùng một thông báo
    const valid = user && user.role === 'admin' && (await bcrypt.compare(password, user.password_hash));
    if (!valid) {
      registerFail(key);
      return res.status(401).json({
        success: false,
        message: 'Tài khoản hoặc mật khẩu quản trị không chính xác!',
      });
    }

    fails.delete(key);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      success: true,
      message: 'Đăng nhập quản trị thành công!',
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Lỗi đăng nhập admin:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// GET /api/admin/me  (chỉ admin) - frontend dùng để khôi phục phiên khi tải lại trang
router.get('/me', requireAdmin, (req, res) => {
  res.json({ success: true, user: req.admin });
});

module.exports = router;