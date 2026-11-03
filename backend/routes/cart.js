const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth);

async function getCartData(userId) {
  const sql = `
    SELECT 
      ci.id AS cart_item_id, ci.product_id, ci.size, ci.color, ci.quantity,
      ci.is_ai_recommended, ci.ai_fit_note,
      p.name AS product_name, p.price, p.old_price, p.image,
      COALESCE(pv.stock, 0) AS stock
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    LEFT JOIN product_variants pv 
      ON pv.product_id = ci.product_id AND pv.size = ci.size AND pv.color = ci.color
    WHERE ci.user_id = $1
    ORDER BY ci.created_at DESC, ci.id DESC
  `;
  const result = await db.query(sql, [String(userId)]);
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

    const existingRes = await db.query(
      `SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2 AND size = $3 AND color = $4`,
      [userId, productId, size, color]
    );

    if (existingRes.rows.length > 0) {
      const newQty = Number(existingRes.rows[0].quantity) + addQty;
      if (newQty > stock) return res.status(400).json({ success: false, message: `Kho chỉ còn ${stock} sản phẩm!` });
      await db.query(
        `UPDATE cart_items SET quantity = $1, is_ai_recommended = COALESCE($2, is_ai_recommended), ai_fit_note = COALESCE($3, ai_fit_note), updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [newQty, isAiRecommended, aiFitNote, existingRes.rows[0].id]
      );
    } else {
      if (addQty > stock) return res.status(400).json({ success: false, message: `Vượt quá tồn kho (còn ${stock})!` });
      await db.query(
        `INSERT INTO cart_items (user_id, product_id, size, color, quantity, is_ai_recommended, ai_fit_note) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, productId, size, color, addQty, isAiRecommended, aiFitNote]
      );
    }
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

    if (newQty <= 0) {
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