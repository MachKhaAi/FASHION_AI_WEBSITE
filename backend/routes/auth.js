const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

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

// ---------------------------------------------------------------------------
// Số đo cơ thể (bảng body_measurements)
// height, chest, waist, hip là INTEGER; weight là NUMERIC(5,2)
// ---------------------------------------------------------------------------
const MEASURE_RANGES = {
  height: [100, 230],
  weight: [20, 250],
  chest: [50, 160],
  waist: [40, 160],
  hip: [50, 170],
};
const MEASURE_LABELS = {
  height: 'Chiều cao',
  weight: 'Cân nặng',
  chest: 'Vòng ngực',
  waist: 'Vòng eo',
  hip: 'Vòng hông',
};
const INTEGER_MEASURES = ['height', 'chest', 'waist', 'hip'];

// NUMERIC của Postgres trả về dạng chuỗi nên đổi lại thành số cho frontend
const num = (v) => (v === null || v === undefined ? null : Number(v));

function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    address: user.address || '',
    height: num(user.height),
    weight: num(user.weight),
    chest: num(user.chest),
    waist: num(user.waist),
    hip: num(user.hip),
  };
}

// Lấy người dùng kèm số đo (LEFT JOIN vì có người chưa có dòng trong body_measurements)
async function getFullUser(id) {
  const result = await db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.address, u.role,
            bm.height, bm.weight, bm.chest, bm.waist, bm.hip
     FROM users u
     LEFT JOIN body_measurements bm ON bm.user_id = u.id
     WHERE u.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
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
       RETURNING id, full_name, email, phone, address, role`,
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

    // Lấy kèm số đo để frontend có đủ dữ liệu ngay sau khi đăng nhập
    const full = (await getFullUser(user.id)) || user;

    res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      token: signToken(user),
      user: publicUser(full),
    });
  } catch (error) {
    console.error('Lỗi đăng nhập:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// GET /api/auth/me (cần token) - lấy lại thông tin người dùng, địa chỉ và số đo
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await getFullUser(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Tài khoản không còn tồn tại!' });
    }
    res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error('Lỗi lấy thông tin (GET /me):', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PUT /api/auth/profile (cần token) - cập nhật họ tên, SĐT, địa chỉ và số đo cơ thể
// Chỉ cập nhật những trường mà frontend có gửi lên; trường không gửi được giữ nguyên.
// Gửi chuỗi rỗng hoặc null để xóa giá trị của trường đó.
router.put('/profile', requireAuth, async (req, res) => {
  const body = req.body || {};

  // ---------- 1. Kiểm tra dữ liệu gửi lên ----------
  const userSets = [];
  const userValues = [];
  const addUser = (col, val) => {
    userValues.push(val);
    userSets.push(`${col} = $${userValues.length}`);
  };

  if (body.full_name !== undefined) {
    const full_name = String(body.full_name).trim();
    if (full_name.length < 2) {
      return res.status(400).json({ success: false, message: 'Họ tên phải có ít nhất 2 ký tự!' });
    }
    addUser('full_name', full_name);
  }

  if (body.phone !== undefined) {
    const phone = String(body.phone || '').replace(/\s/g, '');
    if (phone && !/^0\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0!' });
    }
    addUser('phone', phone || null);
  }

  if (body.address !== undefined) {
    const address = String(body.address || '').trim();
    if (address.length > 500) {
      return res.status(400).json({ success: false, message: 'Địa chỉ quá dài (tối đa 500 ký tự)!' });
    }
    addUser('address', address || null);
  }

  const measures = {}; // chỉ chứa số đo mà frontend có gửi
  for (const [col, [min, max]] of Object.entries(MEASURE_RANGES)) {
    if (body[col] === undefined) continue;
    if (body[col] === '' || body[col] === null) {
      measures[col] = null;
      continue;
    }
    const n = Number(body[col]);
    if (!Number.isFinite(n) || n < min || n > max) {
      return res.status(400).json({
        success: false,
        message: `${MEASURE_LABELS[col]} phải nằm trong khoảng ${min}–${max}!`,
      });
    }
    // Cột INTEGER không nhận số lẻ (vd 85.5) nên phải làm tròn; weight giữ 1 chữ số thập phân
    measures[col] = INTEGER_MEASURES.includes(col) ? Math.round(n) : Math.round(n * 10) / 10;
  }

  const measureCols = Object.keys(measures);
  if (userSets.length === 0 && measureCols.length === 0) {
    return res.status(400).json({ success: false, message: 'Không có thông tin nào để cập nhật!' });
  }

  try {
    // ---------- 2. Cập nhật bảng users (họ tên, SĐT, địa chỉ) ----------
    if (userSets.length > 0) {
      userValues.push(req.user.id);
      const r = await db.query(
        `UPDATE users SET ${userSets.join(', ')} WHERE id = $${userValues.length} RETURNING id`,
        userValues
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Tài khoản không còn tồn tại!' });
      }
    }

    // ---------- 3. Upsert số đo vào body_measurements ----------
    if (measureCols.length > 0) {
      const cols = ['user_id', ...measureCols];
      const params = [req.user.id, ...measureCols.map((c) => measures[c])];
      const placeholders = params.map((_, i) => `$${i + 1}`);
      const updates = measureCols.map((c) => `${c} = EXCLUDED.${c}`);
      await db.query(
        `INSERT INTO body_measurements (${cols.join(', ')}, updated_at)
         VALUES (${placeholders.join(', ')}, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id)
         DO UPDATE SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP`,
        params
      );
    }

    // ---------- 4. Đọc lại toàn bộ dữ liệu mới nhất để trả về ----------
    const user = await getFullUser(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Tài khoản không còn tồn tại!' });
    }
    res.json({
      success: true,
      message: 'Cập nhật thông tin và số đo thành công!',
      user: publicUser(user),
    });
  } catch (error) {
    // In chi tiết lỗi ra terminal, server vẫn tiếp tục chạy
    console.error('--- LỖI KHI CẬP NHẬT (PUT /profile) ---');
    console.error(error);
    res.status(500).json({ success: false, message: 'Lỗi Database. Vui lòng kiểm tra log Terminal.' });
  }
});

// PUT /api/auth/password (cần token) - đổi mật khẩu
router.put('/password', requireAuth, async (req, res) => {
  const current_password = req.body.current_password || '';
  const new_password = req.body.new_password || '';

  if (!current_password || !new_password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới!' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự!' });
  }

  try {
    const result = await db.query('SELECT id, password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: 'Tài khoản không còn tồn tại!' });
    }

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng!' });
    }

    const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, user.id]);
    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (error) {
    console.error('Lỗi đổi mật khẩu:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;