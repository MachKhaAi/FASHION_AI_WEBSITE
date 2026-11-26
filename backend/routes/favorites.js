const express = require('express');
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

function validProductId(raw) {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 50 && raw.trim() === raw;
}

// Danh sách được lưu riêng theo user_id trong PostgreSQL, không tin user_id client gửi lên.
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT product_id FROM favorite_products WHERE user_id = $1 ORDER BY created_at DESC, product_id',
      [req.user.id]
    );
    res.json({ success: true, data: rows.map((row) => String(row.product_id)) });
  } catch (error) {
    console.error('Không thể tải sản phẩm yêu thích:', error);
    res.status(500).json({ success: false, message: 'Không tải được danh sách yêu thích. Kiểm tra bảng favorite_products.' });
  }
});

router.post('/:productId', async (req, res) => {
  const { productId } = req.params;
  if (!validProductId(productId)) {
    return res.status(400).json({ success: false, message: 'Mã sản phẩm không hợp lệ.' });
  }
  try {
    // Trả 404 nếu sản phẩm không tồn tại; ON CONFLICT bảo đảm bấm hai lần không nhân đôi.
    const found = await db.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (!found.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }
    await db.query(
      'INSERT INTO favorite_products (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING',
      [req.user.id, productId]
    );
    res.status(200).json({ success: true, data: { productId, isFavorite: true } });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(404).json({ success: false, message: 'Sản phẩm hoặc tài khoản không tồn tại.' });
    }
    console.error('Không thể thêm sản phẩm yêu thích:', error);
    res.status(500).json({ success: false, message: 'Không lưu được sản phẩm yêu thích.' });
  }
});

router.delete('/:productId', async (req, res) => {
  const { productId } = req.params;
  if (!validProductId(productId)) {
    return res.status(400).json({ success: false, message: 'Mã sản phẩm không hợp lệ.' });
  }
  try {
    await db.query('DELETE FROM favorite_products WHERE user_id = $1 AND product_id = $2', [req.user.id, productId]);
    res.json({ success: true, data: { productId, isFavorite: false } });
  } catch (error) {
    console.error('Không thể xóa sản phẩm yêu thích:', error);
    res.status(500).json({ success: false, message: 'Không xóa được sản phẩm yêu thích.' });
  }
});

module.exports = router;
