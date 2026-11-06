const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminSizeChartRoutes = require('./routes/adminSizeCharts');
const adminCatalogRoutes = require('./routes/adminCatalog');
const orderRoutes = require('./routes/orders');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const sizeAdvisorRoutes = require('./routes/sizeAdvisor');
const sizeChatRoutes = require('./routes/sizeChat');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

// Sản phẩm: /api/products, /api/products/filters, /api/products/:id,
//           /api/products/:id/size-chart, /api/categories, /api/size-charts
app.use('/api', productRoutes);

// Quản lý bảng size (admin): /api/admin/size-charts
// PHẢI đặt trước '/api/admin' bên dưới để không bị route admin chung chặn
app.use('/api/admin/size-charts', adminSizeChartRoutes);

// Quản trị: /api/admin/login, /api/admin/me
app.use('/api/admin', adminRoutes);
// Quản trị sản phẩm / danh mục: /api/admin/products, /api/admin/categories
app.use('/api/admin', adminCatalogRoutes);
// Đơn hàng: POST /api/orders, GET /api/orders/mine, /api/admin/orders (admin)
app.use('/api', orderRoutes);

// Đăng ký / đăng nhập: /api/auth/register, /api/auth/login, /api/auth/me
app.use('/api/auth', authRoutes);
// Đường dẫn ngắn cho frontend đã viết sẵn: /api/login, /api/register, /api/me
app.use('/api', authRoutes);
// Giỏ hàng
app.use('/api/cart', cartRoutes);

// AI Size Advisor (tư vấn size dựa trên bảng size_charts): POST /api/size-advisor
app.use('/api', sizeAdvisorRoutes);

// Chat tư vấn size bằng tiếng Việt: POST /api/size-chat
app.use('/api', sizeChatRoutes);

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

// Khởi động server
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy trên cổng ${PORT}`);
});