const express = require('express');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Toàn bộ API quản lý bảng size chỉ dành cho admin
router.use(requireAdmin);

// Các nhóm số đo trong bảng size_charts (cột dạng <key>_min / <key>_max, đều là INTEGER)
const FIELDS = [
  { key: 'height', label: 'Chiều cao', min: 100, max: 230 },
  { key: 'weight', label: 'Cân nặng', min: 20, max: 250 },
  { key: 'chest', label: 'Vòng ngực', min: 50, max: 160 },
  { key: 'waist', label: 'Vòng eo', min: 40, max: 160 },
  { key: 'hip', label: 'Vòng hông', min: 50, max: 170 },
];
const RANGE_COLS = FIELDS.flatMap((f) => [`${f.key}_min`, `${f.key}_max`]);
const ALL_COLS = ['size_code', ...RANGE_COLS];
const SELECT_COLS = `id, ${ALL_COLS.join(', ')}`;

// Kiểm tra dữ liệu gửi lên. Trả về { error } hoặc { values }.
function validate(body) {
  body = body || {};
  const size_code = String(body.size_code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 \-]{0,9}$/.test(size_code)) {
    return { error: 'Mã size chỉ gồm chữ, số, khoảng trắng hoặc gạch ngang, tối đa 10 ký tự (ví dụ: S, M, XL, XXL)!' };
  }

  const values = { size_code };
  for (const f of FIELDS) {
    for (const edge of ['min', 'max']) {
      const col = `${f.key}_${edge}`;
      const label = `${f.label} ${edge === 'min' ? 'tối thiểu' : 'tối đa'}`;
      const raw = body[col];
      if (raw === undefined || raw === null || String(raw).trim() === '') {
        return { error: `Vui lòng nhập ${label}!` };
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < f.min || n > f.max) {
        return { error: `${label} phải là số nguyên trong khoảng ${f.min}–${f.max}!` };
      }
      values[col] = n;
    }
    if (values[`${f.key}_min`] > values[`${f.key}_max`]) {
      return { error: `${f.label}: giá trị tối thiểu không được lớn hơn giá trị tối đa!` };
    }
  }
  return { values };
}

const isValidId = (id) => /^\d{1,9}$/.test(String(id));

async function sizeCodeExists(size_code, excludeId = null) {
  const r = await db.query(
    'SELECT id FROM size_charts WHERE UPPER(size_code) = $1 AND ($2::int IS NULL OR id <> $2::int) LIMIT 1',
    [size_code, excludeId]
  );
  return r.rows.length > 0;
}

// GET /api/admin/size-charts - danh sách bảng size
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`SELECT ${SELECT_COLS} FROM size_charts ORDER BY height_min, weight_min, id`);
    res.json({ success: true, sizeCharts: result.rows });
  } catch (error) {
    console.error('Lỗi lấy bảng size:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// POST /api/admin/size-charts - thêm một size mới
router.post('/', async (req, res) => {
  const { error, values } = validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error });

  try {
    if (await sizeCodeExists(values.size_code)) {
      return res.status(409).json({ success: false, message: `Size ${values.size_code} đã tồn tại!` });
    }
    const params = ALL_COLS.map((c) => values[c]);
    const placeholders = params.map((_, i) => `$${i + 1}`);
    const result = await db.query(
      `INSERT INTO size_charts (${ALL_COLS.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING ${SELECT_COLS}`,
      params
    );
    res.status(201).json({ success: true, message: 'Đã thêm size mới!', sizeChart: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      // Trùng khóa chính: thường do sequence id bị lệch sau khi khôi phục từ file backup
      return res.status(409).json({
        success: false,
        message: 'Không thêm được do trùng khóa. Hãy kiểm tra sequence size_charts_id_seq (xem hướng dẫn).',
      });
    }
    console.error('Lỗi thêm size:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PUT /api/admin/size-charts/:id - sửa một size
router.put('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Mã bảng size không hợp lệ!' });
  }
  const id = Number(req.params.id);
  const { error, values } = validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error });

  try {
    if (await sizeCodeExists(values.size_code, id)) {
      return res.status(409).json({ success: false, message: `Size ${values.size_code} đã tồn tại!` });
    }
    const params = ALL_COLS.map((c) => values[c]);
    const sets = ALL_COLS.map((c, i) => `${c} = $${i + 1}`);
    params.push(id);
    const result = await db.query(
      `UPDATE size_charts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${SELECT_COLS}`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy size này!' });
    }
    res.json({ success: true, message: 'Đã cập nhật size!', sizeChart: result.rows[0] });
  } catch (err) {
    console.error('Lỗi sửa size:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// DELETE /api/admin/size-charts/:id - xóa một size
router.delete('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Mã bảng size không hợp lệ!' });
  }
  try {
    const result = await db.query('DELETE FROM size_charts WHERE id = $1 RETURNING id, size_code', [
      Number(req.params.id),
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy size này!' });
    }
    res.json({ success: true, message: `Đã xóa size ${result.rows[0].size_code}!` });
  } catch (err) {
    console.error('Lỗi xóa size:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;