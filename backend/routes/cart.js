const express = require('express');
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

// Ảnh hiển thị trong giỏ: ảnh đúng màu khách đã chọn (bảng product_images), nếu không có thì dùng ảnh chính
const IMAGE_BY_COLOR = `COALESCE(
        (SELECT pi.url FROM product_images pi
         WHERE pi.product_id = ci.product_id AND pi.color = ci.color
         ORDER BY pi.sort_order, pi.id LIMIT 1),
        p.image)`;

function cartSql(imageExpr) {
  return `
    SELECT 
      ci.id AS cart_item_id, ci.product_id, ci.size, ci.color, ci.quantity,
      ci.is_ai_recommended, ci.ai_fit_note,
      p.name AS product_name, p.price, p.old_price, ${imageExpr} AS image,
      COALESCE(pv.stock, 0) AS stock
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    LEFT JOIN product_variants pv 
      ON pv.product_id = ci.product_id AND pv.size = ci.size AND pv.color = ci.color
    WHERE ci.user_id = $1
    ORDER BY ci.created_at DESC, ci.id DESC
  `;
}

async function getCartData(userId) {
  let result;
  try {
    result = await db.query(cartSql(IMAGE_BY_COLOR), [String(userId)]);
  } catch (error) {
    if (error.code !== '42P01') throw error; // bảng product_images chưa tạo -> dùng ảnh chính
    result = await db.query(cartSql('p.image'), [String(userId)]);
  }
  const items = result.rows.map((row) => {
    const price = Number(row.price) || 0;
    const quantity = Number(row.quantity) || 0;
    return {
      cartItemId: row.cart_item_id,
      productId: row.product_id,
      name: row.product_name,
      image: row.image,
      size: row.size,
      color: row.color,
      price,
      oldPrice: Number(row.old_price) || 0,
      quantity,
      stock: Number(row.stock) || 0,
      lineTotal: price * quantity,
      isAiRecommended: Boolean(row.is_ai_recommended),
      aiFitNote: row.ai_fit_note || null,
    };
  });
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return { items, totalItems: items.length, totalQuantity, totalAmount };
}

router.get('/', async (req, res) => {
  try {
    const cart = await getCartData(req.user.id);
    res.json({ success: true, data: cart });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server khi tải giỏ hàng' });
  }
});

router.post('/items', async (req, res) => {
  try {
    const userId = String(req.user.id);
    const { productId, size, color, quantity = 1, isAiRecommended = false, aiFitNote = null } = req.body;
    const addQty = Number(quantity);

    if (!Number.isSafeInteger(addQty) || addQty < 1) {
      return res.status(400).json({ success: false, message: 'Số lượng không hợp lệ!' });
    }
    if (!productId || !size || !color) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn đầy đủ sản phẩm, size và màu!' });
    }

    const variantRes = await db.query(
      `SELECT stock FROM product_variants WHERE product_id = $1 AND size = $2 AND color = $3`,
      [productId, size, color]
    );
    if (!variantRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Phiên bản sản phẩm không tồn tại!' });
    }
    const stock = Number(variantRes.rows[0].stock) || 0;
    if (stock <= 0) return res.status(400).json({ success: false, message: 'Sản phẩm này đã hết hàng!' });

    if (addQty > stock) return res.status(400).json({ success: false, message: `Vượt quá tồn kho (còn ${stock})!` });
    const saved = await db.query(
      `INSERT INTO cart_items (user_id, product_id, size, color, quantity, is_ai_recommended, ai_fit_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, product_id, size, color) DO UPDATE SET
         quantity = cart_items.quantity + EXCLUDED.quantity,
         is_ai_recommended = COALESCE(EXCLUDED.is_ai_recommended, cart_items.is_ai_recommended),
         ai_fit_note = COALESCE(EXCLUDED.ai_fit_note, cart_items.ai_fit_note),
         updated_at = CURRENT_TIMESTAMP
       WHERE cart_items.quantity + EXCLUDED.quantity <= $8 RETURNING id`,
      [userId, productId, size, color, addQty, isAiRecommended, aiFitNote, stock]
    );
    if (!saved.rowCount) return res.status(400).json({ success: false, message: `Kho chỉ còn ${stock} sản phẩm!` });
    const cart = await getCartData(userId);
    res.json({ success: true, message: 'Đã thêm vào giỏ hàng!', data: cart });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

router.put('/items/:cartItemId', async (req, res) => {
  try {
    const userId = String(req.user.id);
    const cartItemId = Number(req.params.cartItemId);
    const newQty = Number(req.body.quantity);

    if (!Number.isSafeInteger(cartItemId) || cartItemId < 1 || !Number.isSafeInteger(newQty) || newQty < 0) {
      return res.status(400).json({ success: false, message: 'Số lượng hoặc mã giỏ hàng không hợp lệ!' });
    }
    if (newQty === 0) {
      await db.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [cartItemId, userId]);
      return res.json({ success: true, data: await getCartData(userId) });
    }

    const itemRes = await db.query(
      `SELECT ci.id, pv.stock FROM cart_items ci LEFT JOIN product_variants pv ON pv.product_id = ci.product_id AND pv.size = ci.size AND pv.color = ci.color WHERE ci.id = $1 AND ci.user_id = $2`,
      [cartItemId, userId]
    );
    if (!itemRes.rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });

    const stock = Number(itemRes.rows[0].stock) || 0;
    if (newQty > stock) return res.status(400).json({ success: false, message: `Kho chỉ còn tối đa ${stock} sản phẩm!` });

    await db.query(`UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`, [newQty, cartItemId, userId]);
    res.json({ success: true, data: await getCartData(userId) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

router.delete('/items/:cartItemId', async (req, res) => {
  try {
    await db.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [Number(req.params.cartItemId), String(req.user.id)]);
    res.json({ success: true, data: await getCartData(req.user.id) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

router.delete('/', async (req, res) => {
  try {
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [String(req.user.id)]);
    res.json({ success: true, data: await getCartData(req.user.id) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;