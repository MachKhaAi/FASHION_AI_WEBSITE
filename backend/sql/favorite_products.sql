-- CHẠY MỘT LẦN trên database PostgreSQL của website (pgAdmin Query Tool hoặc psql).
-- Kiểu khóa chính users.id khác nhau giữa bản triển khai (INTEGER/VARCHAR/UUID).
-- Lấy chính xác kiểu dữ liệu thật trong database để quan hệ khóa ngoại hợp lệ.
DO $$
DECLARE
  user_id_type TEXT;
  product_id_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO user_id_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.users'::regclass
     AND a.attname = 'id' AND NOT a.attisdropped;
  SELECT format_type(a.atttypid, a.atttypmod) INTO product_id_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.products'::regclass
     AND a.attname = 'id' AND NOT a.attisdropped;

  IF user_id_type IS NULL OR product_id_type IS NULL THEN
    RAISE EXCEPTION 'Cần tạo bảng users và products trước khi tạo favorite_products';
  END IF;

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.favorite_products (
      user_id %s NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      product_id %s NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT favorite_products_pkey PRIMARY KEY (user_id, product_id)
    )', user_id_type, product_id_type);
END $$;

CREATE INDEX IF NOT EXISTS idx_favorite_products_user_created
  ON public.favorite_products (user_id, created_at DESC);
