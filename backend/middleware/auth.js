const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Bắt buộc đăng nhập: đọc token từ header "Authorization: Bearer <token>"
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Bạn chưa đăng nhập!' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn!' });
  }
}

// Giới hạn theo vai trò ghi trong token, ví dụ: requireRole('admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này!' });
    }
    next();
  };
}

// Chỉ cho admin: kiểm tra token VÀ đọc lại vai trò hiện tại trong database,
// nên khi bạn hạ quyền một tài khoản thì token cũ của họ mất tác dụng ngay.
function requireAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    try {
      const result = await db.query(
        'SELECT id, full_name, email, role FROM users WHERE id = $1',
        [req.user.id]
      );
      const user = result.rows[0];
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền quản trị!' });
      }
      req.admin = user;
      next();
    } catch (error) {
      console.error('Lỗi kiểm tra quyền admin:', error.message);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  });
}

module.exports = { requireAuth, requireRole, requireAdmin };