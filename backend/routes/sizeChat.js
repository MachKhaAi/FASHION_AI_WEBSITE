const express = require('express');
const { verifyAuthToken } = require('../utils/authTokens');
const db = require('../config/db');
const { handleMessage, adviseManual, sanitizeState } = require('../utils/sizeChatEngine');
const ai = require('../utils/geminiExtractor');

const router = express.Router();

// Khi khởi động: ghi cấu hình Gemini (không in khóa API)
{
  const cfg = ai.getConfig();
  if (cfg.apiKey) console.log(`[size-chat] AI: Google Gemini (model: ${cfg.model}, chờ tối đa ${cfg.timeoutMs} ms).`);
  else console.warn(`[size-chat] Chưa có GEMINI_API_KEY trong backend/.env => chatbot sẽ mở biểu mẫu nhập số đo thủ công cho khách.\n   => ${ai.explainAIError({ code: 'NO_API_KEY' })}`);
}

// Ghi log chẩn đoán khi AI không dùng được (chỉ ở backend, không hiện cho khách)
function logAiProblem(error, code) {
  if (!error && !code) return;
  const e = error || { code };
  const extra = [e.status ? `HTTP ${e.status}` : '', e.detail ? `Chi tiết: ${e.detail}` : ''].filter(Boolean).join(' | ');
  console.warn(`[size-chat] Không dùng được Gemini (${e.code || code})${extra ? ` - ${extra}` : ''}\n   => ${ai.explainAIError(e)}`);
}

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
      height: [r.height_min == null ? null : Number(r.height_min), r.height_max == null ? null : Number(r.height_max)],
      weight: [r.weight_min == null ? null : Number(r.weight_min), r.weight_max == null ? null : Number(r.weight_max)],
      chest: [r.chest_min == null ? null : Number(r.chest_min), r.chest_max == null ? null : Number(r.chest_max)],
      waist: [r.waist_min == null ? null : Number(r.waist_min), r.waist_max == null ? null : Number(r.waist_max)],
      hip: [r.hip_min == null ? null : Number(r.hip_min), r.hip_max == null ? null : Number(r.hip_max)],
    },
  }));
  cache = { at: Date.now(), catalog, chart };
  return cache;
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------
// Đã đăng nhập (không bắt buộc) -> có thể dùng số đo đã lưu trong hồ sơ cá nhân
function optionalUserId(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return verifyAuthToken(header.slice(7)).id;
  } catch {
    return null;
  }
}

function savedMeasurementsLoader(userId) {
  if (!userId) return null;
  return async () => {
    try {
      const r = await db.query('SELECT height, weight, chest, waist, hip FROM body_measurements WHERE user_id = $1', [userId]);
      return r.rows[0] || null;
    } catch {
      return null; // bảng body_measurements chưa được tạo
    }
  };
}

// Giới hạn số yêu cầu để bảo vệ máy chủ (Gemini Free Tier có hạn mức số yêu cầu mỗi phút / mỗi ngày): tối đa 30 yêu cầu / phút / địa chỉ IP
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = Number(process.env.CHAT_RATE_LIMIT) || 30;
const hits = new Map();
function rateLimit(req, res, next) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    return res.status(429).json({ success: false, message: 'Bạn nhắn hơi nhanh, vui lòng chờ một chút rồi thử lại nhé.' });
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  next();
}

// ---------------------------------------------------------------------------
// POST /api/chat/message
// Body: { message: string, state?: object }   (state là trạng thái hội thoại do trình duyệt giữ)
// ---------------------------------------------------------------------------
router.post('/chat/message', rateLimit, async (req, res) => {
  const message = String(req.body?.message ?? '').trim().slice(0, 500);
  if (!message) return res.status(400).json({ success: false, message: 'Bạn chưa nhập tin nhắn.' });

  try {
    const { catalog, chart } = await loadShopData();
    const config = ai.getConfig(); // đọc lại mỗi lượt để đổi .env + khởi động lại là có hiệu lực
    let aiFailure = null;
    let startedAt = Date.now(); // tổng thời gian AI cho một lượt (trích xuất + diễn đạt) không quá GEMINI_TIMEOUT_MS (mặc định 5 giây)
    const result = await handleMessage({
      message,
      state: sanitizeState(req.body?.state),
      catalog,
      chart,
      extract: async (input) => {
        startedAt = Date.now();
        try {
          return await ai.extractEntities(input, { config });
        } catch (error) {
          aiFailure = error;
          throw error;
        }
      },
      // Gemini lỗi hoặc chưa được cấu hình: mặc định dùng bộ đọc số đo tiếng Việt cơ bản. Có thể tắt bằng CHAT_LOCAL_FALLBACK=false (mở biểu mẫu ngay).
      localFallback: String(process.env.CHAT_LOCAL_FALLBACK || 'true').toLowerCase() === 'true',
      polish: config.naturalReply
        ? (facts) => {
            const remaining = config.timeoutMs - (Date.now() - startedAt);
            return remaining >= 800 ? ai.polishAnswer(facts, { config, timeoutMs: remaining }) : null; // hết thời gian thì dùng câu mặc định
          }
        : null,
      loadSaved: savedMeasurementsLoader(optionalUserId(req)),
    });
    if (result.aiError) logAiProblem(aiFailure, result.aiError);
    const payload = { success: true, ...result };
    // Khi đang phát triển (không phải production): kèm nguyên nhân lỗi AI để hiện ngay trong khung chat
    if (result.aiError && process.env.NODE_ENV !== 'production') {
      const e = aiFailure || { code: result.aiError };
      payload.aiDebug = { code: e.code || result.aiError, status: e.status || null, detail: e.detail || null, hint: ai.explainAIError(e) };
    }
    res.json(payload);
  } catch (error) {
    console.error('Lỗi chat tư vấn size:', error.message);
    res.status(500).json({ success: false, message: 'Trợ lý đang gặp sự cố, bạn thử lại sau ít phút nhé.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/advisor/manual   (biểu mẫu nhập số đo thủ công - không cần AI)
// Body: { productId, measurements: { height, weight, chest, waist, hip }, state? }   (dùng chung SizeAdvisor với Chatbot, đặc tả 1.2.2.8)
// ---------------------------------------------------------------------------
router.post('/advisor/manual', rateLimit, async (req, res) => {
  try {
    const { catalog, chart } = await loadShopData();
    const result = await adviseManual({
      productId: String(req.body?.productId ?? ''),
      measurements: req.body?.measurements || {},
      state: req.body?.state,
      catalog,
      chart,
      loadSaved: savedMeasurementsLoader(optionalUserId(req)),
    });
    if (!result.ok) return res.status(400).json({ success: false, message: 'Thông tin chưa hợp lệ.', errors: result.errors });
    const { ok, ...payload } = result;
    res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Lỗi tư vấn size thủ công:', error.message);
    res.status(500).json({ success: false, message: 'Hệ thống đang gặp sự cố, bạn thử lại sau ít phút nhé.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/chat/status   (không lộ khóa) - mở trên trình duyệt để kiểm tra nhanh cấu hình
// ---------------------------------------------------------------------------
router.get('/chat/status', rateLimit, async (req, res) => {
  const cfg = ai.getConfig();
  const body = {
    success: true,
    provider: 'gemini',
    url: cfg.baseUrl,
    model: cfg.model,
    apiKeyConfigured: Boolean(cfg.apiKey),
    timeoutMs: cfg.timeoutMs,
    localFallback: String(process.env.CHAT_LOCAL_FALLBACK || 'true').toLowerCase() === 'true',
    naturalReply: cfg.naturalReply,
    nodeVersion: process.version,
    fetchAvailable: typeof globalThis.fetch === 'function',
    hint: 'Thêm ?test=1 vào địa chỉ để chạy thử model thật và biết nguyên nhân nếu lỗi.',
  };
  // ?test=1: chạy thử Gemini thật (chỉ khi không phải production)
  if (req.query.test === '1' && process.env.NODE_ENV !== 'production') body.probe = await ai.probe({ config: cfg });
  res.json(body);
});

module.exports = router;
