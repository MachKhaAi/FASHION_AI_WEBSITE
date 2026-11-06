'use strict';
/**
 * Bộ não của khung chat tư vấn size.
 *
 *   handleMessage({ message, state, catalog, chart, loadSaved })
 *     -> { reply: { text, cards, quickReplies }, state, intent, extracted }
 *
 * - Hiểu câu tiếng Việt (sizeChatNlu): ý định, số đo, sản phẩm, sở thích mặc.
 * - Đối chiếu bảng size của cửa hàng (chart) và tồn kho từng size / màu của sản phẩm (catalog).
 * - Giải thích vì sao chọn size đó.
 *
 * Không truy cập DB trực tiếp: dữ liệu được truyền vào nên có thể kiểm thử độc lập.
 */
const nlu = require('./sizeChatNlu');

const { FIELDS, FIELD_KEYS } = nlu;

// Trọng số từng số đo theo loại sản phẩm (0 = không ảnh hưởng)
const WEIGHTS = {
  ao: { chest: 3, waist: 2, hip: 1, height: 1, weight: 1 },
  dam: { chest: 3, waist: 3, hip: 3, height: 1, weight: 1 },
  set: { chest: 3, waist: 3, hip: 3, height: 1, weight: 1 },
  'chan-vay': { chest: 0, waist: 3, hip: 3, height: 1, weight: 1 },
  quan: { chest: 0, waist: 3, hip: 3, height: 1, weight: 1 },
  default: { chest: 3, waist: 3, hip: 3, height: 1, weight: 1 },
};
const CIRC = ['chest', 'waist', 'hip'];

const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;
const hasAny = (m) => FIELD_KEYS.some((k) => m && m[k] !== undefined && m[k] !== null);
const rangeText = (r) => `${r[0]}–${r[1]}`;

// ---------------------------------------------------------------------------
// Trạng thái hội thoại (do trình duyệt giữ và gửi lại mỗi lượt)
// ---------------------------------------------------------------------------
function sanitizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const measurements = {};
  for (const k of FIELD_KEYS) {
    const v = Number(s.measurements?.[k]);
    if (Number.isFinite(v) && v >= FIELDS[k].min && v <= FIELDS[k].max) measurements[k] = v;
  }
  const str = (v, n = 60) => (typeof v === 'string' && v.length <= n ? v : null);
  return {
    measurements,
    productId: str(s.productId, 50),
    preference: ['loose', 'tight'].includes(s.preference) ? s.preference : null,
    color: str(s.color, 50),
    awaiting: ['height', 'weight', 'measure', 'body', 'product'].includes(s.awaiting) ? s.awaiting : null,
  };
}

// ---------------------------------------------------------------------------
// Tính size
// ---------------------------------------------------------------------------
const distance = (v, [lo, hi]) => (v < lo ? lo - v : v > hi ? v - hi : 0);

function productSummary(p) {
  return {
    id: p.id,
    name: p.name,
    image: p.image,
    price: p.price,
    oldPrice: p.oldPrice || 0,
    categoryName: p.categoryName || '',
    colors: p.colors || [],
    sizes: p.sizes || [],
    url: `/san-pham/${p.id}`,
  };
}

/** Các dòng bảng size áp dụng cho sản phẩm (chỉ những size sản phẩm có). */
function rowsForProduct(chart, product) {
  if (!product) return chart;
  const has = new Set(product.sizes || []);
  return chart.filter((r) => has.has(r.size));
}

function stockBySize(product) {
  const map = {};
  for (const v of product?.variants || []) map[v.size] = (map[v.size] || 0) + (Number(v.stock) || 0);
  return map;
}

function bestForDimension(key, value, rows) {
  let best = null;
  rows.forEach((row, idx) => {
    const d = distance(value, row.ranges[key]);
    if (!best || d < best.d || (d === best.d && idx > best.idx)) best = { row, idx, d };
  });
  return best;
}

/**
 * @returns {null | {
 *   size, idx, rows, confidence, details, dims, dimSizes, score, adjusted, smaller, larger, outside, usedKeys, ignored
 * }}
 */
function computeAdvice({ measurements, product, chart, preference }) {
  const rows = rowsForProduct(chart, product);
  if (!rows.length) return null;
  const weights = WEIGHTS[product?.categoryId] || WEIGHTS.default;
  const usedKeys = FIELD_KEYS.filter((k) => measurements[k] !== undefined && weights[k] > 0);
  const ignored = FIELD_KEYS.filter((k) => measurements[k] !== undefined && weights[k] === 0);
  if (!usedKeys.length) return { rows, usedKeys, ignored, size: null };

  const scoreOf = (row) => usedKeys.reduce((s, k) => s + weights[k] * distance(measurements[k], row.ranges[k]), 0);
  const scored = rows.map((row, idx) => ({ row, idx, score: scoreOf(row) }));
  let best = scored.reduce((b, c) => (c.score < b.score || (c.score === b.score && c.idx > b.idx) ? c : b));

  let adjusted = null;
  if (preference === 'loose' && best.idx < rows.length - 1) {
    best = scored[best.idx + 1];
    adjusted = 'loose';
  } else if (preference === 'tight' && best.idx > 0 && scored[best.idx - 1].score <= best.score + 3) {
    best = scored[best.idx - 1];
    adjusted = 'tight';
  }

  const detailsFor = (row) =>
    usedKeys.map((k) => {
      const [lo, hi] = row.ranges[k];
      const value = measurements[k];
      return {
        key: k,
        label: FIELDS[k].label,
        unit: FIELDS[k].unit,
        value,
        min: lo,
        max: hi,
        status: value < lo ? 'below' : value > hi ? 'above' : 'ok',
        diff: distance(value, row.ranges[k]),
      };
    });

  const details = detailsFor(best.row);
  const circCount = usedKeys.filter((k) => CIRC.includes(k)).length;
  let confidence;
  if (circCount === 0) confidence = best.score === 0 ? 'medium' : 'low';
  else if (best.score === 0) confidence = circCount >= 2 ? 'high' : 'medium';
  else confidence = best.score <= 6 ? 'medium' : 'low';

  const dimSizes = usedKeys
    .filter((k) => weights[k] >= 2)
    .map((k) => ({ key: k, label: FIELDS[k].label, size: bestForDimension(k, measurements[k], rows).row.size, idx: bestForDimension(k, measurements[k], rows).idx }));

  const edge = (row) => (row ? { size: row.size, issues: detailsFor(row).filter((d) => d.status !== 'ok') } : null);
  const outside = usedKeys
    .map((k) => {
      const first = rows[0].ranges[k];
      const last = rows[rows.length - 1].ranges[k];
      const v = measurements[k];
      if (v > last[1]) return { key: k, label: FIELDS[k].label, side: 'above', size: rows[rows.length - 1].size, diff: v - last[1] };
      if (v < first[0]) return { key: k, label: FIELDS[k].label, side: 'below', size: rows[0].size, diff: first[0] - v };
      return null;
    })
    .filter(Boolean);

  return {
    size: best.row.size,
    idx: best.idx,
    rows,
    confidence,
    details,
    score: best.score,
    adjusted,
    dimSizes,
    smaller: edge(rows[best.idx - 1]),
    larger: edge(rows[best.idx + 1]),
    alternatives: scored
      .filter((x) => x.idx !== best.idx)
      .sort((a, b) => a.score - b.score || b.idx - a.idx)
      .slice(0, 2)
      .map((x) => ({ size: x.row.size, score: x.score })),
    usedKeys,
    ignored,
    outside,
    weights,
  };
}

// ---------------------------------------------------------------------------
// Câu chữ
// ---------------------------------------------------------------------------
function describeMeasurements(m) {
  const parts = [];
  if (m.height !== undefined) parts.push(`cao ${m.height} cm`);
  if (m.weight !== undefined) parts.push(`nặng ${m.weight} kg`);
  if (m.chest !== undefined) parts.push(`ngực ${m.chest} cm`);
  if (m.waist !== undefined) parts.push(`eo ${m.waist} cm`);
  if (m.hip !== undefined) parts.push(`hông ${m.hip} cm`);
  return parts.join(', ');
}

function reasonLine(d, size) {
  const range = `${d.min}–${d.max} ${d.unit}`;
  const label = d.label;
  if (d.status === 'ok') return `• ${label} ${d.value} ${d.unit} nằm trong khoảng ${range} của size ${size} ✓`;
  if (d.key === 'height') {
    return d.status === 'above'
      ? `• ${label} ${d.value} cm cao hơn khoảng size ${size} (${range}) ${d.diff} cm → trang phục có thể ngắn hơn một chút`
      : `• ${label} ${d.value} cm thấp hơn khoảng size ${size} (${range}) ${d.diff} cm → trang phục có thể dài hơn một chút`;
  }
  if (d.key === 'weight') {
    return d.status === 'above'
      ? `• ${label} ${d.value} kg nặng hơn khoảng size ${size} (${range}) ${d.diff} kg, chỉ mang tính tham khảo`
      : `• ${label} ${d.value} kg nhẹ hơn khoảng size ${size} (${range}) ${d.diff} kg, chỉ mang tính tham khảo`;
  }
  return d.status === 'above'
    ? `• ${label} ${d.value} cm lớn hơn khoảng size ${size} (${range}) ${d.diff} cm → có thể hơi chật ở phần này`
    : `• ${label} ${d.value} cm nhỏ hơn khoảng size ${size} (${range}) ${d.diff} cm → có thể hơi rộng ở phần này`;
}

function neighborLine(edge, direction) {
  if (!edge) return null;
  const word = direction === 'smaller' ? 'nhỏ hơn' : 'lớn hơn';
  if (!edge.issues.length) return `• Size ${edge.size} (${word}) cũng nằm trong khoảng số đo của bạn.`;
  const why = edge.issues
    .filter((i) => CIRC.includes(i.key) || i.key === 'height' || i.key === 'weight')
    .slice(0, 2)
    .map((i) => `${i.label.toLowerCase()} ${i.status === 'above' ? 'lớn' : 'nhỏ'} hơn khoảng size ${edge.size} ${i.diff} ${i.unit}`)
    .join(', ');
  return `• Size ${edge.size} (${word}): ${why} → ${direction === 'smaller' ? 'dễ bị chật' : 'sẽ rộng hơn'}.`;
}

function adviceText({ advice, product, measurements, usedSaved, explain }) {
  const lines = [];
  const who = describeMeasurements(measurements);
  const target = product ? `**${product.name}**` : 'các sản phẩm của HQA';
  lines.push(`Với số đo của bạn (${who}), mình gợi ý **size ${advice.size}** cho ${target}.`);
  if (usedSaved) lines.push('Mình đã dùng số đo bạn lưu trong hồ sơ cá nhân ♡');
  lines.push('');
  lines.push('**Vì sao mình chọn size này?**');
  for (const d of advice.details) lines.push(reasonLine(d, advice.size));

  // Các số đo lệch nhau: nói rõ mình chọn size theo hướng nào
  const distinct = [...new Set(advice.dimSizes.map((d) => d.size))];
  if (distinct.length > 1) {
    const top = advice.dimSizes.reduce((a, b) => (b.idx > a.idx ? b : a));
    const parts = advice.dimSizes.map((d) => `${d.label.toLowerCase()} hợp size ${d.size}`).join(', ');
    if (advice.idx >= top.idx) {
      lines.push(`• Các số đo chưa đồng đều (${parts}). Mình ưu tiên ${top.label.toLowerCase()} vì mặc thoải mái luôn dễ chịu hơn bị chật.`);
    } else {
      const roomier = advice.rows[advice.idx + 1]?.size;
      lines.push(`• Các số đo chưa đồng đều (${parts}). Mình chọn size ${advice.size} để cân bằng giữa các phần; riêng ${top.label.toLowerCase()} sẽ hơi chật hơn${roomier ? `, nếu bạn muốn thoải mái ở phần này có thể lấy size ${roomier}` : ''}.`);
    }
  }
  if (advice.adjusted === 'loose') lines.push('• Bạn thích mặc rộng rãi nên mình tăng lên 1 size so với số đo chuẩn.');
  if (advice.adjusted === 'tight') lines.push('• Bạn thích mặc ôm nên mình chọn size nhỏ hơn 1 bậc, số đo vẫn gần với khoảng chuẩn.');
  if (advice.ignored.length) {
    const names = advice.ignored.map((k) => FIELDS[k].label.toLowerCase()).join(', ');
    lines.push(`• ${names.charAt(0).toUpperCase() + names.slice(1)} không ảnh hưởng nhiều đến size của ${product?.categoryName?.toLowerCase() || 'sản phẩm này'} nên mình không dùng để so sánh.`);
  }
  if (advice.outside.length) {
    const o = advice.outside[0];
    lines.push(
      o.side === 'above'
        ? `• Lưu ý: ${o.label.toLowerCase()} của bạn vượt khoảng của size lớn nhất (${o.size}) khoảng ${o.diff} cm, bạn nên liên hệ cửa hàng để được hỗ trợ thêm.`
        : `• Lưu ý: ${o.label.toLowerCase()} của bạn nhỏ hơn khoảng của size nhỏ nhất (${o.size}) khoảng ${o.diff} cm, đồ có thể hơi rộng.`
    );
  }

  if (explain) {
    lines.push('');
    lines.push('**Nếu chọn size khác thì sao?**');
    const a = neighborLine(advice.smaller, 'smaller');
    const b = neighborLine(advice.larger, 'larger');
    if (a) lines.push(a);
    if (b) lines.push(b);
    if (!a && !b) lines.push('• Sản phẩm này chỉ có một size phù hợp.');
    lines.push('');
    const w = advice.weights;
    lines.push(`Cách mình tính: so từng số đo với khoảng chuẩn của mỗi size trong bảng size của HQA, ưu tiên ${CIRC.filter((k) => w[k] >= 3).map((k) => FIELDS[k].label.toLowerCase()).join(', ') || 'các vòng'} (quan trọng nhất), chiều cao và cân nặng chỉ dùng để tham khảo thêm.`);
  }

  if (!advice.usedKeys.some((k) => CIRC.includes(k))) {
    lines.push('');
    lines.push('Mình mới dựa vào chiều cao và cân nặng nên kết quả chỉ mang tính tham khảo. Bạn cho mình thêm **số đo 3 vòng** (ngực, eo, hông) thì mình tư vấn chính xác hơn nhé.');
  }
  return lines;
}

function stockLines(advice, product, stockMap, color) {
  const lines = [];
  const notes = {};
  if (!product || !(product.variants || []).length) return { lines, notes };
  const qty = stockMap[advice.size] || 0;
  notes.quantity = qty;
  if (qty > 0) {
    notes.status = qty <= 5 ? 'low' : 'in';
    lines.push(qty <= 5 ? `Size ${advice.size} hiện chỉ còn ${qty} sản phẩm, bạn nên đặt sớm nhé ♡` : `Size ${advice.size} hiện còn hàng ♡`);
  } else {
    notes.status = 'out';
    const inStock = advice.rows.map((r, idx) => ({ size: r.size, idx, qty: stockMap[r.size] || 0 })).filter((x) => x.qty > 0);
    if (inStock.length) {
      const near = inStock.reduce((a, b) => {
        const da = Math.abs(a.idx - advice.idx);
        const db = Math.abs(b.idx - advice.idx);
        return db < da || (db === da && b.idx > a.idx) ? b : a;
      });
      notes.suggestion = near.size;
      lines.push(`Rất tiếc size ${advice.size} của sản phẩm này đang hết hàng. Size gần nhất còn hàng là **size ${near.size}**${near.idx > advice.idx ? ' (rộng hơn một chút)' : ' (ôm hơn một chút)'}.`);
    } else {
      lines.push(`Rất tiếc sản phẩm này hiện đã hết hàng ở các size phù hợp.`);
    }
  }
  if (color) {
    const v = (product.variants || []).find((x) => x.size === advice.size && x.color === color);
    lines.push(v && v.stock > 0 ? `Màu **${color}** size ${advice.size} còn ${v.stock} sản phẩm.` : `Màu **${color}** size ${advice.size} hiện chưa có hàng.`);
  }
  return { lines, notes };
}

function adviceCard({ advice, product, notes }) {
  const choose = notes?.status === 'out' && notes.suggestion ? notes.suggestion : advice.size;
  return {
    type: 'advice',
    size: advice.size,
    confidence: advice.confidence,
    details: advice.details,
    alternatives: advice.alternatives,
    stock: notes && notes.status ? { status: notes.status, quantity: notes.quantity, suggestion: notes.suggestion || null } : null,
    product: product ? productSummary(product) : null,
    actions: product ? [{ type: 'select-size', label: `Chọn size ${choose}`, productId: product.id, size: choose }] : [],
  };
}

function chartCard(chart, product) {
  const rows = rowsForProduct(chart, product);
  return {
    type: 'chart',
    title: product ? `Bảng size · ${product.name}` : 'Bảng size HQA',
    rows: rows.map((r) => ({
      size: r.size,
      chest: rangeText(r.ranges.chest),
      waist: rangeText(r.ranges.waist),
      hip: rangeText(r.ranges.hip),
      height: rangeText(r.ranges.height),
      weight: rangeText(r.ranges.weight),
    })),
  };
}

function stockCard(product) {
  const sizes = product.sizes || [];
  const colors = product.colors || [];
  const cells = {};
  for (const v of product.variants || []) {
    (cells[v.size] ||= {})[v.color] = Number(v.stock) || 0;
  }
  return { type: 'stock', product: productSummary(product), sizes, colors, cells };
}

// ---------------------------------------------------------------------------
// Xử lý một lượt chat
// ---------------------------------------------------------------------------
const NEW_PRODUCT_RX = /(san pham khac|mau khac|cai khac|mon khac|doi san pham|chon lai san pham)/;

async function handleMessage({ message, state: rawState, catalog = [], chart = [], loadSaved = null }) {
  const state = sanitizeState(rawState);
  const text = String(message || '').trim();
  const t = nlu.normalize(text);

  const ext = nlu.extractMeasurements(text, { awaiting: state.awaiting });
  const newKeys = Object.keys(ext.values);
  const pm = nlu.resolveProduct(text, catalog, { currentId: state.productId });
  const wantsOtherProduct = NEW_PRODUCT_RX.test(t);

  const intent = nlu.detectIntent(text, {
    hasMeasurements: newKeys.length > 0,
    hasProduct: !!pm.product || pm.ambiguous,
    hasContext: hasAny(state.measurements) || !!state.productId,
    awaiting: state.awaiting,
  });

  // ---- cập nhật trạng thái ----
  const next = { ...state, measurements: { ...state.measurements }, awaiting: null };
  if (newKeys.length >= 3) next.measurements = { ...ext.values };
  else Object.assign(next.measurements, ext.values);
  if (wantsOtherProduct) next.productId = null;
  if (pm.product) next.productId = pm.product.id;
  const pref = nlu.detectPreference(text);
  if (pref) next.preference = pref;

  const product = next.productId ? catalog.find((p) => p.id === next.productId) || null : null;
  const color = product ? nlu.detectColor(text, product.colors) || (pm.product ? null : state.color) : null;
  if (color) next.color = color;
  else if (pm.product) next.color = null;
  const askedSize = nlu.detectAskedSize(text);

  const extracted = {
    measurements: newKeys.map((k) => ({ key: k, label: FIELDS[k].label, value: ext.values[k], unit: FIELDS[k].unit })),
    product: pm.product ? { id: pm.product.id, name: pm.product.name } : null,
    preference: pref,
    size: askedSize,
    color,
  };
  const invalidNote = ext.invalid.length
    ? ext.invalid.map((i) => `${FIELDS[i.key].label} ${i.value} ${FIELDS[i.key].unit} chưa hợp lý (hợp lệ: ${FIELDS[i.key].min}–${FIELDS[i.key].max} ${FIELDS[i.key].unit})`).join('; ')
    : '';

  const featured = catalog.filter((p) => p.featured).slice(0, 3);
  const suggestProducts = (list) => list.map((p) => `Mình muốn mua ${p.name}`);

  function finish(reply, nextState, intentName) {
    return {
      intent: intentName,
      extracted,
      state: sanitizeState(nextState),
      reply: { text: reply.text, cards: reply.cards || [], quickReplies: reply.quickReplies || [] },
    };
  }
  const prefix = invalidNote ? `Mình chưa dùng được: ${invalidNote}. Bạn kiểm tra lại giúp mình nhé.\n\n` : '';

  // ---- làm lại từ đầu ----
  if (intent === 'reset') {
    return finish({ text: 'Mình đã xóa thông tin cũ. Mình bắt đầu lại nhé ♡ Bạn cho mình biết **chiều cao, cân nặng** (hoặc số đo 3 vòng) và sản phẩm bạn muốn mua.', quickReplies: ['Mình cao 1m60 nặng 50kg', 'Cách đo số đo'] }, { measurements: {}, productId: null, preference: null, color: null, awaiting: null }, intent);
  }

  // ---- các ý định đơn giản ----
  if (intent === 'greeting') {
    return finish({
      text: 'Xin chào bạn! Mình là trợ lý tư vấn size của HQA ♡\nBạn cho mình biết **chiều cao, cân nặng** (hoặc số đo 3 vòng) và **sản phẩm muốn mua**, mình sẽ đối chiếu với bảng size của cửa hàng để gợi ý size vừa vặn nhất nhé.',
      quickReplies: ['Mình cao 1m60 nặng 50kg', 'Xem bảng size', 'Cách đo số đo', ...suggestProducts(featured.slice(0, 1))],
    }, next, intent);
  }
  if (intent === 'thanks') {
    return finish({ text: 'Rất vui được giúp bạn ♡ Nếu cần tư vấn thêm size cho sản phẩm khác, bạn cứ nhắn mình nhé!', quickReplies: ['Tư vấn sản phẩm khác', 'Xem bảng size'] }, next, intent);
  }
  if (intent === 'bye') {
    return finish({ text: 'Cảm ơn bạn đã ghé HQA, hẹn gặp lại bạn nhé ♡' }, next, intent);
  }
  if (intent === 'help' || intent === 'unknown') {
    const lead = intent === 'help' ? 'Mình có thể giúp bạn:' : 'Mình chưa hiểu rõ ý bạn lắm, nhưng mình có thể giúp bạn:';
    return finish({
      text: `${lead}\n• Gợi ý **size phù hợp** từ chiều cao, cân nặng hoặc số đo 3 vòng\n• Kiểm tra size/màu còn hàng của sản phẩm\n• Xem **bảng size** và hướng dẫn **cách đo**\nBạn thử nhắn như: "Mình cao 1m60, nặng 50kg, muốn mua áo sơ mi cổ nơ" nhé.`,
      quickReplies: ['Mình cao 1m60 nặng 50kg', 'Xem bảng size', 'Cách đo số đo'],
    }, next, intent);
  }
  if (intent === 'measure_help') {
    return finish({
      text: 'Cách đo nhanh tại nhà (dùng thước dây mềm, mặc đồ mỏng, đứng thẳng thoải mái):\n• **Vòng ngực**: đo vòng quanh phần đầy nhất của ngực, thước song song mặt đất.\n• **Vòng eo**: đo ở chỗ nhỏ nhất của eo, thường trên rốn khoảng 2 cm.\n• **Vòng hông**: đo quanh phần đầy nhất của mông.\n• **Chiều cao** (không giày) và **cân nặng** buổi sáng.\nĐo xong bạn nhắn cho mình, ví dụ: "ngực 84, eo 64, hông 90, cao 1m60, nặng 50kg" nhé ♡',
      quickReplies: ['Mình cao 1m60 nặng 50kg', 'Xem bảng size'],
    }, { ...next, awaiting: 'measure' }, intent);
  }
  if (intent === 'size_chart') {
    return finish({
      text: product
        ? `Đây là bảng size của **${product.name}** (đơn vị cm, cân nặng kg). Bạn cho mình số đo để mình chọn giúp size phù hợp nhé ♡`
        : 'Đây là bảng size chung của HQA (đơn vị cm, cân nặng kg). Bạn cho mình số đo và sản phẩm muốn mua để mình chọn giúp size phù hợp nhé ♡',
      cards: [chartCard(chart, product)],
      quickReplies: ['Mình cao 1m60 nặng 50kg', 'Cách đo số đo'],
    }, { ...next, awaiting: 'measure' }, intent);
  }

  // ---- cần sản phẩm: hỏi lại nếu chưa rõ ----
  const needProductReply = () => {
    if (pm.ambiguous && pm.candidates.length) {
      return finish({
        text: `${prefix}Mình thấy có vài mẫu phù hợp, bạn muốn mua sản phẩm nào ạ?`,
        cards: [{ type: 'products', items: pm.candidates.map(productSummary) }],
        quickReplies: suggestProducts(pm.candidates),
      }, { ...next, awaiting: 'product' }, intent);
    }
    return null;
  };

  if (intent === 'stock' || intent === 'product_info') {
    if (!product) {
      const amb = needProductReply();
      if (amb) return amb;
      return finish({ text: 'Bạn muốn hỏi về sản phẩm nào ạ? Bạn nhắn tên sản phẩm giúp mình nhé ♡', quickReplies: suggestProducts(featured) }, { ...next, awaiting: 'product' }, intent);
    }
    const stockMap = stockBySize(product);
    const colorsText = product.colors.length ? product.colors.join(', ') : 'chưa cập nhật';
    const lines = [];
    if (intent === 'stock' && askedSize) {
      const variants = (product.variants || []).filter((v) => v.size === askedSize);
      const pick = color ? variants.find((v) => v.color === color) : null;
      if (color && pick) lines.push(pick.stock > 0 ? `**${product.name}** màu ${color} size ${askedSize} hiện còn ${pick.stock} sản phẩm ♡` : `**${product.name}** màu ${color} size ${askedSize} hiện đã hết hàng.`);
      else if (color && !pick) lines.push(`**${product.name}** không có màu ${color} ở size ${askedSize}.`);
      else {
        const ok = variants.filter((v) => v.stock > 0);
        lines.push(ok.length ? `Size ${askedSize} của **${product.name}** còn các màu: ${ok.map((v) => `${v.color} (${v.stock})`).join(', ')} ♡` : `Size ${askedSize} của **${product.name}** hiện đã hết hoặc không có.`);
      }
    } else if (intent === 'stock') {
      const ok = Object.entries(stockMap).filter(([, q]) => q > 0).map(([s, q]) => `${s} (${q})`);
      lines.push(ok.length ? `**${product.name}** hiện còn các size: ${ok.join(', ')} ♡` : `**${product.name}** hiện đã hết hàng.`);
    } else {
      lines.push(`**${product.name}** giá ${money(product.price)}${product.oldPrice > product.price ? ` (giá gốc ${money(product.oldPrice)})` : ''}.`);
      lines.push(`Màu sắc: ${colorsText}.`);
      lines.push(`Size: ${product.sizes.join(', ') || 'chưa cập nhật'}.`);
    }
    return finish({
      text: `${lines.join('\n')}\nBạn cho mình chiều cao, cân nặng để mình chọn size phù hợp nhé!`,
      cards: [stockCard(product)],
      quickReplies: ['Mình cao 1m60 nặng 50kg', 'Xem bảng size'],
    }, { ...next, awaiting: hasAny(next.measurements) ? null : 'measure' }, intent);
  }

  // ---- tư vấn size (và giải thích) ----
  let measurements = next.measurements;
  let usedSaved = false;
  if (!hasAny(measurements) && typeof loadSaved === 'function') {
    try {
      const saved = await loadSaved();
      if (saved && hasAny(saved)) {
        const clean = {};
        for (const k of FIELD_KEYS) if (Number.isFinite(Number(saved[k])) && saved[k] !== null) clean[k] = Number(saved[k]);
        if (hasAny(clean)) { measurements = clean; next.measurements = clean; usedSaved = true; }
      }
    } catch { /* bỏ qua: không có số đo đã lưu */ }
  }

  if (!product) {
    const amb = pm.ambiguous && pm.candidates.length ? needProductReply() : null;
    if (amb) {
      if (hasAny(measurements)) amb.reply.text = `${prefix}Mình đã ghi nhận số đo của bạn (${describeMeasurements(measurements)}). Bạn muốn mua sản phẩm nào để mình chọn size ạ?`;
      return amb;
    }
  }

  if (!hasAny(measurements)) {
    const lead = product ? `Bạn đang quan tâm **${product.name}** ♡ ` : '';
    const ask = state.awaiting === 'weight' ? 'Bạn cho mình biết **cân nặng** nhé (ví dụ: 52kg).'
      : state.awaiting === 'height' ? 'Bạn cho mình biết **chiều cao** nhé (ví dụ: 1m60).'
      : 'Để chọn size chính xác, bạn cho mình biết **chiều cao và cân nặng** (hoặc số đo 3 vòng: ngực, eo, hông) nhé. Ví dụ: "Mình cao 1m60, nặng 50kg".';
    return finish({
      text: `${prefix}${lead}${ask}`,
      quickReplies: ['Mình cao 1m60 nặng 50kg', 'Cách đo số đo', ...(product ? [] : suggestProducts(featured.slice(0, 1)))],
    }, { ...next, awaiting: 'measure' }, intent);
  }

  // Sản phẩm không có bảng size (phụ kiện / One size)
  if (product && !rowsForProduct(chart, product).length) {
    return finish({
      text: `${prefix}**${product.name}** là sản phẩm ${product.sizes.length ? `size ${product.sizes.join(', ')}` : 'free size'}, không cần chọn size theo số đo ♡ Bạn có thể đặt ngay nhé!`,
      cards: [{ type: 'product', product: productSummary(product) }],
      quickReplies: ['Tư vấn sản phẩm khác'],
    }, next, intent);
  }

  const advice = computeAdvice({ measurements, product, chart, preference: next.preference });
  if (!advice || !advice.size) {
    return finish({
      text: `${prefix}Với số đo hiện có, mình chưa đủ dữ liệu để so với bảng size${advice?.ignored?.length ? ` (${advice.ignored.map((k) => FIELDS[k].label.toLowerCase()).join(', ')} không dùng cho loại sản phẩm này)` : ''}. Bạn cho mình thêm **vòng eo, vòng hông** hoặc chiều cao, cân nặng nhé ♡`,
      quickReplies: ['Cách đo số đo'],
    }, { ...next, awaiting: 'measure' }, intent);
  }

  const stockMap = stockBySize(product);
  const { lines: sLines, notes } = stockLines(advice, product, stockMap, next.color);
  const body = adviceText({ advice, product, measurements, usedSaved, explain: intent === 'explain' });

  // Khách hỏi một size cụ thể: nhận xét size đó trước
  let verdict = [];
  if (askedSize) {
    const row = advice.rows.find((r) => r.size === askedSize);
    if (!row) verdict.push(`Sản phẩm này không có size ${askedSize}.`);
    else {
      const issues = advice.usedKeys
        .map((k) => ({ k, d: distance(measurements[k], row.ranges[k]), v: measurements[k], r: row.ranges[k] }))
        .filter((x) => x.d > 0);
      if (!issues.length) verdict.push(`Size ${askedSize} vừa với số đo của bạn đó ♡`);
      else {
        const why = issues.slice(0, 2).map((x) => `${FIELDS[x.k].label.toLowerCase()} ${x.v > x.r[1] ? 'lớn' : 'nhỏ'} hơn khoảng size ${askedSize} ${x.d} ${FIELDS[x.k].unit}`).join(', ');
        verdict.push(askedSize === advice.size ? `Size ${askedSize} là gần vừa nhất với bạn (${why}).` : `Size ${askedSize} chưa thật sự vừa: ${why}.`);
      }
    }
    verdict.push('');
  }

  const parts = [prefix + verdict.join('\n'), ...body];
  if (sLines.length) parts.push('', ...sLines);
  if (!product) parts.push('', 'Đây là gợi ý theo bảng size chung của cửa hàng. Bạn muốn mua sản phẩm nào để mình kiểm tra size còn hàng giúp bạn nhé?');

  const quickReplies = [];
  if (!next.preference) quickReplies.push('Mình thích mặc rộng hơn', 'Mình thích mặc ôm');
  else quickReplies.push(next.preference === 'loose' ? 'Mình thích mặc ôm' : 'Mình thích mặc rộng hơn');
  if (intent !== 'explain') quickReplies.push('Tại sao lại chọn size này?');
  quickReplies.push('Xem bảng size', 'Tư vấn sản phẩm khác');
  if (!product) quickReplies.splice(0, quickReplies.length, ...suggestProducts(featured.slice(0, 2)), 'Tại sao lại chọn size này?', 'Xem bảng size');

  return finish({
    text: parts.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    cards: [adviceCard({ advice, product, notes }), ...(product ? [{ type: 'product', product: productSummary(product) }] : [])],
    quickReplies: quickReplies.slice(0, 4),
  }, { ...next, awaiting: null }, intent);
}

module.exports = {
  handleMessage,
  sanitizeState,
  computeAdvice,
  WEIGHTS,
};
