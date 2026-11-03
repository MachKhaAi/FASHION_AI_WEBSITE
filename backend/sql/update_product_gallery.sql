BEGIN;

CREATE TABLE IF NOT EXISTS product_images (
  id         SERIAL PRIMARY KEY,
  product_id VARCHAR(50) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color      VARCHAR(50),
  url        TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images (product_id, sort_order);

DELETE FROM product_images WHERE product_id IN ('sp1', 'sp2', 'sp3', 'sp4', 'sp5', 'sp6', 'sp7', 'sp8', 'sp9', 'sp10', 'sp11', 'sp12', 'sp13', 'sp14', 'sp15', 'sp16', 'sp17', 'sp18', 'sp19', 'sp20', 'sp21', 'sp22', 'sp23', 'sp24', 'sp25', 'sp26');

INSERT INTO product_images (product_id, color, url, sort_order) VALUES
  ('sp1', 'Trắng', '/images/products/sp1.jpg', 0),
  ('sp1', 'Xanh navy', '/images/products/sp1-1.jpg', 1),
  ('sp2', 'Kem', '/images/products/sp2.jpg', 0),
  ('sp2', 'Hồng', '/images/products/sp2-1.jpg', 1),
  ('sp3', 'Nâu', '/images/products/sp3.jpg', 0),
  ('sp3', 'Đen', '/images/products/sp3-1.jpg', 1),
  ('sp4', 'Hoa nhí', '/images/products/sp4.jpg', 0),
  ('sp4', 'Trắng', '/images/products/sp4-1.jpg', 1),
  ('sp5', NULL, '/images/products/sp5.jpg', 0),
  ('sp5', 'Trắng', '/images/products/sp5-1.jpg', 1),
  ('sp5', 'Be', '/images/products/sp5-2.jpg', 2),
  ('sp6', 'Xám', '/images/products/sp6.jpg', 0),
  ('sp6', 'Nâu', '/images/products/sp6-1.jpg', 1),
  ('sp7', 'Đen', '/images/products/sp7.jpg', 0),
  ('sp8', 'Nâu', '/images/products/sp8.jpg', 0),
  ('sp9', NULL, '/images/products/sp9.jpg', 0),
  ('sp10', 'Trắng', '/images/products/sp10.jpg', 0),
  ('sp10', 'Hồng', '/images/products/sp10-1.jpg', 1),
  ('sp10', 'Đen', '/images/products/sp10-2.jpg', 2),
  ('sp11', 'Đen', '/images/products/sp11.jpg', 0),
  ('sp11', 'Be xám', '/images/products/sp11-1.jpg', 1),
  ('sp12', 'Trắng', '/images/products/sp12.jpg', 0),
  ('sp12', 'Hồng', '/images/products/sp12-1.jpg', 1),
  ('sp12', 'Kem', '/images/products/sp12-2.jpg', 2),
  ('sp13', 'Kem', '/images/products/sp13.jpg', 0),
  ('sp13', 'Hồng', '/images/products/sp13-1.jpg', 1),
  ('sp14', 'Đen', '/images/products/sp14.jpg', 0),
  ('sp14', 'Nâu', '/images/products/sp14-1.jpg', 1),
  ('sp14', 'Hồng phấn', '/images/products/sp14-2.jpg', 2),
  ('sp15', 'Trắng', '/images/products/sp15.jpg', 0),
  ('sp15', 'Đen', '/images/products/sp15-1.jpg', 1),
  ('sp16', 'Kem', '/images/products/sp16.jpg', 0),
  ('sp17', 'Xanh nhạt', '/images/products/sp17.jpg', 0),
  ('sp18', 'Xanh', '/images/products/sp18.jpg', 0),
  ('sp18', 'Xanh đen', '/images/products/sp18-1.jpg', 1),
  ('sp18', 'Trắng', '/images/products/sp18-2.jpg', 2),
  ('sp19', 'Hồng', '/images/products/sp19.jpg', 0),
  ('sp19', 'Trắng', '/images/products/sp19-1.jpg', 1),
  ('sp19', 'Đen', '/images/products/sp19-2.jpg', 2),
  ('sp20', 'Be', '/images/products/sp20.jpg', 0),
  ('sp20', 'Xanh navy', '/images/products/sp20-1.jpg', 1),
  ('sp20', 'Nâu', '/images/products/sp20-2.jpg', 2),
  ('sp21', 'Xám', '/images/products/sp21.jpg', 0),
  ('sp22', 'Hồng', '/images/products/sp22.jpg', 0),
  ('sp22', 'Hồng đào', '/images/products/sp22-1.jpg', 1),
  ('sp22', 'Xanh ngọc', '/images/products/sp22-2.jpg', 2),
  ('sp23', 'Đen', '/images/products/sp23.jpg', 0),
  ('sp23', 'Trắng', '/images/products/sp23-1.jpg', 1),
  ('sp23', 'Be', '/images/products/sp23-2.jpg', 2),
  ('sp24', 'Kem', '/images/products/sp24.jpg', 0),
  ('sp24', 'Be', '/images/products/sp24-1.jpg', 1),
  ('sp24', 'Nâu xám', '/images/products/sp24-2.jpg', 2),
  ('sp25', 'Xanh đậm', '/images/products/sp25.jpg', 0),
  ('sp25', 'Xanh', '/images/products/sp25-1.jpg', 1),
  ('sp25', 'Xanh nhạt', '/images/products/sp25-2.jpg', 2),
  ('sp26', 'Đen', '/images/products/sp26.jpg', 0);

UPDATE products p
SET image = i.url
FROM product_images i
WHERE i.product_id = p.id AND i.sort_order = 0;

CREATE TEMP TABLE new_colors (product_id varchar(50), color varchar(50)) ON COMMIT DROP;
INSERT INTO new_colors (product_id, color) VALUES
  ('sp1', 'Trắng'),
  ('sp1', 'Xanh navy'),
  ('sp2', 'Kem'),
  ('sp2', 'Hồng'),
  ('sp3', 'Nâu'),
  ('sp3', 'Đen'),
  ('sp4', 'Hoa nhí'),
  ('sp4', 'Trắng'),
  ('sp5', 'Trắng'),
  ('sp5', 'Be'),
  ('sp6', 'Xám'),
  ('sp6', 'Nâu'),
  ('sp7', 'Đen'),
  ('sp8', 'Nâu'),
  ('sp9', 'Đen'),
  ('sp9', 'Kem'),
  ('sp10', 'Trắng'),
  ('sp10', 'Hồng'),
  ('sp10', 'Đen'),
  ('sp11', 'Đen'),
  ('sp11', 'Be xám'),
  ('sp12', 'Trắng'),
  ('sp12', 'Hồng'),
  ('sp12', 'Kem'),
  ('sp13', 'Kem'),
  ('sp13', 'Hồng'),
  ('sp14', 'Đen'),
  ('sp14', 'Nâu'),
  ('sp14', 'Hồng phấn'),
  ('sp15', 'Trắng'),
  ('sp15', 'Đen'),
  ('sp16', 'Kem'),
  ('sp17', 'Xanh nhạt'),
  ('sp18', 'Xanh'),
  ('sp18', 'Xanh đen'),
  ('sp18', 'Trắng'),
  ('sp19', 'Hồng'),
  ('sp19', 'Trắng'),
  ('sp19', 'Đen'),
  ('sp20', 'Be'),
  ('sp20', 'Xanh navy'),
  ('sp20', 'Nâu'),
  ('sp21', 'Xám'),
  ('sp22', 'Hồng'),
  ('sp22', 'Hồng đào'),
  ('sp22', 'Xanh ngọc'),
  ('sp23', 'Đen'),
  ('sp23', 'Trắng'),
  ('sp23', 'Be'),
  ('sp24', 'Kem'),
  ('sp24', 'Be'),
  ('sp24', 'Nâu xám'),
  ('sp25', 'Xanh đậm'),
  ('sp25', 'Xanh'),
  ('sp25', 'Xanh nhạt'),
  ('sp26', 'Đen');

CREATE TEMP TABLE merged_stock ON COMMIT DROP AS
SELECT v.product_id, v.size, SUM(v.stock)::int AS stock
FROM product_variants v
WHERE v.product_id IN (SELECT DISTINCT product_id FROM new_colors)
GROUP BY v.product_id, v.size;

DELETE FROM product_variants
WHERE product_id IN (SELECT DISTINCT product_id FROM new_colors);

INSERT INTO product_variants (product_id, size, color, stock)
SELECT m.product_id, m.size, c.color, m.stock / c.n
FROM merged_stock m
JOIN (
  SELECT product_id, color, COUNT(*) OVER (PARTITION BY product_id) AS n
  FROM new_colors
) c ON c.product_id = m.product_id;

COMMIT;
