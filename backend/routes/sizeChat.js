const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { handleMessage, sanitizeState } = require('../utils/sizeChatEngine');

const router = express.Router();

// ---------------------------------------------------------------------------
// Dữ liệu cửa hàng dùng cho tư vấn (lưu tạm 60 giây để không truy vấn lại ở mỗi tin nhắn)
// ---------------------------------------------------------------------------
const CACHE_MS = 60 * 1000;
let cache = { at: 0, catalog: [], chart: [] };

async function loadShopData() {
  if (Date.now() - cache.at < CACHE_MS && cache.chart.length) return cache;

  const [products, variants, charts] = await Promise.all([
    db.query(
      `SELECT p.id, p.name, p.category_id, c.name AS category_name, p.price, p.old_price, p.image, p.is_featured
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.created_at DESC, p.id`
    ),
    db.query('SELECT product_id, size, color, stock FROM product_variants ORDER BY id'),
    db.query('SELECT * FROM size_charts ORDER BY chest_max, waist_max, hip_max, id'),
  ]);

  const byProduct = new Map();
  for (const v of variants.rows) {
    if (!byProduct.has(v.product_id)) byProduct.set(v.product_id, []);
    byProduct.get(v.product_id).push({ size: v.size, color: v.color, stock: Number(v.stock) || 0 });
  }
  const catalog = products.rows.map((p) => {
    const list = byProduct.get(p.id) || [];
    return {
      id: p.id,
      name: p.name,
      categoryId: p.category_id || '',
      categoryName: p.category_name || '',
      price: Number(p.price) || 0,
      oldPrice: Number(p.old_price) || 0,
      image: p.image,
      featured: Boolean(p.is_featured),
      sizes: [...new Set(list.map((v) => v.size))],
      colors: [...new Set(list.map((v) => v.color))],
      variants: list,
    };
  });
  const chart = charts.rows.map((r) => ({
    size: r.size_code,
    ranges: {
      height: [r.height_min, r.height_max],
      weight: [r.weight_min, r.weight_max],
      chest: [r.chest_min, r.chest_max],
      waist: [r.waist_min, r.waist_max],
      hip: [r.hip_min, r.hip_max],
    },
  }));
  cache = { at: Date.now(), catalog, chart };
  return cache;
}

// Đã đăng nhập (không bắt buộc) -> có thể dùng số đo đã lưu trong hồ sơ
function optionalUserId(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET).id;
  } catch {
    return null;
  }
}

// POST /api/size-chat
// Body: { message: string, state?: object }   state là trạng thái hội thoại do trình duyệt giữ
router.post('/size-chat', async (req, res) => {
  const message = String(req.body?.message ?? '').trim().slice(0, 500);
  if (!message) {
    return res.status(400).json({ success: false, message: 'Bạn chưa nhập tin nhắn.' });
  }

  try {
    const { catalog, chart } = await loadShopData();
    const userId = optionalUserId(req);
    const loadSaved = userId
      ? async () => {
          try {
            const r = await db.query('SELECT height, weight, chest, waist, hip FROM body_measurements WHERE user_id = $1', [userId]);
            return r.rows[0] || null;
          } catch {
            return null; // bảng body_measurements chưa tạo
          }
        }
      : null;

    const result = await handleMessage({ message, state: sanitizeState(req.body?.state), catalog, chart, loadSaved });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Lỗi chat tư vấn size:', error);
    res.status(500).json({ success: false, message: 'Trợ lý đang gặp sự cố, bạn thử lại sau ít phút nhé.' });
  }
});

module.exports = router;
