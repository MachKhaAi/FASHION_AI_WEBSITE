const { Pool } = require('pg');
require('dotenv').config();

// Khởi tạo pool kết nối PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

// Kiểm tra kết nối
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Lỗi kết nối cơ sở dữ liệu PostgreSQL:', err.stack);
  } else {
    console.log('✅ Kết nối Cơ sở dữ liệu PostgreSQL thành công!');
    release();
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};