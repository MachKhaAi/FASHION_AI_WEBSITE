const express = require('express');
const jwt = require('jsonwebtoken');
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

// ---------- Tự tạo bảng đơn hàng nếu chưa có (không cần chạy SQL) ----------
let tablesReady = null;
function ensureTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS hqa_orders (
          id         TEXT PRIMARY KEY,
          user_id    INTEGER,
          customer   JSONB NOT NULL DEFAULT '{}',
          subtotal   INTEGER NOT NULL DEFAULT 0,
          shipping   INTEGER NOT NULL DEFAULT 0,
          status     TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await db.query(`
        CREATE TABLE IF NOT EXISTS hqa_order_items (
          id         SERIAL PRIMARY KEY,
          order_id   TEXT NOT NULL REFERENCES hqa_orders(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL,
          name       TEXT NOT NULL,
          price      INTEGER NOT NULL,
          image      TEXT NOT NULL DEFAULT '',
          qty        INTEGER NOT NULL,
          size       TEXT NOT NULL DEFAULT '',
          color      TEXT NOT NULL DEFAULT ''
        )`);
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

// ---------- Trạng thái đơn ----------
const LABELS = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã duyệt',
  shipping: 'Đang giao hàng',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};
// Từ trạng thái nào được chuyển sang trạng thái nào
const NEXT = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function shapeOrders(orderRows, itemRows) {
  const byOrder = new Map(orderRows.map((o) => [o.id, []]));
  for (const it of itemRows) {
    byOrder.get(it.order_id)?.push({
      productId: it.product_id,
      name: it.name,
      price: it.price,
      image: it.image,
      qty: it.qty,
      size: it.size,
      color: it.color,
    });
  }
  return orderRows.map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    status: LABELS[o.status] || o.status,
    statusCode: o.status,
    nextStatuses: NEXT[o.status] || [],
    customer: o.customer || {},
    userId: o.user_id,
    subtotal: o.subtotal,
    shipping: o.shipping,
    items: byOrder.get(o.id) || [],
  }));
}

async function loadOrders(whereSql, params) {
  const orders = (await db.query(`SELECT * FROM hqa_orders ${whereSql} ORDER BY created_at DESC LIMIT 200`, params)).rows;
  if (!orders.length) return [];
  const items = (
    await db.query('SELECT * FROM hqa_order_items WHERE order_id = ANY($1::text[]) ORDER BY id', [orders.map((o) => o.id)])
  ).rows;
  return shapeOrders(orders, items);
}

// Đọc token (nếu có) mà không bắt buộc đăng nhập
function readUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return null;
  }
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// Trả lại hàng vào kho (dùng khi hủy đơn hoặc khi đặt hàng lỗi giữa chừng)
async function restock(items) {
  for (const it of items) {
    await db.query(
      `UPDATE product_variants SET stock = stock + $4
       WHERE id = (SELECT id FROM product_variants WHERE product_id = $1 AND size = $2 AND color = $3 ORDER BY id LIMIT 1)`,
      [it.product_id, it.size, it.color, it.qty]
    );
  }
}

// ---------- Khách đặt hàng ----------
// POST /api/orders  body: { id?, customer: {...}, items: [{ productId, size, color, qty }] }
router.post('/orders', async (req, res) => {
  const list = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  if (!list.length) return res.status(400).json({ success: false, message: 'Giỏ hàng trống!' });

  const user = readUser(req);
  const customer = {};
  if (req.body.customer && typeof req.body.customer === 'object') {
    for (const [k, v] of Object.entries(req.body.customer).slice(0, 20)) customer[str(k, 40)] = str(v, 300);
  }
  const rawId = String(req.body.id || '');
  const id = /^HQA-\d{6,20}$/.test(rawId) ? rawId : `HQA-${Date.now()}`;

  const taken = []; // các dòng đã trừ kho (để hoàn lại nếu lỗi)
  try {
    await ensureTables();
    const lines = [];
    for (const raw of list) {
      const qty = Math.floor(Number(raw.qty));
      const productId = str(raw.productId, 100);
      const size = str(raw.size, 40);
      const color = str(raw.color, 40);
      if (!productId || !Number.isFinite(qty) || qty < 1 || qty > 99) {
        await restock(taken);
        return res.status(400).json({ success: false, message: 'Dữ liệu giỏ hàng không hợp lệ!' });
      }
      const p = (await db.query('SELECT id, name, price, image FROM products WHERE id = $1', [productId])).rows[0];
      if (!p) {
        await restock(taken);
        return res.status(400).json({ success: false, message: 'Có sản phẩm không còn bán!' });
      }
      // Trừ kho đúng 1 dòng biến thể (chỉ khi còn đủ hàng)
      const upd = await db.query(
        `UPDATE product_variants SET stock = stock - $4
         WHERE id = (SELECT id FROM product_variants WHERE product_id = $1 AND size = $2 AND color = $3 AND stock >= $4 ORDER BY id LIMIT 1)`,
        [productId, size, color, qty]
      );
      if (!upd.rowCount) {
        await restock(taken);
        return res.status(409).json({ success: false, message: `"${p.name}" (${size}, ${color}) không đủ số lượng trong kho!` });
      }
      taken.push({ product_id: productId, size, color, qty });
      lines.push({ product: p, qty, size, color });
    }

    const subtotal = lines.reduce((sum, l) => sum + Number(l.product.price) * l.qty, 0);
    const shipping = subtotal >= 600000 ? 0 : 30000;
    await db.query(
      'INSERT INTO hqa_orders (id, user_id, customer, subtotal, shipping, status) VALUES ($1,$2,$3::jsonb,$4,$5,$6)',
      [id, user?.id ?? null, JSON.stringify(customer), subtotal, shipping, 'pending']
    );
    for (const l of lines) {
      await db.query(
        'INSERT INTO hqa_order_items (order_id, product_id, name, price, image, qty, size, color) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, l.product.id, l.product.name, l.product.price, l.product.image || '', l.qty, l.size, l.color]
      );
    }
    res.status(201).json({ success: true, id });
  } catch (error) {
    console.error('Lỗi đặt hàng:', error.message);
    try {
      await restock(taken);
    } catch (e) {
      console.error('Không hoàn được kho:', e.message);
    }
    const dup = error.code === '23505';
    res.status(dup ? 409 : 500).json({ success: false, message: dup ? 'Mã đơn hàng bị trùng, vui lòng thử lại!' : 'Lỗi server' });
  }
});

// GET /api/orders/mine  -> đơn của khách đang đăng nhập (kèm trạng thái mới nhất)
router.get('/orders/mine', async (req, res) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Bạn chưa đăng nhập!' });
  try {
    await ensureTables();
    res.json({ success: true, data: await loadOrders('WHERE user_id = $1', [user.id]) });
  } catch (error) {
    console.error('Lỗi lấy đơn của tôi:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});


// PUT /api/orders/:id/cancel  -> khách tự hủy đơn của mình (chỉ khi đơn chưa giao)
router.put('/orders/:id/cancel', async (req, res) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Bạn chưa đăng nhập!' });
  try {
    await ensureTables();
    const order = (await db.query('SELECT status, user_id FROM hqa_orders WHERE id = $1', [req.params.id])).rows[0];
    if (!order || order.user_id == null || String(order.user_id) !== String(user.id)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng của bạn!' });
    }
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: order.status === 'cancelled' ? 'Đơn hàng đã được hủy trước đó.' : 'Đơn hàng đang giao hoặc đã hoàn thành nên không thể hủy. Vui lòng liên hệ cửa hàng.',
      });
    }
    // Chỉ hủy nếu trạng thái chưa bị đổi (tránh hoàn kho 2 lần)
    const upd = await db.query(
      "UPDATE hqa_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = $2",
      [req.params.id, order.status]
    );
    if (!upd.rowCount) return res.status(409).json({ success: false, message: 'Đơn hàng vừa được cập nhật, vui lòng tải lại!' });
    const items = (await db.query('SELECT product_id, size, color, qty FROM hqa_order_items WHERE order_id = $1', [req.params.id])).rows;
    await restock(items);
    res.json({ success: true });
  } catch (error) {
    console.error('Lỗi hủy đơn:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ---------- Quản trị ----------
router.get('/admin/orders', requireAdmin, async (req, res) => {
  try {
    await ensureTables();
    res.json({ success: true, data: await loadOrders('', []) });
  } catch (error) {
    console.error('Lỗi lấy đơn hàng:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PUT /api/admin/orders/:id/status  body: { status: 'confirmed' | 'shipping' | 'completed' | 'cancelled' }
router.put('/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const next = String(req.body.status || '');
  if (!LABELS[next]) return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ!' });
  try {
    await ensureTables();
    const cur = (await db.query('SELECT status FROM hqa_orders WHERE id = $1', [req.params.id])).rows[0];
    if (!cur) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
    if (!(NEXT[cur.status] || []).includes(next)) {
      return res.status(409).json({ success: false, message: `Không thể chuyển từ "${LABELS[cur.status]}" sang "${LABELS[next]}"!` });
    }
    // Chỉ cập nhật nếu trạng thái chưa bị ai đổi (tránh hoàn kho 2 lần)
    const upd = await db.query(
      'UPDATE hqa_orders SET status = $2, updated_at = NOW() WHERE id = $1 AND status = $3',
      [req.params.id, next, cur.status]
    );
    if (!upd.rowCount) return res.status(409).json({ success: false, message: 'Đơn hàng vừa được cập nhật, vui lòng tải lại!' });
    if (next === 'cancelled') {
      const items = (await db.query('SELECT product_id, size, color, qty FROM hqa_order_items WHERE order_id = $1', [req.params.id])).rows;
      await restock(items);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Lỗi cập nhật đơn hàng:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;