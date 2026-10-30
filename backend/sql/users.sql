-- Bảng người dùng (chạy trong database fashion_ai_db)
-- Nếu bảng users đã tồn tại, dùng phần ALTER ở cuối thay vì CREATE.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'customer',
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Nếu bảng users của bạn đã có sẵn nhưng thiếu cột, bỏ comment các dòng dưới:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'customer';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
-- ALTER TABLE users ALTER COLUMN password_hash TYPE VARCHAR(255);

-- LƯU Ý: các tài khoản cũ đang lưu mật khẩu dạng chữ thường (plaintext) sẽ không
-- đăng nhập được nữa vì hệ thống giờ dùng bcrypt. Hãy xóa chúng và đăng ký lại:
-- DELETE FROM users;