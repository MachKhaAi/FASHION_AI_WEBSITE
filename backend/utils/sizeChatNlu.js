'use strict';
/**
 * Hiểu câu chat tiếng Việt cho trợ lý tư vấn size.
 * Chỉ gồm các hàm thuần (không truy cập DB, không gọi dịch vụ bên ngoài) nên dễ kiểm thử.
 *
 *  - normalize():            chữ thường, bỏ dấu, gọn khoảng trắng
 *  - extractMeasurements():  tách chiều cao, cân nặng, vòng ngực / eo / hông
 *  - detectIntent():         nhận diện ý định của khách
 *  - detectPreference():     thích mặc rộng hay ôm
 *  - detectAskedSize():      khách hỏi về một size cụ thể (vd "size M có vừa không")
 *  - resolveProduct():       nhận diện sản phẩm khách muốn mua trong danh mục cửa hàng
 */

const FIELDS = {
  height: { label: 'Chiều cao', unit: 'cm', min: 100, max: 230 },
  weight: { label: 'Cân nặng', unit: 'kg', min: 20, max: 250 },
  chest: { label: 'Vòng ngực', unit: 'cm', min: 50, max: 160 },
  waist: { label: 'Vòng eo', unit: 'cm', min: 40, max: 160 },
  hip: { label: 'Vòng hông', unit: 'cm', min: 50, max: 170 },
};
const FIELD_KEYS = Object.keys(FIELDS);

function stripAccents(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Chữ thường, bỏ dấu tiếng Việt, gọn khoảng trắng. */
function normalize(text) {
  return stripAccents(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// 1. Tách số đo
// ---------------------------------------------------------------------------
const toNumber = (s) => Number(String(s).replace(',', '.'));
const inRange = (key, v) => Number.isFinite(v) && v >= FIELDS[key].min && v <= FIELDS[key].max;

/**
 * @param {string} raw      câu của khách
 * @param {{awaiting?: string}} opts  awaiting: trợ lý đang chờ 'height' | 'weight' | 'measure' | 'body'
 * @returns {{values: Object<string, number>, invalid: Array<{key:string,value:number}>}}
 */
function extractMeasurements(raw, opts = {}) {
  let t = ` ${normalize(raw)} `;
  const values = {};
  const invalid = [];

  const put = (key, value) => {
    if (!Number.isFinite(value)) return;
    if (inRange(key, value)) values[key] = value;
    else invalid.push({ key, value });
  };
  // Thay phần đã đọc bằng khoảng trắng để các luật sau không dùng lại cùng một con số
  const consume = (re, fn) => {
    t = t.replace(re, (...m) => {
      fn(...m);
      return ' '.repeat(m[0].length);
    });
  };

  // --- a) Ba số đo viết liền: "số đo 84-64-90", "84/64/90", "3 vòng 84 64 90" ---
  const plausibleTriple = (a, b, c) => a >= 60 && a <= 140 && b >= 45 && b <= 130 && c >= 70 && c <= 150;
  const applyTriple = (m, a, b, c) => {
    const [x, y, z] = [a, b, c].map(Number);
    if (!plausibleTriple(x, y, z)) return m; // giữ nguyên nếu không hợp lý
    put('chest', x); put('waist', y); put('hip', z);
    return ' '.repeat(m.length);
  };
  t = t.replace(
    /(?:so do|3 vong|ba vong|bwh|vong)[^\d]{0,14}?(\d{2,3})(?:\s*[-/x,]\s*|\s+)(\d{2,3})(?:\s*[-/x,]\s*|\s+)(\d{2,3})(?!\d)/g,
    (m, a, b, c) => applyTriple(m, a, b, c)
  );
  t = t.replace(/(?<![\d.,])(\d{2,3})\s*[-/]\s*(\d{2,3})\s*[-/]\s*(\d{2,3})(?![\d.,])/g, (m, a, b, c) => applyTriple(m, a, b, c));
  if (['measure', 'body'].includes(opts.awaiting)) {
    t = t.replace(/^\s*(\d{2,3})\s+(\d{2,3})\s+(\d{2,3})\s*$/, (m, a, b, c) => applyTriple(m, a, b, c));
  }

  // --- b) Số đo có nhãn: ngực / vòng 1, eo / vòng 2, hông / mông / vòng 3 ---
  const NUM = String.raw`[^\d]{0,12}?(\d{2,3}(?:[.,]\d)?)`;
  consume(new RegExp(String.raw`(?:\bnguc\b|\bvong\s*(?:1|mot)\b|\bv1\b|\bbust\b)${NUM}`, 'g'), (m, v) => put('chest', toNumber(v)));
  consume(new RegExp(String.raw`(?:\beo\b|\bvong\s*(?:2|hai)\b|\bv2\b|\bwaist\b)${NUM}`, 'g'), (m, v) => put('waist', toNumber(v)));
  consume(new RegExp(String.raw`(?:\bhong\b|\bmong\b|\bvong\s*(?:3|ba)\b|\bv3\b|\bhip\b)${NUM}`, 'g'), (m, v) => put('hip', toNumber(v)));

  // --- c) Chiều cao: 1m60, 1m6, 1 mét 65, 1.65m, cao 160, 160cm ---
  consume(/(?<![\d.,])([12])\s*(?:m|met)\s*(\d{1,2})(?![\d])/g, (m, a, b) => put('height', Number(a) * 100 + (b.length === 1 ? Number(b) * 10 : Number(b))));
  consume(/(?<![\d.,])([12])[.,](\d{1,2})\s*(?:m|met)\b/g, (m, a, b) => put('height', Number(a) * 100 + (b.length === 1 ? Number(b) * 10 : Number(b))));
  consume(/(?:\bcao\b|chieu cao)[^\d]{0,10}?(\d{3})(?!\d)/g, (m, v) => put('height', Number(v)));
  consume(/(?<![\d.,])(\d{3})\s*(?:cm|centimet)\b/g, (m, v) => put('height', Number(v)));

  // --- d) Cân nặng: 52kg, 52 ký, 52 cân, nặng 52 ---
  consume(/(?<![\d.,])(\d{2,3}(?:[.,]\d)?)\s*(?:kg|kgs|kilogram|kilo|ky|ki|can)\b/g, (m, v) => put('weight', toNumber(v)));
  consume(/(?:\bnang\b|can nang|trong luong)[^\d]{0,8}?(\d{2,3}(?:[.,]\d)?)/g, (m, v) => put('weight', toNumber(v)));

  // --- e) Trả lời cộc lốc theo câu hỏi của trợ lý ---
  const rest = t.trim();
  if (opts.awaiting === 'height' && /^\d{3}$/.test(rest) && values.height === undefined) put('height', Number(rest));
  else if (opts.awaiting === 'weight' && /^\d{2,3}(?:[.,]\d)?$/.test(rest) && values.weight === undefined) put('weight', toNumber(rest));
  else if (/^(1[3-9]\d|2[0-2]\d)\s*(?:cm)?\s*[,/ -]\s*(\d{2,3})$/.test(rest) && values.height === undefined && values.weight === undefined) {
    const m = rest.match(/^(\d{3})\D+(\d{2,3})$/);
    put('height', Number(m[1])); put('weight', Number(m[2]));
  } else if (values.height !== undefined && values.weight === undefined) {
    // "1m6 50": còn đúng một con số hợp lý của cân nặng trong câu rất ngắn
    const nums = rest.match(/\d{2,3}(?:[.,]\d)?/g) || [];
    if (nums.length === 1 && rest.replace(/[\d.,\s]/g, '').length <= 6) {
      const w = toNumber(nums[0]);
      if (w >= 30 && w <= 130) put('weight', w);
    }
  }

  return { values, invalid };
}

// ---------------------------------------------------------------------------
// 2. Ý định, sở thích mặc, size được hỏi, màu
// ---------------------------------------------------------------------------
const RX = {
  reset: /\b(lam lai|nhap lai|bat dau lai|xoa het|xoa du lieu|reset)\b/,
  thanks: /\b(cam on|camon|thank|thanks|tks|cam ơn)\b/,
  bye: /\b(tam biet|bye|hen gap lai|thoi nhe|chao nhe)\b/,
  greeting: /^(xin chao|chao|hello|hi|hey|alo|a lo|shop oi|chao shop|chao ban|ban oi|co ai khong)\b/,
  measureHelp: /(cach do|do nhu the nao|do the nao|huong dan do|do sao|do o dau|do kieu gi|cach lay so do|do nhu nao|do ntn)/,
  sizeChart: /(bang size|bang kich thuoc|bang so do|size chart|bang kich co|xem size|bang co)/,
  explain: /(tai sao|vi sao|giai thich|sao lai|co chac|chac chua|dua vao dau|can cu)/,
  stock: /(con hang|het hang|con size|con mau|co san hang|con khong|con ko)\b/,
  productInfo: /(co mau nao|nhung mau|co nhung mau|mau gi|gia bao nhieu|bao nhieu tien|gia sao|gia the nao|chat lieu|vai gi|co nhung size|co size nao|mau nao)/,
  sizeWords: /(size|mac|vua|chat|rong|chon|tu van|so do|nen mua|phu hop|co mac duoc|dung khong|om|oversize|muon mua|dinh mua|can mua|mua)/,
  help: /(giup|ho tro|lam duoc gi|co the lam gi|huong dan)/,
};

/**
 * @param {string} raw
 * @param {{hasMeasurements?: boolean, hasProduct?: boolean, hasContext?: boolean, awaiting?: string}} ctx
 * @returns {'reset'|'measure_help'|'size_chart'|'explain'|'stock'|'product_info'|'size_advice'|'thanks'|'bye'|'greeting'|'help'|'unknown'}
 */
function detectIntent(raw, ctx = {}) {
  const t = normalize(raw);
  if (!t) return 'unknown';
  if (RX.reset.test(t)) return 'reset';
  if (RX.measureHelp.test(t)) return 'measure_help';
  if (RX.sizeChart.test(t)) return 'size_chart';
  if (RX.explain.test(t) && (ctx.hasMeasurements || ctx.hasProduct || ctx.hasContext)) return 'explain';
  const hasSizeSignal = ctx.hasMeasurements || RX.sizeWords.test(t) || FIELD_KEYS.some((k) => new RegExp(`\\b${k}\\b`).test(t));
  if (RX.stock.test(t)) return 'stock';
  if (RX.productInfo.test(t) && !ctx.hasMeasurements) return 'product_info';
  if (ctx.hasMeasurements) return 'size_advice';
  if (RX.thanks.test(t) && !hasSizeSignal) return 'thanks';
  if (RX.bye.test(t) && !hasSizeSignal) return 'bye';
  if (RX.greeting.test(t) && !(RX.sizeWords.test(t) && t.length > 12)) return 'greeting';
  if (RX.thanks.test(t)) return 'thanks';
  if (hasSizeSignal || ctx.hasProduct || ctx.awaiting) return 'size_advice';
  if (RX.help.test(t)) return 'help';
  return 'unknown';
}

/** 'loose' = thích mặc rộng, 'tight' = thích mặc ôm, null = không nói. */
function detectPreference(raw) {
  const t = normalize(raw);
  if (/(thich|muon|chuong|hay|mac|lay|form|dang)\s*(mac\s*)?(rong|thoai mai|oversize|xuong|loose)/.test(t) || /\b(rong rai|oversize|mac rong|form rong)\b/.test(t)) return 'loose';
  if (/(thich|muon|chuong|hay|mac|lay|form|dang)\s*(mac\s*)?(om|om sat|body|fit)\b/.test(t) || /\b(om body|mac om|form om)\b/.test(t)) return 'tight';
  return null;
}

/** Size khách nhắc tới, ví dụ "size M", "mặc XL". */
function detectAskedSize(raw) {
  const t = normalize(raw);
  const m = t.match(/\b(?:size|sz|mac|lay|chon)\s*(xxl|xl|xs|s|m|l)\b/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Màu khách nhắc tới, đối chiếu với màu của sản phẩm (chọn tên dài nhất khớp).
 * Nhạy dấu để "hông 90" (số đo) không bị nhầm với màu "Hồng"; chỉ khi khách viết không dấu
 * thì mới nhận "mau hong" (có chữ "màu" đứng trước).
 */
function detectColor(raw, colors = []) {
  const clean = (s) => ` ${String(s).toLowerCase().normalize('NFC').replace(/[,.;:!?()"'/]/g, ' ').replace(/\s+/g, ' ')} `;
  const accented = clean(raw);
  const plain = ` ${normalize(raw).replace(/[,.;:!?()"'/]/g, ' ').replace(/\s+/g, ' ')} `;
  let best = null;
  for (const c of colors) {
    const withAccent = clean(c);
    const hit = accented.includes(withAccent) || plain.includes(` mau ${normalize(c)} `);
    if (hit && (!best || c.length > best.length)) best = c;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 3. Nhận diện sản phẩm
// ---------------------------------------------------------------------------
const STOP = new Set([
  'va', 'cho', 'cua', 'la', 'mot', 'nay', 'kia', 'minh', 'toi', 'em', 'muon', 'mua', 'co', 'khong', 'ko', 'nhe', 'a',
  'voi', 'de', 'di', 'cai', 'chiec', 'con', 'bo', 'size', 'mau', 'nen', 'chon', 'giup', 'xem', 'cua', 'shop', 'dang', 'dinh',
  'can', 'tu', 'van', 'mac', 'vua', 'hang', 'gi', 'nao', 'the',
]);
// Từ chỉ loại hàng: ít giá trị để phân biệt hai sản phẩm
const GENERIC = new Set(['ao', 'dam', 'vay', 'quan', 'chan', 'set', 'tui', 'khan', 'kep', 'toc', 'that', 'lung', 'nu', 'thanh', 'lich', 'tinh', 'pho', 'dao', 'cong', 'so', 'da', 'mem']);

const CATEGORY_RULES = [
  ['chan-vay', /\bchan vay\b/],
  ['phu-kien', /\b(tui|khan|kep toc|that lung|day nit|phu kien|non|kinh)\b/],
  ['set', /\b(set|bo do|bo quan ao|do bo)\b/],
  ['quan', /\bquan\b/],
  ['dam', /\b(dam|vay)\b/],
  ['ao', /\bao\b/],
];

function detectCategory(text) {
  const t = normalize(text);
  for (const [id, rx] of CATEGORY_RULES) if (rx.test(t)) return id;
  return null;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const tokenize = (text) => normalize(text).replace(/[^a-z0-9\s]/g, ' ').split(' ').filter(Boolean);
const tokenWeight = (tok) => (GENERIC.has(tok) ? 0.4 : 1) * Math.max(1, tok.length - 1);

function tokenMatches(tok, msgTokens) {
  if (msgTokens.has(tok)) return true;
  if (tok.length < 5) return false;
  for (const m of msgTokens) {
    if (m.length >= 4 && (tok.startsWith(m) || m.startsWith(tok) || levenshtein(tok, m) <= 1)) return true;
  }
  return false;
}

/**
 * @param {string} raw
 * @param {Array<{id:string,name:string,categoryId?:string}>} catalog
 * @param {{currentId?: string}} ctx
 * @returns {{product: object|null, candidates: object[], ambiguous: boolean, category: string|null, viaContext: boolean}}
 */
function resolveProduct(raw, catalog, ctx = {}) {
  const t = normalize(raw);
  const none = { product: null, candidates: [], ambiguous: false, category: detectCategory(raw), viaContext: false };
  if (!t || !catalog.length) return none;

  // 1) Mã sản phẩm: "sp10"
  const idMatch = t.match(/\bsp\s?(\d{1,3})\b/);
  if (idMatch) {
    const p = catalog.find((x) => x.id === `sp${idMatch[1]}`);
    if (p) return { ...none, product: p };
  }

  // 2) Tên sản phẩm
  const msgTokens = new Set(tokenize(raw).filter((x) => !STOP.has(x)));
  const scored = catalog.map((p) => {
    const nameNorm = normalize(p.name);
    if (t.includes(nameNorm)) return { p, score: 1, exact: true };
    const toks = [...new Set(tokenize(p.name).filter((x) => !STOP.has(x)))];
    const total = toks.reduce((s, x) => s + tokenWeight(x), 0) || 1;
    const hitToks = toks.filter((x) => tokenMatches(x, msgTokens));
    const hit = hitToks.reduce((s, x) => s + tokenWeight(x), 0);
    // cần ít nhất một từ đặc trưng (không phải từ chỉ loại hàng) hoặc trùng từ 2 từ trở lên
    const distinctive = hitToks.some((x) => !GENERIC.has(x));
    const score = distinctive || hitToks.length >= 2 ? hit / total : 0;
    return { p, score, exact: false, hits: new Set(hitToks) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length) {
    const [top, second] = scored;
    if (top.exact) return { ...none, product: top.p };
    // Còn sản phẩm khác khớp ĐỦ mọi từ mà sản phẩm đầu bảng khớp -> câu chưa phân biệt được
    // (ví dụ "áo sơ mi" khớp cả "Áo sơ mi cổ nơ" lẫn "Áo sơ mi công sở") -> hỏi lại khách.
    const same = scored.filter((x) => [...top.hits].every((h) => x.hits.has(h)));
    if (same.length > 1) {
      return { ...none, candidates: same.slice(0, 4).map((x) => x.p), ambiguous: true };
    }
    if (top.score >= 0.75 && (!second || second.score <= top.score - 0.2)) {
      return { ...none, product: top.p };
    }
    if (top.score >= 0.35) {
      const cands = scored.filter((x) => x.score >= Math.max(0.35, top.score - 0.3)).slice(0, 4).map((x) => x.p);
      if (cands.length === 1 && top.score >= 0.6) return { ...none, product: cands[0] };
      return { ...none, candidates: cands, ambiguous: true };
    }
  }

  // 3) "sản phẩm này / áo này / đầm này" -> sản phẩm đang xem
  if (ctx.currentId && /\b(nay|do|kia|cai nay|mon nay|san pham nay)\b/.test(t)) {
    const p = catalog.find((x) => x.id === ctx.currentId);
    if (p) return { ...none, product: p, viaContext: true };
  }

  // 4) Chỉ nói loại hàng ("muốn mua đầm") -> gợi ý vài mẫu cùng loại
  const category = none.category;
  if (category && /(mua|tim|xem|can|muon|tu van|goi y|size)/.test(t)) {
    const cands = catalog.filter((p) => p.categoryId === category).slice(0, 4);
    if (cands.length) return { ...none, candidates: cands, ambiguous: true };
  }
  return none;
}

module.exports = {
  FIELDS,
  FIELD_KEYS,
  normalize,
  stripAccents,
  extractMeasurements,
  detectIntent,
  detectPreference,
  detectAskedSize,
  detectColor,
  detectCategory,
  resolveProduct,
};
