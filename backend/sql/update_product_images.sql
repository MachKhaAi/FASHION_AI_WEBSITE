-- Gắn ảnh cho 26 sản phẩm (sp1 -> sp26).
-- Ảnh nằm trong frontend/public/images/products/ (spN.jpg).
-- Chạy được nhiều lần.
--
--   psql -U postgres -d fashion_ai_db -f backend/sql/update_product_images.sql

BEGIN;

UPDATE products AS p
SET image = v.image
FROM (VALUES
  ('sp1', '/images/products/sp1.jpg'),
  ('sp2', '/images/products/sp2.jpg'),
  ('sp3', '/images/products/sp3.jpg'),
  ('sp4', '/images/products/sp4.jpg'),
  ('sp5', '/images/products/sp5.jpg'),
  ('sp6', '/images/products/sp6.jpg'),
  ('sp7', '/images/products/sp7.jpg'),
  ('sp8', '/images/products/sp8.jpg'),
  ('sp9', '/images/products/sp9.jpg'),
  ('sp10', '/images/products/sp10.jpg'),
  ('sp11', '/images/products/sp11.jpg'),
  ('sp12', '/images/products/sp12.jpg'),
  ('sp13', '/images/products/sp13.jpg'),
  ('sp14', '/images/products/sp14.jpg'),
  ('sp15', '/images/products/sp15.jpg'),
  ('sp16', '/images/products/sp16.jpg'),
  ('sp17', '/images/products/sp17.jpg'),
  ('sp18', '/images/products/sp18.jpg'),
  ('sp19', '/images/products/sp19.jpg'),
  ('sp20', '/images/products/sp20.jpg'),
  ('sp21', '/images/products/sp21.jpg'),
  ('sp22', '/images/products/sp22.jpg'),
  ('sp23', '/images/products/sp23.jpg'),
  ('sp24', '/images/products/sp24.jpg'),
  ('sp25', '/images/products/sp25.jpg'),
  ('sp26', '/images/products/sp26.jpg')
) AS v(id, image)
WHERE p.id = v.id;

-- Ảnh sp25 là chân váy jean dáng dài: sửa mô tả cho khớp
UPDATE products
SET description = 'Chân váy jean dáng dài tông xanh denim, dễ phối cùng sneaker hoặc sandal.'
WHERE id = 'sp25';

COMMIT;
