const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 10;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  // Nhận tên ở nhiều dạng: full_name, fullName hoặc name
  const full_name = (req.body.full_name || req.body.fullName || req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const phone = (req.body.phone || '').trim() || null;

  if (!full_name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu!' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, message: 'Email không hợp lệ!' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự!' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email này đã được đăng ký!' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // role luôn là 'customer' khi tự đăng ký, không nhận từ client
    const result = await db.query(
      `INSERT INTO users (full_name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, 'customer')
       RETURNING id, full_name, email, phone, role`,
      [full_name, email, password_hash, phone]
    );

    const user = result.rows[0];
    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công!',
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    // 23505 = vi phạm UNIQUE (hai người đăng ký cùng email cùng lúc)
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Email này đã được đăng ký!' });
    }
    console.error('Lỗi đăng ký:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu!' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    // Dùng chung một thông báo để không lộ email nào đã tồn tại
    const invalid = { success: false, message: 'Email hoặc mật khẩu không chính xác!' };
    if (!user) return res.status(401).json(invalid);

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json(invalid);

    res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Lỗi đăng nhập:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// GET /api/auth/me  (cần token) - lấy lại thông tin người dùng khi tải lại trang
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, full_name, email, phone, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tài khoản không còn tồn tại!' });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Lỗi lấy thông tin:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;