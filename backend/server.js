const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

// Quản trị: /api/admin/login, /api/admin/me
app.use('/api/admin', adminRoutes);

// Đăng ký / đăng nhập: /api/auth/register, /api/auth/login, /api/auth/me
app.use('/api/auth', authRoutes);
// Đường dẫn ngắn cho frontend đã viết sẵn: /api/login, /api/register, /api/me
app.use('/api', authRoutes);

// 1. API kiểm tra kết nối Database
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({
      success: true,
      message: 'Kết nối Database thành công!',
      time: result.rows[0].now
    });
  } catch (error) {
    console.error('Lỗi kết nối DB:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi kết nối cơ sở dữ liệu' });
  }
});

// 2. API lấy danh sách sản phẩm từ PostgreSQL
app.get('/api/products', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Lỗi truy vấn:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// 3. API AI Size Advisor (Tư vấn size thông minh)
app.post('/api/size-advisor', async (req, res) => {
  const { height, weight, chest, waist, hip } = req.body;
  try {
    const queryText = `
      SELECT size_code FROM size_charts
      WHERE $1 BETWEEN height_min AND height_max
        AND $2 BETWEEN weight_min AND weight_max
      LIMIT 1;
    `;
    const result = await db.query(queryText, [height, weight]);

    if (result.rows.length > 0) {
      res.json({ success: true, recommended_size: result.rows[0].size_code });
    } else {
      res.json({ success: true, recommended_size: 'M', message: 'Gợi ý size tiêu chuẩn' });
    }
  } catch (error) {
    console.error('Lỗi tính size AI:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server khi tính toán size' });
  }
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy trên cổng ${PORT}`);
});