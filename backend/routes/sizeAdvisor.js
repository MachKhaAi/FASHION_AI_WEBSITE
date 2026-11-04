const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

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
    return jwt.verify(header.slice(7), process.env.JWT_SECRET).id;
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
    const userId = body.use_saved_measurements === true ? optionalUserId(req) : null;
    if (userId) {
      const saved = await db.query(
        'SELECT height, weight, chest, waist, hip FROM body_measurements WHERE user_id = $1',
        [userId]
      );
      const row = saved.rows[0];
      if (row) {
        for (const f of FIELDS) {
          if (input[f.key] === undefined && row[f.key] !== null && row[f.key] !== undefined) {
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

    // ---- 4. Chấm điểm từng size: tổng (trọng số x độ lệch), càng thấp càng vừa ----
    const scored = chart.rows.map((row, rank) => {
      let score = 0;
      for (const f of FIELDS) {
        if (input[f.key] === undefined) continue;
        score += f.weight * distance(input[f.key], row[`${f.key}_min`], row[`${f.key}_max`]);
      }
      return { row, rank, score };
    });
    scored.sort((a, b) => a.score - b.score || b.rank - a.rank);

    const best = scored[0];
    const confidence = best.score === 0 ? 'high' : best.score <= 6 ? 'medium' : 'low';

    // ---- 5. Chi tiết từng số đo so với size được chọn ----
    const details = [];
    for (const f of FIELDS) {
      if (input[f.key] === undefined) continue;
      const lo = best.row[`${f.key}_min`];
      const hi = best.row[`${f.key}_max`];
      const value = input[f.key];
      const status = value < lo ? 'below' : value > hi ? 'above' : 'ok';
      details.push({
        key: f.key,
        label: f.label,
        unit: f.unit,
        value,
        min: lo,
        max: hi,
        status,
        diff: distance(value, lo, hi),
      });
    }

    let message;
    if (best.score === 0) {
      message = `Số đo của bạn khớp hoàn toàn với size ${best.row.size_code}.`;
    } else {
      const notes = details
        .filter((d) => d.status !== 'ok')
        .map((d) => `${d.label.toLowerCase()} ${d.status === 'above' ? 'lớn hơn' : 'nhỏ hơn'} khoảng ${d.diff} ${d.unit}`);
      message = `Size ${best.row.size_code} là gần nhất với số đo của bạn (${notes.join(', ')} so với khoảng chuẩn).`;
    }

    res.json({
      success: true,
      recommended_size: best.row.size_code,
      confidence, // high | medium | low
      message,
      details,
      alternatives: scored.slice(1, 3).map((s) => ({ size: s.row.size_code, score: s.score })),
      used_saved_measurements: usedSaved,
    });
  } catch (error) {
    console.error('Lỗi tính size AI:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi tính toán size' });
  }
});

module.exports = router;