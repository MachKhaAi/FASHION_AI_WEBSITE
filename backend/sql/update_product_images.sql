-- Cập nhật ảnh sản phẩm cho khớp với tên (sp1 → sp26).
-- Ảnh minh họa nằm trong frontend/public/images/products/spN.svg
-- Chạy sau khi đã nhập fashion_ai_db.sql và seed_products.sql:
--
--   psql -U postgres -d fashion_ai_db -f backend/sql/update_product_images.sql

UPDATE products
SET image = '/images/products/' || id || '.svg'
WHERE id IN (
  'sp1', 'sp2', 'sp3', 'sp4', 'sp5', 'sp6',
  'sp7', 'sp8', 'sp9', 'sp10', 'sp11', 'sp12',
  'sp13', 'sp14', 'sp15', 'sp16', 'sp17', 'sp18',
  'sp19', 'sp20', 'sp21', 'sp22', 'sp23', 'sp24',
  'sp25', 'sp26'
);
