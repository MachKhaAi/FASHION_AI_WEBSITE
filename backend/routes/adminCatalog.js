const express = require('express');
const db = require('../config/db');

// Tên file middleware của bạn có thể là authMiddleware.js hoặc auth.js
let mw;
try {
  mw = require('../middleware/authMiddleware');
} catch (e) {
  mw = require('../middleware/auth');
}
const { requireAdmin } = mw;
if (typeof requireAdmin !== 'function') {
  throw new Error('Không tìm thấy requireAdmin trong middleware (authMiddleware.js / auth.js)');
}

const router = express.Router();

// ---------- Tiện ích ----------
const toInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const toList = (v, def) => {
  const list = Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))] : [];
  return list.length ? list : def;
};

// { "Kem": "/images/..." } -> chỉ giữ cặp có màu và URL không rỗng
function cleanColorImages(value) {
  const out = {};
  if (value && typeof value === 'object') {
    for (const [color, url] of Object.entries(value)) {
      const c = String(color).trim();
      const u = String(url || '').trim().slice(0, 500);
      if (c && u) out[c] = u;
    }
  }
  return out;
}

function clean(body) {
  const name = String(body.name || '').trim().slice(0, 200);
  const categoryId = String(body.categoryId || '').trim();
  if (!name || !categoryId) return null;
  return {
    name,
    categoryId,
    price: toInt(body.price),
    oldPrice: toInt(body.oldPrice),
    image: String(body.image || '').trim(),
    description: String(body.description || '').trim(),
    featured: Boolean(body.featured),
    sizes: toList(body.sizes, ['S', 'M', 'L']),
    colors: toList(body.colors, ['Kem']),
    stock: toInt(body.stock),
    colorImages: cleanColorImages(body.colorImages),
  };
}

// Chia đều tổng tồn kho cho các biến thể (phần dư dồn vào biến thể đầu tiên)
function spread(total, count) {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? total - base * count : 0));
}

// Đồng bộ bảng product_variants theo size x màu mà admin chọn
async function syncVariants(id, sizes, colors, totalStock) {
  const wanted = [];
  for (const size of sizes) for (const color of colors) wanted.push({ size, color });

  const existing = (await db.query('SELECT id, size, color, stock FROM product_variants WHERE product_id = $1', [id])).rows;
  const key = (v) => `${v.size}|${v.color}`;
  const wantedKeys = new Set(wanted.map(key));

  // Xóa biến thể không còn dùng
  for (const v of existing) {
    if (!wantedKeys.has(key(v))) await db.query('DELETE FROM product_variants WHERE id = $1', [v.id]);
  }
  // Thêm biến thể mới (tồn kho 0, sẽ chia lại bên dưới nếu cần)
  const have = new Set(existing.map(key));
  for (const v of wanted) {
    if (!have.has(key(v))) {
      await db.query('INSERT INTO product_variants (product_id, size, color, stock) VALUES ($1,$2,$3,0)', [id, v.size, v.color]);
    }
  }
  // Chỉ chia lại tồn kho khi tổng thay đổi
  const now = (await db.query('SELECT id, stock FROM product_variants WHERE product_id = $1 ORDER BY id', [id])).rows;
  const current = now.reduce((sum, v) => sum + Number(v.stock), 0);
  if (current !== totalStock && now.length) {
    const parts = spread(totalStock, now.length);
    for (let i = 0; i < now.length; i++) {
      await db.query('UPDATE product_variants SET stock = $2 WHERE id = $1', [now[i].id, parts[i]]);
    }
  }
}


// Ảnh theo màu (bảng product_images). Mỗi màu có 1 ảnh chính do admin nhập; ảnh phụ của màu đó (nếu có) giữ nguyên.
async function syncColorImages(id, colors, colorImages) {
  try {
    // Xóa ảnh của màu không còn dùng
    await db.query('DELETE FROM product_images WHERE product_id = $1 AND color IS NOT NULL AND NOT (color = ANY($2::text[]))', [id, colors]);
    for (const color of colors) {
      const url = colorImages[color];
      if (!url) continue;
      const first = await db.query(
        'SELECT id FROM product_images WHERE product_id = $1 AND color = $2 ORDER BY sort_order, id LIMIT 1',
        [id, color]
      );
      if (first.rows.length) {
        await db.query('UPDATE product_images SET url = $2 WHERE id = $1', [first.rows[0].id, url]);
      } else {
        await db.query('INSERT INTO product_images (product_id, color, url, sort_order) VALUES ($1,$2,$3,0)', [id, color, url]);
      }
    }
  } catch (error) {
    if (error.code !== '42P01') throw error; // bảng product_images chưa có thì bỏ qua
  }
}

// Chạy 1 câu lệnh xóa "tùy chọn": bảng/cột không tồn tại thì bỏ qua
async function optionalDelete(sql, params) {
  try {
    await db.query(sql, params);
  } catch (error) {
    if (error.code !== '42P01' && error.code !== '42703') throw error;
  }
}

// ---------- Sản phẩm ----------
router.post('/products', requireAdmin, async (req, res) => {
  const p = clean(req.body);
  if (!p) return res.status(400).json({ success: false, message: 'Thiếu tên hoặc danh mục sản phẩm!' });
  const id = String(req.body.id || `sp-${Date.now()}`).trim();
  try {
    await db.query(
      `INSERT INTO products (id, name, category_id, price, old_price, image, description, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, p.name, p.categoryId, p.price, p.oldPrice, p.image, p.description, p.featured]
    );
    try {
      await syncVariants(id, p.sizes, p.colors, p.stock);
      await syncColorImages(id, p.colors, p.colorImages);
    } catch (error) {
      await optionalDelete('DELETE FROM product_images WHERE product_id = $1', [id]).catch(() => {});
      await db.query('DELETE FROM product_variants WHERE product_id = $1', [id]).catch(() => {});
      await db.query('DELETE FROM products WHERE id = $1', [id]).catch(() => {});
      throw error;
    }
    res.status(201).json({ success: true, id });
  } catch (error) {
    console.error('Lỗi thêm sản phẩm:', error.message);
    const bad = error.code === '23503' || error.code === '23505';
    res.status(bad ? 400 : 500).json({
      success: false,
      message: bad ? 'Danh mục không tồn tại hoặc mã sản phẩm bị trùng!' : 'Lỗi server',
    });
  }
});

router.put('/products/:id', requireAdmin, async (req, res) => {
  const p = clean(req.body);
  if (!p) return res.status(400).json({ success: false, message: 'Thiếu tên hoặc danh mục sản phẩm!' });
  const id = req.params.id;
  try {
    const result = await db.query(
      `UPDATE products SET name=$2, category_id=$3, price=$4, old_price=$5, image=$6, description=$7, is_featured=$8
       WHERE id=$1`,
      [id, p.name, p.categoryId, p.price, p.oldPrice, p.image, p.description, p.featured]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });
    await syncVariants(id, p.sizes, p.colors, p.stock);
    await syncColorImages(id, p.colors, p.colorImages);
    res.json({ success: true });
  } catch (error) {
    console.error('Lỗi sửa sản phẩm:', error.message);
    if (error.code === '23503') {
      return res.status(409).json({ success: false, message: 'Biến thể đang được dùng (giỏ hàng/đơn hàng), không thể bỏ size/màu này!' });
    }
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

router.delete('/products/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    await optionalDelete('DELETE FROM cart_item WHERE product_id = $1', [id]);
    await optionalDelete('DELETE FROM product_images WHERE product_id = $1', [id]);
    await db.query('DELETE FROM product_variants WHERE product_id = $1', [id]);
    await db.query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Lỗi xóa sản phẩm:', error.message);
    if (error.code === '23503') {
      return res.status(409).json({ success: false, message: 'Sản phẩm đang được dùng ở bảng khác (giỏ hàng/đơn hàng), chưa xóa được!' });
    }
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ---------- Danh mục ----------
router.post('/categories', requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  if (!name) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên danh mục!' });
  const id = String(req.body.id || `dm-${Date.now()}`).trim();
  const icon = String(req.body.icon || '✿').slice(0, 8);
  try {
    await db.query('INSERT INTO categories (id, name, icon) VALUES ($1,$2,$3)', [id, name, icon]);
    res.status(201).json({ success: true, id });
  } catch (error) {
    console.error('Lỗi thêm danh mục:', error.message);
    res.status(error.code === '23505' ? 400 : 500).json({ success: false, message: 'Không thêm được danh mục!' });
  }
});

router.delete('/categories/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ success: false, message: 'Danh mục còn sản phẩm, không thể xóa!' });
    }
    console.error('Lỗi xóa danh mục:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ---------- Bảng size ----------
const FIELDS = ['height_min', 'height_max', 'weight_min', 'weight_max', 'chest_min', 'chest_max', 'waist_min', 'waist_max', 'hip_min', 'hip_max'];
const KEYS = ['heightMin', 'heightMax', 'weightMin', 'weightMax', 'chestMin', 'chestMax', 'waistMin', 'waistMax', 'hipMin', 'hipMax'];
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// PUT /api/admin/size-charts  body: { rows: [{ size, heightMin, heightMax, ... }] }
router.put('/size-charts', requireAdmin, async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ success: false, message: 'Bảng size trống!' });
  try {
    for (const r of rows) {
      const code = String(r.size || '').trim();
      if (!code) continue;
      const values = KEYS.map((k) => num(r[k]));
      const set = FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const upd = await db.query(`UPDATE size_charts SET ${set} WHERE size_code = $1`, [code, ...values]);
      if (!upd.rowCount) {
        const cols = ['size_code', ...FIELDS].join(', ');
        const marks = ['$1', ...FIELDS.map((f, i) => `$${i + 2}`)].join(', ');
        await db.query(`INSERT INTO size_charts (${cols}) VALUES (${marks})`, [code, ...values]);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Lỗi lưu bảng size:', error.message);
    res.status(500).json({ success: false, message: 'Không lưu được bảng size!' });
  }
});

module.exports = router;