'use strict';

const nlu = require('./sizeChatNlu');
const advisor = require('./sizeAdvisor');

const { FIELDS, FIELD_KEYS, REQUIRED_MEASUREMENTS } = advisor;

// ---------------------------------------------------------------------------
// Trạng thái hội thoại (do trình duyệt giữ và gửi lại mỗi lượt)
// ---------------------------------------------------------------------------
function sanitizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const measurements = advisor.normalizeMeasurements(s.measurements).values;
  const str = (v, n = 60) => (typeof v === 'string' && v.length <= n ? v : null);
  const keys = (arr) => (Array.isArray(arr) ? [...new Set(arr.filter((k) => FIELD_KEYS.includes(k)))] : []);
  return {
    measurements,
    productId: str(s.productId, 50),
    color: str(s.color, 50),
    askedFor: keys(s.askedFor),
    fromProfile: keys(s.fromProfile).filter((k) => measurements[k] !== undefined),
  };
}

const productSummary = (p) => ({
  id: p.id,
  name: p.name,
  image: p.image,
  price: p.price,
  oldPrice: p.oldPrice || 0,
  categoryName: p.categoryName || '',
  colors: p.colors || [],
  sizes: p.sizes || [],
  url: `/san-pham/${p.id}`,
});

const hasAny = (m) => FIELD_KEYS.some((k) => m && m[k] !== undefined);
const labelOf = (k) => FIELDS[k].label.toLowerCase();
const joinVi = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} và ${list[list.length - 1]}`);

function describeMeasurements(m) {
  const parts = [];
  if (m.height !== undefined) parts.push(`cao ${m.height} cm`);
  if (m.weight !== undefined) parts.push(`nặng ${m.weight} kg`);
  if (m.chest !== undefined) parts.push(`ngực ${m.chest} cm`);
  if (m.waist !== undefined) parts.push(`eo ${m.waist} cm`);
  if (m.hip !== undefined) parts.push(`hông ${m.hip} cm`);
  return parts.join(', ');
}

function chartCard(chart, product) {
  const rows = advisor.chartRowsForProduct(chart, product);
  const r2 = (r) => `${r[0]}–${r[1]}`;
  return {
    type: 'chart',
    title: `Bảng size · ${product.name}`,
    rows: rows.map((r) => ({ size: r.size, chest: r2(r.ranges.chest), waist: r2(r.ranges.waist), hip: r2(r.ranges.hip), height: r2(r.ranges.height), weight: r2(r.ranges.weight) })),
  };
}

function stockCard(product) {
  const cells = {};
  for (const v of product.variants || []) (cells[v.size] ||= {})[v.color] = Number(v.stock) || 0;
  return { type: 'stock', product: productSummary(product), sizes: product.sizes || [], colors: product.colors || [], cells };
}

const MEASURE_GUIDE = 'Cách đo nhanh tại nhà (dùng thước dây mềm, mặc đồ mỏng, đứng thẳng thoải mái):\n• **Vòng ngực**: đo vòng quanh phần đầy nhất của ngực, thước song song mặt đất.\n• **Vòng eo**: đo ở chỗ nhỏ nhất của eo, thường trên rốn khoảng 2 cm.\n• **Vòng hông**: đo quanh phần đầy nhất của mông.\n• **Chiều cao** (không giày) và **cân nặng** buổi sáng.\nĐo xong bạn nhắn cho mình, ví dụ: "cao 1m60, nặng 50kg, ngực 84, eo 64, hông 90" nhé ♡';

// ---------------------------------------------------------------------------
// Lời tư vấn (dựa hoàn toàn vào kết quả của SizeAdvisor)
// ---------------------------------------------------------------------------
function evidenceLine(e, size) {
  return `• ${e.label} ${e.value} ${e.unit} nằm trong khoảng ${e.min}–${e.max} ${e.unit} của size ${size} ✓`;
}

function availabilityLine(av, size, color) {
  if (!av || av.status === 'unknown') return '';
  if (av.status === 'out') {
    return `Size ${size} hiện **đang hết hàng**. Mình không tự đổi sang size khác vì có thể không vừa với bạn; bạn có thể đợi hàng về hoặc liên hệ cửa hàng nhé.`;
  }
  const base = av.status === 'low' ? `Size ${size} hiện chỉ còn ${av.quantity} sản phẩm, bạn nên đặt sớm nhé ♡` : `Size ${size} hiện còn hàng ♡`;
  if (color && av.colorQuantity !== undefined) {
    return `${base}\n${av.colorQuantity > 0 ? `Màu **${color}** size ${size} còn ${av.colorQuantity} sản phẩm.` : `Màu **${color}** size ${size} hiện chưa có hàng.`}`;
  }
  return base;
}

function noMatchText({ product, measurements, result }) {
  const lines = [
    `**Chưa tìm được size phù hợp với số đo của bạn** (${describeMeasurements(measurements)}) cho **${product.name}**, vì không có size nào bao gồm đồng thời các số đo đã cung cấp.`,
    '',
    '**So với từng size của sản phẩm:**',
  ];
  for (const m of result.mismatches.slice(0, 3)) {
    const why = m.issues
      .map((i) => `${labelOf(i.key)} ${i.side === 'above' ? 'lớn hơn' : 'nhỏ hơn'} khoảng ${i.min}–${i.max} ${i.unit} (${i.diff} ${i.unit})`)
      .join('; ');
    lines.push(`• Size ${m.size}: ${why}`);
  }
  lines.push('', 'Mình không tự đoán size gần đúng để tránh bạn chọn sai. Bạn có thể liên hệ **chăm sóc khách hàng** của HQA để được tư vấn riêng, hoặc xem sản phẩm khác nhé ♡');
  return lines.join('\n');
}

/**
 * Bộ phân tích cơ bản (không dùng AI), bật mặc định khi Gemini chưa cấu hình hoặc gặp lỗi (có thể tắt bằng CHAT_LOCAL_FALLBACK=false).
 * Đọc số đo, sản phẩm, ý định bằng luật tiếng Việt. Trả về null nếu không hiểu được gì hữu ích (khi đó chatbot mở biểu mẫu nhập số đo).
 */
function localEntities(text, state, catalog, local) {
  const hasMeasure = Object.keys(local.values).length > 0;
  const pm = nlu.resolveProduct(text, catalog, { currentId: state.productId });
  const hasProduct = !!pm.product || pm.ambiguous;
  const detected = nlu.detectIntent(text, {
    hasMeasurements: hasMeasure,
    hasProduct,
    hasContext: hasAny(state.measurements) || !!state.productId,
    awaiting: state.askedFor.length ? 'measure' : null,
  });
  const intent = { stock: 'ask_stock', size_advice: 'size_advice', explain: 'size_advice', size_chart: 'ask_size_chart', measure_help: 'ask_measure_guide' }[detected] || 'other';
  if (!hasMeasure && !hasProduct && intent === 'other') return null;
  return { intent, measurements: local.values, productReference: null, color: null, askedSize: nlu.detectAskedSize(text), correction: false };
}

/**
 * Kiểm tra chéo số đo AI trích xuất với luật đọc số đo (đặc biệt quan trọng với model chạy trên máy, hay đọc sai/bịa số):
 *  - Luật đọc rõ ràng (1m60, 52kg, "ngực 84"...) luôn được ưu tiên.
 *  - Số chỉ AI tìm ra thì CHỈ nhận khi con số đó thật sự xuất hiện trong tin nhắn của khách.
 */
function reconcileMeasurements(text, aiValues, localValues) {
  const present = new Set((nlu.normalize(text).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));
  const out = {};
  for (const k of FIELD_KEYS) {
    if (localValues[k] !== undefined) out[k] = localValues[k];
    else if (aiValues?.[k] !== undefined && present.has(String(aiValues[k]))) out[k] = aiValues[k];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Xử lý một lượt chat
// ---------------------------------------------------------------------------
const OTHER_PRODUCT_RX = /(san pham khac|mau khac|cai khac|mon khac|doi san pham|chon lai san pham)/;
const FORM = { label: 'Nhập số đo bằng biểu mẫu', action: 'form' };

/**
 * @param {object} p
 * @param {string} p.message
 * @param {object} p.state
 * @param {Array}  p.catalog   sản phẩm kèm sizes/colors/variants
 * @param {Array}  p.chart     bảng size [{size, ranges:{height,weight,chest,waist,hip}}]
 * @param {Function} [p.extract]   async ({message,currentProduct,knownMeasurements,askedFor}) => entities; ném lỗi nếu AI không dùng được
 * @param {Function} [p.polish]    async (facts) => string|null   AI diễn đạt tự nhiên câu mở đầu (không được đổi kết luận)
 * @param {boolean}  [p.localFallback=false]  true = khi AI lỗi vẫn đọc tin nhắn bằng bộ phân tích cơ bản thay vì mở biểu mẫu
 * @param {Function} [p.loadSaved] async () => số đo đã lưu trong hồ sơ của khách đã đăng nhập
 */
async function handleMessage({ message, state: rawState, catalog = [], chart = [], extract, polish = null, loadSaved = null, localFallback = false }) {
  const state = sanitizeState(rawState);
  const text = String(message || '').trim();
  const t = nlu.normalize(text);
  const featured = catalog.filter((p) => p.featured).slice(0, 3);
  const suggest = (list) => list.map((p) => `Mình muốn mua ${p.name}`);
  const currentProduct = state.productId ? catalog.find((p) => p.id === state.productId) || null : null;

  let degradedMode = false; // AI không dùng được -> đang đọc tin nhắn bằng bộ phân tích cơ bản
  let aiError = null;
  const out = (reply, nextState, extra = {}) => {
    let text = reply.text;
    let quick = reply.quickReplies || [];
    if (degradedMode && !extra.fallback) {
      text = `${text}\n\n(Trợ lý AI tạm thời chưa kết nối được nên mình đang đọc tin nhắn theo cách cơ bản. Nếu mình hiểu chưa đúng, bạn dùng biểu mẫu nhập số đo nhé.)`;
      if (!quick.some((q) => q && q.action === 'form')) quick = [...quick, FORM];
    }
    return {
      state: sanitizeState(nextState),
      reply: { text, cards: reply.cards || [], quickReplies: quick },
      extracted: extra.extracted || null,
      intent: extra.intent || null,
      fallback: Boolean(extra.fallback),
      degraded: degradedMode,
      aiError: extra.aiError || aiError,
    };
  };

  // ---- 1) Câu đơn giản: trả lời ngay, không gọi AI ----
  const askedOne = state.askedFor.length === 1 ? state.askedFor[0] : state.askedFor.length ? 'measure' : null; // 'height' | 'weight' | 'measure' | null
  const local = nlu.extractMeasurements(text, { awaiting: askedOne });
  if (!/\d/.test(text)) {
    const intent = nlu.detectIntent(text, { hasMeasurements: false, hasProduct: false, hasContext: false });
    if (intent === 'reset') {
      return out({ text: 'Mình đã xóa thông tin cũ, mình bắt đầu lại nhé ♡ Bạn cho mình biết **sản phẩm muốn mua** và **số đo** bạn đang có (chiều cao, cân nặng, ngực, eo, hông).', quickReplies: [FORM, 'Cách đo số đo'] }, {}, { intent });
    }
    if (intent === 'greeting' || intent === 'help') {
      return out({
        text: 'Xin chào bạn! Mình là trợ lý tư vấn size của HQA ♡\nBạn chỉ cần cho mình **tên sản phẩm** và **số đo đang có** (ví dụ chiều cao, cân nặng hoặc vòng ngực/eo/hông). Nếu bạn đã lưu số đo trong tài khoản, mình sẽ dùng số đo đó. Mình chỉ chọn size khi đối chiếu được với bảng size của shop. Bạn cứ nhắn tự nhiên bằng tiếng Việt nhé, ví dụ: "Mình cao 1m60, nặng 47kg, ngực 84, eo 64, hông 90, muốn mua áo sơ mi cổ nơ".',
        quickReplies: ['Cách đo số đo', FORM, ...suggest(featured.slice(0, 1))],
      }, state, { intent });
    }
    if (intent === 'thanks') return out({ text: 'Rất vui được giúp bạn ♡ Cần tư vấn size cho sản phẩm khác, bạn cứ nhắn mình nhé!', quickReplies: ['Tư vấn sản phẩm khác'] }, state, { intent });
    if (intent === 'bye') return out({ text: 'Cảm ơn bạn đã ghé HQA, hẹn gặp lại bạn nhé ♡' }, state, { intent });
    if (intent === 'measure_help') return out({ text: MEASURE_GUIDE, quickReplies: [FORM] }, state, { intent });
    if (intent === 'size_chart') {
      const pm = nlu.resolveProduct(text, catalog, { currentId: state.productId });
      const product = pm.product || currentProduct;
      if (product) return out({ text: `Đây là bảng size của **${product.name}** (đơn vị cm, cân nặng kg) ♡`, cards: [chartCard(chart, product)], quickReplies: [FORM, 'Cách đo số đo'] }, { ...state, productId: product.id }, { intent });
      return out({ text: 'Bạn muốn xem bảng size của sản phẩm nào ạ? Bạn nhắn tên sản phẩm giúp mình nhé ♡', quickReplies: suggest(featured) }, state, { intent });
    }
  }

  // ---- 2) Nhờ AI trích xuất. AI không dùng được -> bộ phân tích cơ bản; không hiểu được gì -> biểu mẫu ----
  let ent = null;
  try {
    if (typeof extract !== 'function') throw Object.assign(new Error('Chưa cấu hình bộ trích xuất AI'), { code: 'NO_EXTRACTOR' });
    ent = await extract({
      message: text,
      currentProduct: currentProduct?.name || null,
      knownMeasurements: state.measurements,
      askedFor: state.askedFor,
    });
  } catch (error) {
    aiError = error?.code || 'ERROR';
  }
  if (!ent && localFallback) {
    ent = localEntities(text, state, catalog, local);
    if (ent) degradedMode = true;
  }
  if (!ent) {
    let saved = null;
    try { saved = loadSaved ? await loadSaved() : null; } catch { /* bỏ qua */ }
    const pm0 = nlu.resolveProduct(text, catalog, { currentId: state.productId });
    const prefillProduct = pm0.product || currentProduct;
    const prefill = {
      productId: prefillProduct?.id || null,
      product: prefillProduct ? { id: prefillProduct.id, name: prefillProduct.name } : null,
      measurements: { ...advisor.normalizeMeasurements(saved).values, ...state.measurements, ...local.values },
    };
    return out({
      text: 'Rất tiếc, trợ lý AI đang gặp sự cố kết nối nên mình chưa đọc được tin nhắn của bạn. Bạn có thể nhập **sản phẩm và những số đo đang có** vào biểu mẫu bên dưới; không cần đủ cả 5 số đo nhé ♡',
      cards: [{ type: 'form', prefill }],
    }, state, { fallback: true, intent: 'fallback', aiError });
  }

  // ---- 3) Chuẩn hóa và kiểm tra dữ liệu AI trả về ----
  // Số đo: luật đọc số đo ưu tiên; số chỉ AI tìm ra phải có thật trong tin nhắn (không để AI tự điền / bịa số)
  const aiRaw = reconcileMeasurements(text, ent.measurements, local.values);
  const { values: newValues, invalid } = advisor.normalizeMeasurements(aiRaw);
  const newKeys = Object.keys(newValues);

  const next = { ...state, measurements: { ...state.measurements, ...newValues }, askedFor: [], fromProfile: state.fromProfile.filter((k) => !newKeys.includes(k)) };

  // Sản phẩm: AI chỉ nêu cách khách gọi tên; backend tự đối chiếu danh mục
  const wantsOther = ent.intent === 'change_product' || OTHER_PRODUCT_RX.test(t);
  let pm = ent.productReference ? nlu.resolveProduct(ent.productReference, catalog, { currentId: state.productId }) : { product: null, candidates: [], ambiguous: false };
  if (!pm.product && !pm.ambiguous) pm = nlu.resolveProduct(text, catalog, { currentId: wantsOther ? null : state.productId });
  if (wantsOther) next.productId = null;
  if (pm.product) { next.productId = pm.product.id; next.color = null; }
  const product = next.productId ? catalog.find((p) => p.id === next.productId) || null : null;

  const color = product ? nlu.detectColor(ent.color || text, product.colors) : null;
  if (color) next.color = color;
  const askedSize = ent.askedSize && product?.sizes.includes(ent.askedSize) ? ent.askedSize : null;

  const extracted = {
    measurements: newKeys.map((k) => ({ key: k, label: FIELDS[k].label, value: newValues[k], unit: FIELDS[k].unit })),
    product: pm.product ? { id: pm.product.id, name: pm.product.name } : null,
    size: askedSize,
    color,
    fromProfile: [],
  };
  const meta = { extracted, intent: ent.intent };

  // ---- 4) Các ý định không cần đủ số đo ----
  if (ent.intent === 'ask_measure_guide') return out({ text: MEASURE_GUIDE, quickReplies: [FORM] }, next, meta);
  if (ent.intent === 'ask_size_chart') {
    if (product) return out({ text: `Đây là bảng size của **${product.name}** (đơn vị cm, cân nặng kg) ♡`, cards: [chartCard(chart, product)], quickReplies: [FORM] }, next, meta);
    if (pm.ambiguous && pm.candidates.length) return out({ text: 'Bạn muốn xem bảng size của sản phẩm nào ạ?', cards: [{ type: 'products', items: pm.candidates.map(productSummary) }], quickReplies: suggest(pm.candidates) }, next, meta);
    return out({ text: 'Bạn muốn xem bảng size của sản phẩm nào ạ? Bạn nhắn tên sản phẩm giúp mình nhé ♡', quickReplies: suggest(featured) }, next, meta);
  }
  if (ent.intent === 'ask_stock') {
    if (!product) {
      if (pm.ambiguous && pm.candidates.length) return out({ text: 'Bạn hỏi về sản phẩm nào ạ?', cards: [{ type: 'products', items: pm.candidates.map(productSummary) }], quickReplies: suggest(pm.candidates) }, next, meta);
      return out({ text: 'Bạn muốn hỏi còn hàng của sản phẩm nào ạ? Bạn nhắn tên sản phẩm giúp mình nhé ♡', quickReplies: suggest(featured) }, next, meta);
    }
    const lines = [];
    const variants = askedSize ? product.variants.filter((v) => v.size === askedSize) : product.variants;
    if (askedSize && color) {
      const v = variants.find((x) => x.color === color);
      lines.push(v && v.stock > 0 ? `**${product.name}** màu ${color} size ${askedSize} hiện còn ${v.stock} sản phẩm ♡` : `**${product.name}** màu ${color} size ${askedSize} hiện đã hết hàng hoặc không có.`);
    } else if (askedSize) {
      const ok = variants.filter((v) => v.stock > 0);
      lines.push(ok.length ? `Size ${askedSize} của **${product.name}** còn các màu: ${ok.map((v) => `${v.color} (${v.stock})`).join(', ')} ♡` : `Size ${askedSize} của **${product.name}** hiện đã hết hoặc không có.`);
    } else {
      const bySize = {};
      for (const v of variants) bySize[v.size] = (bySize[v.size] || 0) + (Number(v.stock) || 0);
      const ok = Object.entries(bySize).filter(([, q]) => q > 0).map(([s, q]) => `${s} (${q})`);
      lines.push(ok.length ? `**${product.name}** hiện còn các size: ${ok.join(', ')} ♡` : `**${product.name}** hiện đã hết hàng.`);
    }
    return out({ text: lines.join('\n'), cards: [stockCard(product)], quickReplies: [FORM] }, next, meta);
  }

  // ---- 5) Tư vấn size: cần sản phẩm và số đo có thực, không bắt buộc đủ 5 ----
  if (invalid.length) {
    const bad = invalid.map((i) => `${FIELDS[i.key].label} ${i.value} ${FIELDS[i.key].unit} chưa hợp lý (hợp lệ khoảng ${FIELDS[i.key].min}–${FIELDS[i.key].max} ${FIELDS[i.key].unit})`).join('; ');
    return out({ text: `Mình chưa dùng được: ${bad}. Bạn kiểm tra lại và nhắn lại giúp mình nhé ♡`, quickReplies: [FORM, 'Cách đo số đo'] }, { ...next, askedFor: invalid.map((i) => i.key) }, meta);
  }

  if (!newKeys.length && !pm.product && !pm.ambiguous && ent.intent === 'other') {
    return out({
      text: 'Mình là trợ lý tư vấn size của HQA nên chỉ hỗ trợ chọn size cho bạn thôi nhé ♡ Bạn cho mình biết **sản phẩm muốn mua** và ít nhất một số đo (hoặc lưu số đo trong hồ sơ) để mình đối chiếu bảng size nhé.',
      quickReplies: [FORM, 'Cách đo số đo'],
    }, next, meta);
  }

  // Khách đã lưu số đo trong hồ sơ -> dùng để bổ sung các chỉ số còn thiếu
  let usedProfileKeys = [...next.fromProfile];
  if ((advisor.missingMeasurements(next.measurements).length || next.fromProfile.length) && typeof loadSaved === 'function') {
    try {
      const saved = advisor.normalizeMeasurements(await loadSaved()).values;
      for (const k of REQUIRED_MEASUREMENTS) {
        if (newKeys.includes(k)) continue; // số đo khách vừa nói luôn được ưu tiên
        if (next.fromProfile.includes(k)) {
          // Nếu khách sửa số đo trong trang thông tin cá nhân thì dùng giá trị mới nhất.
          if (saved[k] !== undefined) next.measurements[k] = saved[k];
          else { delete next.measurements[k]; usedProfileKeys = usedProfileKeys.filter((x) => x !== k); }
        } else if (next.measurements[k] === undefined && saved[k] !== undefined) {
          next.measurements[k] = saved[k];
          usedProfileKeys.push(k);
        }
      }
    } catch { /* khách chưa có số đo đã lưu */ }
  }
  usedProfileKeys = [...new Set(usedProfileKeys)].filter((k) => next.measurements[k] !== undefined);
  next.fromProfile = usedProfileKeys;
  extracted.fromProfile = usedProfileKeys;
  const profileNote = usedProfileKeys.length ? `Mình đang dùng ${joinVi(usedProfileKeys.map(labelOf))} bạn đã lưu trong hồ sơ cá nhân. Nếu số đo đã thay đổi, bạn nhắn số đo mới cho mình nhé.` : '';

  // Chưa rõ sản phẩm
  if (!product) {
    const known = Object.keys(next.measurements).length ? `Mình đã ghi nhận số đo của bạn (${describeMeasurements(next.measurements)}). ` : '';
    if (pm.ambiguous && pm.candidates.length) {
      return out({
        text: `${known}Bạn muốn mua sản phẩm nào để mình chọn size ạ?`,
        cards: [{ type: 'products', items: pm.candidates.map(productSummary) }],
        quickReplies: suggest(pm.candidates),
      }, next, meta);
    }
    return out({ text: `${known}Bạn muốn mua sản phẩm nào để mình chọn size ạ? Bạn nhắn tên sản phẩm giúp mình nhé ♡`, quickReplies: suggest(featured) }, next, meta);
  }

  // Có thể tư vấn với một phần số đo; size chỉ được quyết định bởi bảng size của shop.
  const result = advisor.recommend({ measurements: next.measurements, product, chart, color: next.color });
  const common = { ...next, askedFor: [] };
  if (result.status === 'INCOMPLETE') {
    return out({
      text: `${profileNote ? `${profileNote}\n` : ''}Bạn đang xem **${product.name}** ♡ Hãy cho mình **ít nhất một số đo** (cao, nặng, ngực, eo hoặc hông), hoặc cập nhật số đo trong phần thông tin khách hàng. Không cần nhập đủ cả 5 số đo nhé.`,
      quickReplies: [FORM, 'Cách đo số đo'],
    }, { ...next, askedFor: [] }, meta);
  }
  if (result.status === 'AMBIGUOUS') {
    const question = result.suggested.length ? `Bạn có thể cho mình thêm **${joinVi(result.suggested.map(labelOf))}** để phân biệt các size này.` : 'Bạn có thể cung cấp thêm số đo hoặc liên hệ shop để kiểm tra.';
    return out({
      text: `${profileNote ? `${profileNote}\n\n` : ''}Mình đã đối chiếu **${describeMeasurements(next.measurements)}** với bảng size của **${product.name}**. Các size **${joinVi(result.candidates)}** đều thỏa số đo bạn có nên chưa thể chốt chính xác một size. ${question} Mình sẽ không tự chọn bừa nhé ♡`,
      cards: [{ type: 'advice', status: 'AMBIGUOUS', candidates: result.candidates, product: productSummary(product) }],
      quickReplies: [FORM, 'Xem bảng size'],
    }, { ...next, askedFor: result.suggested }, meta);
  }

  if (result.status === 'FREE_SIZE') {
    return out({ text: `**${product.name}** là sản phẩm free size, không cần chọn size theo số đo ♡ Bạn có thể đặt ngay nhé!`, cards: [{ type: 'product', product: productSummary(product) }] }, common, meta);
  }
  if (result.status === 'NO_CHART') {
    return out({ text: `Sản phẩm **${product.name}** chưa có bảng size hợp lệ cho những số đo bạn cung cấp, nên mình không tự suy đoán size cho bạn. Bạn vui lòng liên hệ **chăm sóc khách hàng** của HQA để được hỗ trợ nhé ♡`, cards: [{ type: 'product', product: productSummary(product) }], quickReplies: ['Tư vấn sản phẩm khác'] }, common, meta);
  }
  if (result.status === 'NO_MATCH') {
    // Đặc tả 1.2.2.8 – A2: thông báo chưa tìm được size, gợi ý liên hệ CSKH hoặc xem sản phẩm khác, kết thúc (không đoán size).
    const prefix = profileNote ? `${profileNote}\n\n` : '';
    return out({
      text: `${prefix}${noMatchText({ product, measurements: next.measurements, result })}`,
      cards: [{ type: 'advice', status: 'NO_MATCH', mismatches: result.mismatches.slice(0, 3), product: productSummary(product), fromProfile: usedProfileKeys }],
      quickReplies: ['Xem bảng size', 'Tư vấn sản phẩm khác'],
    }, common, meta);
  }

  // OK
  let lead = `Đối chiếu số đo của bạn (${describeMeasurements(next.measurements)}) với bảng size shop, mình đề xuất **size ${result.size}** cho **${product.name}**.`;
  if (result.complete && typeof polish === 'function') {
    try {
      const polished = await polish({ size: result.size, matched: result.matched, product: product.name, measurements: next.measurements, status: 'OK' });
      if (polished) lead = polished;
    } catch { /* giữ câu mặc định */ }
  }
  const lines = [lead];
  if (profileNote) lines.push(profileNote);
  if (askedSize) {
    lines.push(askedSize === result.size ? `Size ${askedSize} bạn hỏi phù hợp với các số đo đang có.` : result.matched.includes(askedSize) ? `Size ${askedSize} bạn hỏi cũng khớp các số đo đang có.` : `Size ${askedSize} bạn hỏi không khớp các số đo đang có.`);
  }
  lines.push('', '**Căn cứ từ bảng size:**', ...result.evidence.map((e) => evidenceLine(e, result.size)));
  if (!result.complete) lines.push('', '⚠️ **Lưu ý:** Bạn chưa cung cấp đủ 5 số đo. Đây là size duy nhất khớp **những chỉ số hiện có**, không đảm bảo vừa với các chỉ số chưa biết. Bạn có thể bổ sung số đo để kiểm tra kỹ hơn.');
  if (result.chosenBy === 'larger') {
    lines.push(`• Số đo của bạn cùng nằm trong khoảng của các size ${joinVi(result.matched)}. Theo quy tắc ưu tiên sự thoải mái khi số đo ở vùng giáp ranh, mình đề xuất size lớn hơn là **size ${result.size}**.`);
  }
  const av = availabilityLine(result.availability, result.size, next.color);
  if (av) lines.push('', av);
  lines.push('', 'Gợi ý dựa trên bảng size của HQA, chỉ mang tính tham khảo.');

  const canSelect = result.availability.status !== 'out';
  return out({
    text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    cards: [{
      type: 'advice',
      status: 'OK',
      size: result.size,
      chosenBy: result.chosenBy,
      complete: result.complete,
      matched: result.matched,
      evidence: result.evidence,
      availability: result.availability,
      fromProfile: usedProfileKeys,
      product: productSummary(product),
      actions: canSelect ? [{ type: 'select-size', label: `Chọn size ${result.size}`, productId: product.id, size: result.size }] : [],
    }],
    quickReplies: ['Xem bảng size', 'Tư vấn sản phẩm khác'],
  }, common, meta);
}

/**
 * Tư vấn từ biểu mẫu nhập số đo thủ công (không cần AI). Dùng cùng SizeAdvisor và cùng cách giải thích.
 * @returns {Promise<{ok:false, errors:object}|{ok:true, ...kết quả như handleMessage}>}
 */
async function adviseManual({ productId, measurements, state, catalog, chart, loadSaved = null }) {
  const errors = {};
  const product = catalog.find((p) => p.id === productId) || null;
  if (!product) errors.productId = 'Vui lòng chọn sản phẩm cần tư vấn.';
  const { values, invalid } = advisor.normalizeMeasurements(measurements);
  for (const i of invalid) errors[i.key] = `${FIELDS[i.key].label} phải từ ${FIELDS[i.key].min} đến ${FIELDS[i.key].max} ${FIELDS[i.key].unit}.`;
  if (Object.keys(errors).length) return { ok: false, errors };

  const previous = sanitizeState(state);
  let saved = {};
  try { if (loadSaved) saved = advisor.normalizeMeasurements(await loadSaved()).values; } catch { /* không có hồ sơ */ }
  // Số đo nhập trong biểu mẫu > số đo trong cuộc chat > số đo lưu trong hồ sơ.
  const combined = { ...saved, ...previous.measurements, ...values };
  if (!Object.keys(combined).length) return { ok: false, errors: { _form: 'Vui lòng nhập ít nhất một số đo hoặc cập nhật số đo trong hồ sơ.' } };
  const fromProfile = [...new Set([
    ...previous.fromProfile.filter((k) => values[k] === undefined),
    ...Object.keys(saved).filter((k) => previous.measurements[k] === undefined && values[k] === undefined),
  ])];
  const result = await handleMessage({
    message: `Mình muốn tư vấn theo số đo đã cung cấp`,
    state: { ...previous, productId, measurements: combined, fromProfile },
    catalog, chart, loadSaved,
    extract: async () => ({ intent: 'size_advice', measurements: {}, productReference: null, color: null, askedSize: null, correction: false }),
  });
  return { ok: true, ...result };
}

module.exports = { handleMessage, adviseManual, sanitizeState, MEASURE_GUIDE };
