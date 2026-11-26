const express = require('express');
const { verifyAuthToken } = require('../utils/authTokens');
const db = require('../config/db');
const advisor = require('../utils/sizeAdvisor');

const router = express.Router();

const FIELDS = [
  { key: 'chest', label: 'Vòng ngực', unit: 'cm', min: 50, max: 160, weight: 3 },
  { key: 'waist', label: 'Vòng eo', unit: 'cm', min: 40, max: 160, weight: 3 },
  { key: 'hip', label: 'Vòng hông', unit: 'cm', min: 50, max: 170, weight: 3 },
  { key: 'height', label: 'Chiều cao', unit: 'cm', min: 100, max: 230, weight: 1 },
  { key: 'weight', label: 'Cân nặng', unit: 'kg', min: 20, max: 250, weight: 1 },
];

function optionalUserId(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return verifyAuthToken(header.slice(7)).id;
  } catch {
    return null;
  }
}

// Khoảng cách từ giá trị đến khoảng [lo, hi]; nằm trong khoảng thì bằng 0
function distance(value, lo, hi) {
  if (value < lo) return lo - value;
  if (value > hi) return value - hi;
  return 0;
}

// POST /api/size-advisor
// Body: { height, weight, chest, waist, hip, use_saved_measurements? }
router.post('/size-advisor', async (req, res) => {
  const body = req.body || {};

  // ---- 1. Đọc và kiểm tra số đo gửi lên ----
  const input = {};
  for (const f of FIELDS) {
    const raw = body[f.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < f.min || n > f.max) {
      return res.status(400).json({
        success: false,
        message: `${f.label} phải nằm trong khoảng ${f.min}–${f.max} ${f.unit}!`,
      });
    }
    input[f.key] = n;
  }

  try {
    // ---- 2. Điền số đo còn thiếu từ hồ sơ đã lưu (nếu đã đăng nhập) ----
    let usedSaved = false;
    const userId = body.use_saved_measurements === false ? null : optionalUserId(req);
    if (userId) {
      const saved = await db.query(
        'SELECT height, weight, chest, waist, hip FROM body_measurements WHERE user_id = $1',
        [userId]
      );
      const row = saved.rows[0];
      if (row) {
        for (const f of FIELDS) {
          if (input[f.key] === undefined && row[f.key] !== null && row[f.key] !== undefined && Number.isFinite(Number(row[f.key])) && Number(row[f.key]) >= f.min && Number(row[f.key]) <= f.max) {
            input[f.key] = Number(row[f.key]);
            usedSaved = true;
          }
        }
      }
    }

    if (Object.keys(input).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập ít nhất một số đo (hoặc lưu số đo trong hồ sơ cá nhân) để được tư vấn size!',
      });
    }

    // ---- 3. Lấy bảng size từ CSDL ----
    const chart = await db.query(
      `SELECT id, size_code,
              height_min, height_max, weight_min, weight_max,
              chest_min, chest_max, waist_min, waist_max, hip_min, hip_max
       FROM size_charts
       ORDER BY chest_max, waist_max, hip_max, id`
    );
    if (chart.rows.length === 0) {
      return res.json({
        success: true,
        recommended_size: null,
        message: 'Cửa hàng chưa có bảng size để tư vấn.',
        used_saved_measurements: usedSaved,
      });
    }

    // Chỉ xét các size khớp TẤT CẢ số đo hiện có. Không tính khoảng cách/gần đúng.
    const rows = chart.rows.map((r) => ({
      size: r.size_code,
      ranges: Object.fromEntries(FIELDS.map((f) => [f.key, [r[`${f.key}_min`], r[`${f.key}_max`]]])),
    }));
    const sizes = rows.map((r) => r.size);
    const result = advisor.recommend({ measurements: input, product: { sizes }, chart: rows });
    const base = { success: true, recommended_size: null, used_saved_measurements: usedSaved };
    if (result.status === 'AMBIGUOUS') {
      return res.json({ ...base, status: result.status, candidates: result.candidates,
        message: `Các size ${result.candidates.join(', ')} đều khớp số đo đang có. Vui lòng bổ sung số đo để phân biệt; shop không tự chọn size.` });
    }
    if (result.status !== 'OK') {
      return res.json({ ...base, status: result.status,
        message: result.status === 'NO_MATCH' ? 'Không có size nào khớp tất cả số đo bạn cung cấp theo bảng size của shop.' : 'Chưa đủ dữ liệu bảng size để đưa ra gợi ý; shop không tự suy đoán.' });
    }
    const details = result.evidence.map((e) => ({ ...e, status: 'ok', diff: 0 }));
    return res.json({ ...base, status: 'OK', recommended_size: result.size, confidence: result.complete ? 'high' : 'partial',
      message: result.complete ? `Các số đo bạn cung cấp khớp size ${result.size} theo bảng size shop.` : `Size ${result.size} khớp các số đo hiện có theo bảng size shop. Bạn có thể bổ sung số đo để kiểm tra kỹ hơn.`,
      details, alternatives: [], complete: result.complete });
  } catch (error) {
    console.error('Lỗi tính size AI:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi tính toán size' });
  }
});

module.exports = router;