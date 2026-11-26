// Chạy: node --test backend/tests/sizeChat.test.js   (Node 18+, không cần cài thêm gì)
const test = require('node:test');
const assert = require('node:assert/strict');
const nlu = require('../utils/sizeChatNlu');
const advisor = require('../utils/sizeAdvisor');
const { handleMessage, adviseManual } = require('../utils/sizeChatEngine');

// Bảng size thật của cửa hàng (bảng size_charts)
const R = (size, h, w, c, wa, hi) => ({ size, ranges: { height: h, weight: w, chest: c, waist: wa, hip: hi } });
const chart = [
  R('S', [150, 160], [40, 48], [78, 84], [60, 66], [84, 90]),
  R('M', [156, 165], [48, 55], [85, 90], [67, 72], [91, 96]),
  R('L', [160, 170], [55, 63], [91, 97], [73, 79], [97, 103]),
  R('XL', [165, 175], [63, 73], [98, 106], [80, 88], [104, 112]),
];
const P = (id, name, categoryId, sizes, colors, stock = 10, extra = {}) => ({
  id, name, categoryId, categoryName: '', price: 359000, oldPrice: 0, image: `/images/products/${id}.jpg`, featured: false, sizes, colors,
  variants: sizes.flatMap((s) => colors.map((c) => ({ size: s, color: c, stock: typeof stock === 'function' ? stock(s, c) : stock }))), ...extra,
});
const catalog = [
  P('sp1', 'Áo sơ mi nữ công sở thanh lịch', 'ao', ['S', 'M', 'L'], ['Trắng', 'Xanh navy']),
  P('sp4', 'Váy babydoll hoa nhí', 'dam', ['S', 'M', 'L'], ['Hoa nhí', 'Trắng'], 10, { featured: true }),
  P('sp8', 'Túi tote da mềm', 'phu-kien', ['One size'], ['Nâu']),
  P('sp10', 'Áo sơ mi cổ nơ', 'ao', ['S', 'M', 'L', 'XL'], ['Trắng', 'Hồng', 'Đen'], (s, c) => (s === 'S' && c === 'Hồng' ? 0 : 8), { featured: true }),
  P('sp17', 'Đầm suông thanh lịch Iris', 'dam', ['S', 'M', 'L', 'XL'], ['Xanh nhạt'], (s) => (s === 'S' ? 0 : 6)),
  P('sp30', 'Giày bệt da', 'phu-kien', ['36', '37', '38'], ['Đen']), // có size nhưng chưa có bảng size
];

// ---- Giả lập AI: trả về đúng thực thể do test chỉ định (không gọi mạng) ----
const ent = (measurements = {}, extra = {}) => ({ intent: 'size_advice', measurements, productReference: null, color: null, askedSize: null, correction: false, ...extra });
const FULL = { height: 160, weight: 47, chest: 84, waist: 64, hip: 90 };
const ai = (entities) => { const fn = async (input) => { fn.calls.push(input); return typeof entities === 'function' ? entities(input) : entities; }; fn.calls = []; return fn; };
const say = (message, extract, state = {}, extra = {}) => handleMessage({ message, state, catalog, chart, extract, ...extra });

// ===========================================================================
test('SizeAdvisor: size phải thỏa ĐỒNG THỜI cả 5 số đo', () => {
  const r = advisor.recommend({ measurements: FULL, product: catalog[3], chart });
  assert.equal(r.status, 'OK'); assert.equal(r.size, 'S'); assert.equal(r.chosenBy, 'single'); assert.equal(r.evidence.length, 5);
  // lệch 1 chỉ số (cân nặng 50kg ngoài khoảng 40–48 của S, ngực 84 ngoài khoảng của M) -> không có size nào
  const n = advisor.recommend({ measurements: { ...FULL, weight: 50 }, product: catalog[3], chart });
  assert.equal(n.status, 'NO_MATCH'); assert.ok(n.mismatches.length === 4); assert.equal(n.size, undefined);
});

test('SizeAdvisor: vùng giáp ranh -> chọn size lớn hơn (BR-02)', () => {
  const overlap = [R('S', [150, 160], [40, 48], [78, 84], [60, 66], [84, 90]), R('M', [150, 168], [40, 56], [82, 90], [62, 72], [86, 96]), R('L', [150, 170], [40, 63], [88, 97], [66, 79], [90, 103])];
  const r = advisor.recommend({ measurements: { height: 158, weight: 45, chest: 89, waist: 66, hip: 90 }, product: { ...catalog[3], sizes: ['S', 'M', 'L'] }, chart: overlap });
  assert.deepEqual(r.matched, ['M', 'L']); assert.equal(r.size, 'L'); assert.equal(r.chosenBy, 'larger');
});

test('SizeAdvisor: thiếu số đo, không có bảng size, free size', () => {
  assert.deepEqual(advisor.recommend({ measurements: { height: 160 }, product: catalog[3], chart }).missing, ['weight', 'chest', 'waist', 'hip']);
  assert.equal(advisor.recommend({ measurements: FULL, product: catalog[5], chart }).status, 'NO_CHART');
  assert.equal(advisor.recommend({ measurements: FULL, product: catalog[2], chart }).status, 'FREE_SIZE');
});

test('SizeAdvisor: hết hàng vẫn nêu size, không tự đổi size khác', () => {
  const r = advisor.recommend({ measurements: FULL, product: catalog[4], chart });
  assert.equal(r.size, 'S'); assert.equal(r.availability.status, 'out');
});

// ===========================================================================
test('đủ thông tin: AI trích xuất -> thuật toán chọn size -> giải thích từng chỉ số', async () => {
  const extract = ai(ent(FULL, { productReference: 'áo sơ mi cổ nơ' }));
  const r = await say('Mình cao 1m60, nặng 47kg, ngực 84 eo 64 hông 90, muốn mua áo sơ mi cổ nơ', extract);
  const card = r.reply.cards[0];
  assert.equal(extract.calls.length, 1);
  assert.equal(card.status, 'OK'); assert.equal(card.size, 'S'); assert.equal(card.evidence.length, 5);
  assert.match(r.reply.text, /đề xuất \*\*size S\*\*/); assert.match(r.reply.text, /Căn cứ từ bảng size/);
  assert.match(r.reply.text, /Vòng ngực 84 cm nằm trong khoảng 78–84 cm của size S/);
  assert.equal(r.state.productId, 'sp10'); assert.equal(r.extracted.measurements.length, 5);
  assert.deepEqual(card.actions.map((a) => a.size), ['S']);
});

test('một phần số đo đủ phân biệt duy nhất size: tư vấn kèm cảnh báo, lượt sau xác minh', async () => {
  let r = await say('mình cao 1m60 nặng 47kg muốn mua áo sơ mi cổ nơ', ai(ent({ height: 160, weight: 47 }, { productReference: 'áo sơ mi cổ nơ' })));
  assert.equal(r.reply.cards[0].status, 'OK'); assert.equal(r.reply.cards[0].size, 'S');
  assert.equal(r.reply.cards[0].complete, false);
  assert.match(r.reply.text, /chưa cung cấp đủ 5 số đo/);
  assert.deepEqual(r.state.askedFor, []); assert.deepEqual(r.state.measurements, { height: 160, weight: 47 });
  const extract = ai(ent({ chest: 84, waist: 64, hip: 90 }));
  r = await say('ngực 84 eo 64 hông 90', extract, r.state);
  assert.deepEqual(extract.calls[0].askedFor, []);
  assert.equal(r.reply.cards[0].size, 'S'); assert.equal(r.reply.cards[0].complete, true);
});

test('chưa rõ sản phẩm: hỏi sản phẩm, nhớ số đo', async () => {
  let r = await say('mình cao 1m60 nặng 47kg ngực 84 eo 64 hông 90', ai(ent(FULL)));
  assert.match(r.reply.text, /muốn mua sản phẩm nào/); assert.equal(r.reply.cards.length, 0);
  r = await say('mình muốn mua áo sơ mi cổ nơ', ai(ent({}, { productReference: 'áo sơ mi cổ nơ' })), r.state);
  assert.equal(r.reply.cards[0].size, 'S');
});

test('đã lưu số đo trong hồ sơ: dùng để tư vấn, nói rõ nguồn', async () => {
  const saved = async () => ({ height: 160, weight: '47.00', chest: 84, waist: 64, hip: 90 });
  const r = await say('tư vấn size áo sơ mi cổ nơ giúp mình', ai(ent({}, { productReference: 'áo sơ mi cổ nơ' })), {}, { loadSaved: saved });
  assert.equal(r.reply.cards[0].size, 'S');
  assert.match(r.reply.text, /đã lưu trong hồ sơ cá nhân/); assert.equal(r.reply.cards[0].fromProfile.length, 5);
});

test('hồ sơ chỉ có một phần: dùng được mà không bắt nhập thêm', async () => {
  const saved = async () => ({ height: 160, weight: 47, chest: null, waist: null, hip: null });
  const r = await say('tư vấn size áo sơ mi cổ nơ', ai(ent({}, { productReference: 'áo sơ mi cổ nơ' })), {}, { loadSaved: saved });
  assert.equal(r.reply.cards[0].size, 'S'); assert.equal(r.reply.cards[0].complete, false);
  assert.match(r.reply.text, /chiều cao và cân nặng bạn đã lưu/);
  assert.deepEqual(r.reply.cards[0].fromProfile, ['height', 'weight']);
});

test('số đo khách nhắn trong chat được ưu tiên hơn số đo trong hồ sơ', async () => {
  const saved = async () => FULL;
  const r = await say('hôm nay mình nặng 55kg, ngực 88, eo 70, hông 94, cao 1m60, áo sơ mi cổ nơ', ai(ent({ weight: 55, chest: 88, waist: 70, hip: 94, height: 160 }, { productReference: 'áo sơ mi cổ nơ' })), {}, { loadSaved: saved });
  assert.equal(r.reply.cards[0].size, 'M'); assert.deepEqual(r.state.fromProfile, []);
});

test('khách chưa đăng nhập hoặc chưa lưu số đo: không có gì để bổ sung', async () => {
  const r = await say('tư vấn size áo sơ mi cổ nơ', ai(ent({}, { productReference: 'áo sơ mi cổ nơ' })), {}, { loadSaved: null });
  assert.match(r.reply.text, /ít nhất một số đo/); assert.equal(r.reply.cards.length, 0);
});

test('NO_MATCH (1.2.2.8 – A2): báo chưa tìm được size, gợi ý CSKH / sản phẩm khác, KHÔNG đoán size gần đúng', async () => {
  const r = await say('cao 1m60 nặng 50kg ngực 84 eo 64 hông 90, áo sơ mi cổ nơ', ai(ent({ ...FULL, weight: 50 }, { productReference: 'áo sơ mi cổ nơ' })));
  assert.equal(r.reply.cards[0].status, 'NO_MATCH'); assert.equal(r.reply.cards[0].size, undefined);
  assert.match(r.reply.text, /Chưa tìm được size phù hợp với số đo của bạn/);
  assert.match(r.reply.text, /Size S: cân nặng lớn hơn khoảng 40–48 kg/);
  assert.match(r.reply.text, /chăm sóc khách hàng/); assert.match(r.reply.text, /xem sản phẩm khác/);
  assert.doesNotMatch(r.reply.text, /đề xuất \*\*size/); assert.doesNotMatch(r.reply.text, /size gần nhất|gợi ý gần đúng|rộng rãi|ôm vừa/);
  assert.deepEqual(r.reply.cards[0].actions, undefined); // không có nút chọn size
  assert.ok(!r.reply.quickReplies.some((q) => /mặc rộng|mặc ôm/.test(q)));
});

test('NO_CHART và free size', async () => {
  let r = await say('cao 1m60 nặng 47kg ngực 84 eo 64 hông 90, giày bệt da', ai(ent(FULL, { productReference: 'giày bệt da' })));
  assert.match(r.reply.text, /chưa có bảng size hợp lệ/); assert.match(r.reply.text, /không tự suy đoán size/); assert.doesNotMatch(r.reply.text, /đề xuất/);
  r = await say('cao 1m60 nặng 47kg ngực 84 eo 64 hông 90, túi tote da mềm', ai(ent(FULL, { productReference: 'túi tote da mềm' })));
  assert.match(r.reply.text, /free size/);
});

test('size đề xuất hết hàng: báo hết hàng, không tự đổi sang size khác, không có nút chọn', async () => {
  const r = await say('cao 1m60 nặng 47kg ngực 84 eo 64 hông 90, đầm suông iris', ai(ent(FULL, { productReference: 'đầm suông thanh lịch iris' })));
  const card = r.reply.cards[0];
  assert.equal(card.size, 'S'); assert.equal(card.availability.status, 'out'); assert.deepEqual(card.actions, []);
  assert.match(r.reply.text, /đang hết hàng/); assert.match(r.reply.text, /không tự đổi sang size khác/);
});

test('AI lỗi + tắt chế độ cơ bản (CHAT_LOCAL_FALLBACK=false): mở biểu mẫu thủ công, giữ số đo đã có', async () => {
  const boom = async () => { throw Object.assign(new Error('timeout'), { code: 'TIMEOUT' }); };
  let r = await say('mình cao 1m60 nặng 47kg muốn mua áo sơ mi cổ nơ', boom, { measurements: { chest: 84 } }, { localFallback: false });
  assert.equal(r.fallback, true); assert.equal(r.aiError, 'TIMEOUT');
  const form = r.reply.cards[0];
  assert.equal(form.type, 'form'); assert.equal(form.prefill.productId, 'sp10');
  assert.deepEqual(form.prefill.measurements, { chest: 84, height: 160, weight: 47 });
  assert.doesNotMatch(r.reply.text, /đề xuất/);
  r = await say('cao 1m60', undefined, {}, { localFallback: false });
  assert.equal(r.fallback, true);
  r = await say('cao 1m60', boom, {}, { loadSaved: async () => ({ waist: 64 }), localFallback: false });
  assert.equal(r.reply.cards[0].prefill.measurements.waist, 64); // biểu mẫu điền sẵn số đo trong hồ sơ
});

test('AI không được tự điền số đo: tin nhắn không có chữ số thì bỏ số đo AI trả về', async () => {
  const r = await say('tư vấn size áo sơ mi cổ nơ nhé', ai(ent(FULL, { productReference: 'áo sơ mi cổ nơ' })));
  assert.equal(r.reply.cards.length, 0); assert.deepEqual(r.state.measurements, {});
});

test('số đo vô lý bị từ chối, yêu cầu nhập lại trước khi tư vấn', async () => {
  const r = await say('mình cao 300cm nặng 50kg, áo sơ mi cổ nơ', ai(ent({ height: 300, weight: 50 }, { productReference: 'áo sơ mi cổ nơ' })));
  assert.match(r.reply.text, /Chiều cao 300 cm chưa hợp lý/); assert.equal(r.reply.cards.length, 0);
  assert.deepEqual(r.state.measurements, { weight: 50 });
});

test('câu đơn giản không gọi AI (tiết kiệm hạn mức)', async () => {
  const extract = ai(ent());
  assert.equal((await say('xin chào', extract)).intent, 'greeting');
  assert.equal((await say('cảm ơn bạn', extract)).intent, 'thanks');
  assert.match((await say('cách đo vòng ngực', extract)).reply.text, /thước dây/);
  const c = await say('cho mình xem bảng size', extract, { productId: 'sp10' });
  assert.equal(c.reply.cards[0].type, 'chart'); assert.equal(c.reply.cards[0].rows.length, 4);
  const rs = await say('làm lại', extract, { productId: 'sp10', measurements: FULL });
  assert.equal(rs.state.productId, null); assert.deepEqual(rs.state.measurements, {});
  assert.equal(extract.calls.length, 0);
});

test('sản phẩm mơ hồ: hỏi lại; "sản phẩm khác" xóa sản phẩm hiện tại', async () => {
  let r = await say('cao 1m60 nặng 47kg ngực 84 eo 64 hông 90 muốn mua áo sơ mi', ai(ent(FULL, { productReference: 'áo sơ mi' })));
  assert.equal(r.reply.cards[0].type, 'products'); assert.equal(r.reply.cards[0].items.length, 2);
  r = await say('Mình muốn tư vấn sản phẩm khác', ai(ent({}, { intent: 'change_product' })), { productId: 'sp10', measurements: FULL });
  assert.equal(r.state.productId, null); assert.match(r.reply.text, /muốn mua sản phẩm nào/);
});

test('hỏi còn hàng theo size và màu', async () => {
  let r = await say('áo sơ mi cổ nơ còn size S màu hồng không', ai(ent({}, { intent: 'ask_stock', productReference: 'áo sơ mi cổ nơ', color: 'Hồng', askedSize: 'S' })));
  assert.match(r.reply.text, /màu Hồng size S hiện đã hết hàng/);
  r = await say('còn size M màu trắng không', ai(ent({}, { intent: 'ask_stock', color: 'Trắng', askedSize: 'M' })), { productId: 'sp10' });
  assert.match(r.reply.text, /còn 8 sản phẩm/);
});

test('ngoài phạm vi: nhắc lại chỉ hỗ trợ tư vấn size, kể cả khi đang giữa cuộc tư vấn', async () => {
  let r = await say('hôm nay thời tiết thế nào?', ai(ent({}, { intent: 'other' })));
  assert.match(r.reply.text, /chỉ hỗ trợ chọn size/);
  r = await say('hôm nay thời tiết thế nào?', ai(ent({}, { intent: 'other' })), { productId: 'sp10', measurements: FULL });
  assert.match(r.reply.text, /chỉ hỗ trợ chọn size/); assert.equal(r.reply.cards.length, 0);
  assert.equal(r.state.productId, 'sp10'); assert.deepEqual(r.state.measurements, FULL); // vẫn nhớ ngữ cảnh
});

test('(tùy chọn) AI viết lại câu mở đầu nhưng không được đổi kết luận', async () => {
  const good = async () => 'Mình thấy size S là vừa nhất cho bạn đó!';
  const bad = async () => 'Mình nghĩ size M hợp với bạn hơn!';
  const e = ai(ent(FULL, { productReference: 'áo sơ mi cổ nơ' }));
  const ok = await say('cao 1m60 nặng 47kg ngực 84 eo 64 hông 90 áo sơ mi cổ nơ', e, {}, { polish: good });
  assert.match(ok.reply.text, /^Mình thấy size S là vừa nhất/);
  const { isFaithful } = require('../utils/geminiExtractor');
  assert.equal(isFaithful(await bad(), { size: 'S', matched: ['S'], measurements: FULL }), false);
});

// ===========================================================================
test('biểu mẫu thủ công: kiểm tra từng ô và tư vấn bằng cùng thuật toán', async () => {
  let r = await adviseManual({ productId: 'sp10', measurements: { height: 160 }, catalog, chart });
  assert.equal(r.ok, true); assert.equal(r.reply.cards[0].status, 'AMBIGUOUS');
  assert.deepEqual(r.reply.cards[0].candidates, ['S', 'M', 'L']);
  r = await adviseManual({ productId: 'sp10', measurements: {}, catalog, chart });
  assert.equal(r.ok, false); assert.ok(r.errors._form);
  r = await adviseManual({ productId: 'sp10', measurements: { ...FULL, height: 20 }, catalog, chart });
  assert.match(r.errors.height, /từ 100 đến 230/);
  r = await adviseManual({ productId: 'nope', measurements: FULL, catalog, chart });
  assert.ok(r.errors.productId);
  r = await adviseManual({ productId: 'sp10', measurements: FULL, catalog, chart });
  assert.equal(r.ok, true); assert.equal(r.reply.cards[0].size, 'S'); assert.equal(r.state.productId, 'sp10');
});

// ===========================================================================
test('trích xuất số đo bằng luật cục bộ (dùng điền sẵn biểu mẫu khi AI lỗi)', () => {
  const ex = (t, o) => nlu.extractMeasurements(t, o).values;
  assert.deepEqual(ex('mình cao 1m60 nặng 52kg'), { height: 160, weight: 52 });
  assert.deepEqual(ex('số đo 84-64-90'), { chest: 84, waist: 64, hip: 90 });
  assert.deepEqual(ex('mông 100cm'), { hip: 100 });
});

test('nhận diện sản phẩm và màu', () => {
  assert.equal(nlu.resolveProduct('mình muốn mua áo sơ mi cổ nơ', catalog).product.id, 'sp10');
  const amb = nlu.resolveProduct('áo sơ mi', catalog);
  assert.equal(amb.ambiguous, true); assert.deepEqual(amb.candidates.map((p) => p.id).sort(), ['sp1', 'sp10']);
  assert.equal(nlu.detectColor('ngực 84 eo 64 hông 90', ['Trắng', 'Hồng']), null); // "hông" không phải màu "Hồng"
  assert.equal(nlu.detectColor('còn màu hồng không', ['Trắng', 'Hồng']), 'Hồng');
});

// ===========================================================================
// Đặc tả 1.2.2.8: không có size khớp -> không đoán; giáp ranh -> luôn size lớn hơn (BR-02)
// ===========================================================================
// S: ngực 85 > 84.  M: eo 66 < 67 và hông 90 < 91 -> không size nào chứa đủ 5 số đo.
const BETWEEN = { height: 158, weight: 48, chest: 85, waist: 66, hip: 90 };

test('không có size khớp đủ 5 số đo: NO_MATCH, không có hàm gợi ý "gần đúng"', () => {
  const r = advisor.recommend({ measurements: BETWEEN, product: catalog[3], chart });
  assert.equal(r.status, 'NO_MATCH'); assert.equal(r.size, undefined);
  assert.equal(advisor.recommendApprox, undefined);
  assert.equal(nlu.detectPreference, undefined);
});

test('nhiều size cùng vừa: LUÔN chọn size lớn hơn (BR-02), kèm ghi chú giải thích', async () => {
  const overlap = [R('S', [150, 160], [40, 48], [78, 84], [60, 66], [84, 90]), R('M', [150, 168], [40, 56], [82, 90], [62, 72], [86, 96]), R('L', [150, 170], [40, 63], [88, 97], [66, 79], [90, 103])];
  const product = { ...catalog[3], sizes: ['S', 'M', 'L'] };
  const m = { height: 158, weight: 45, chest: 89, waist: 66, hip: 90 };
  const r = advisor.recommend({ measurements: m, product, chart: overlap, fitPreference: 'tight' }); // tham số cũ bị bỏ qua
  assert.equal(r.size, 'L'); assert.equal(r.chosenBy, 'larger'); assert.deepEqual(r.matched, ['M', 'L']);
  const chat = await handleMessage({ message: 'cao 1m58 nặng 45kg ngực 89 eo 66 hông 90, áo sơ mi cổ nơ', state: {}, catalog: [product], chart: overlap, extract: ai(ent(m, { productReference: 'áo sơ mi cổ nơ' })) });
  assert.equal(chat.reply.cards[0].size, 'L');
  assert.match(chat.reply.text, /cùng nằm trong khoảng của các size M và L/); assert.match(chat.reply.text, /size lớn hơn là \*\*size L\*\*/);
});

test('biểu mẫu thủ công dùng chung thuật toán: không có size khớp -> cùng thông báo như Chatbot', async () => {
  const r = await adviseManual({ productId: 'sp10', measurements: BETWEEN, catalog, chart });
  assert.equal(r.reply.cards[0].status, 'NO_MATCH'); assert.match(r.reply.text, /Chưa tìm được size phù hợp với số đo của bạn/);
  const ok = await adviseManual({ productId: 'sp10', measurements: FULL, catalog, chart });
  assert.equal(ok.reply.cards[0].size, 'S'); assert.match(ok.reply.text, /Căn cứ từ bảng size/);
});

// ===========================================================================
// Đặc tả 1.2.2.7: ví dụ trong luồng chính, thiếu số đo (A1) và sự cố AI (A2)
// ===========================================================================
test('ví dụ của đặc tả: "cao 1m62, nặng 52kg, eo 68cm, mặc áo này size gì?" -> hỏi bổ sung đúng phần thiếu (A1)', async () => {
  const extract = ai(ent({ height: 162, weight: 52, waist: 68 }));
  const r = await say('Mình cao 1m62, nặng 52kg, eo 68cm mặc áo này size gì?', extract, { productId: 'sp10' });
  assert.equal(r.reply.cards[0].status, 'OK'); assert.equal(r.reply.cards[0].size, 'M');
  assert.equal(r.reply.cards[0].complete, false); assert.equal(r.state.productId, 'sp10');
  assert.deepEqual(r.state.askedFor, []);
  // người dùng bổ sung -> quay lại bước trích xuất và tư vấn
  const r2 = await say('ngực 88 hông 94', ai(ent({ chest: 88, hip: 94 })), r.state);
  assert.equal(r2.reply.cards[0].status, 'OK'); assert.equal(r2.reply.cards[0].size, 'M');
  assert.match(r2.reply.text, /Vòng eo 68 cm nằm trong khoảng 67–72 cm của size M/);
});

test('sự cố AI (A2): mặc định mở biểu mẫu nhập số đo thủ công, giữ số đo đã có, KHÔNG tự đọc tin nhắn', async () => {
  for (const code of ['TIMEOUT', 'NETWORK', 'HTTP_ERROR', 'INVALID_RESPONSE']) {
    const boom = async () => { throw Object.assign(new Error('x'), { code }); };
    const r = await say('Mình cao 1m60, nặng 47kg, ngực 84 eo 64 hông 90, muốn mua áo sơ mi cổ nơ', boom); // không truyền localFallback
    assert.equal(r.fallback, true); assert.equal(r.degraded, false); assert.equal(r.aiError, code);
    assert.equal(r.reply.cards[0].type, 'form'); assert.equal(r.reply.cards[0].prefill.productId, 'sp10');
    assert.match(r.reply.text, /sự cố/); assert.doesNotMatch(r.reply.text, /đề xuất/);
  }
});

test('(tùy chọn) CHAT_LOCAL_FALLBACK=true: AI lỗi vẫn đọc tin nhắn bằng bộ phân tích cơ bản và báo rõ cho khách', async () => {
  const boom = async () => { throw Object.assign(new Error('x'), { code: 'NETWORK' }); };
  let r = await say('Mình cao 1m60, nặng 47kg, ngực 84 eo 64 hông 90, muốn mua áo sơ mi cổ nơ', boom, {}, { localFallback: true });
  assert.equal(r.fallback, false); assert.equal(r.degraded, true); assert.equal(r.aiError, 'NETWORK');
  assert.equal(r.reply.cards[0].status, 'OK'); assert.equal(r.reply.cards[0].size, 'S');
  assert.match(r.reply.text, /chưa kết nối được nên mình đang đọc tin nhắn theo cách cơ bản/);
  assert.ok(r.reply.quickReplies.some((q) => q.action === 'form'));
  r = await say('mình cao 1m60 nặng 47kg muốn mua áo sơ mi cổ nơ', boom, {}, { localFallback: true });
  assert.equal(r.reply.cards[0].status, 'OK'); assert.equal(r.reply.cards[0].size, 'S');
  assert.equal(r.reply.cards[0].complete, false);
  r = await say('asdkjh qwe', boom, {}, { localFallback: true }); // không hiểu gì -> biểu mẫu
  assert.equal(r.fallback, true); assert.equal(r.reply.cards[0].type, 'form');
});

// ===========================================================================
// Kiểm tra chéo số đo AI (model chạy trên máy nhỏ, dễ đọc sai / bịa số)
// ===========================================================================
test('số đo chỉ AI "tìm ra" mà tin nhắn không hề có -> bị bỏ (chống bịa số)', async () => {
  // khách chỉ nói chiều cao; AI bịa thêm ngực/eo/hông/cân nặng
  const r = await say('mình cao 1m60, muốn mua áo sơ mi cổ nơ', ai(ent({ height: 160, weight: 47, chest: 84, waist: 64, hip: 90 }, { productReference: 'áo sơ mi cổ nơ' })));
  assert.deepEqual(r.state.measurements, { height: 160 });
  assert.equal(r.reply.cards[0].status, 'AMBIGUOUS');
  assert.equal(r.reply.cards[0].size, undefined);
  assert.match(r.reply.text, /S, M và L/);
});

test('luật đọc số đo được ưu tiên khi AI đọc khác (AI đọc nhầm hông thành ngực)', async () => {
  const wrong = ent({ height: 160, weight: 47, chest: 90, waist: 64, hip: 84 }, { productReference: 'áo sơ mi cổ nơ' }); // đảo ngực/hông
  const r = await say('cao 1m60 nặng 47kg ngực 84 eo 64 hông 90 áo sơ mi cổ nơ', ai(wrong));
  assert.deepEqual(r.state.measurements, FULL); assert.equal(r.reply.cards[0].size, 'S');
});

test('số chỉ AI hiểu được (cách viết lạ) vẫn được nhận nếu con số có trong tin nhắn', async () => {
  // luật cục bộ không hiểu "chiều cao một mét sáu"... nhưng con số 160 xuất hiện trong "160/47kg": AI gán đúng thì nhận
  const r = await say('hôm nay 160/47kg, số đo 84 64 90, áo sơ mi cổ nơ', ai(ent(FULL, { productReference: 'áo sơ mi cổ nơ' })));
  assert.equal(r.reply.cards[0].size, 'S');
});

test('trả lời cộc lốc theo câu hỏi của trợ lý: "52" khi vừa hỏi cân nặng', async () => {
  const extract = ai(ent({ weight: 52 }));
  const r = await say('52', extract, { productId: 'sp10', measurements: { height: 160, chest: 84, waist: 64, hip: 90 }, askedFor: ['weight'] });
  assert.equal(r.state.measurements.weight, 52); assert.deepEqual(extract.calls[0].askedFor, ['weight']);
  // tùy chọn CHAT_LOCAL_FALLBACK=true: AI lỗi vẫn đọc được nhờ luật
  const boom = async () => { throw Object.assign(new Error('x'), { code: 'TIMEOUT' }); };
  const r2 = await say('52', boom, { productId: 'sp10', measurements: { height: 160, chest: 84, waist: 64, hip: 90 }, askedFor: ['weight'] }, { localFallback: true });
  assert.equal(r2.state.measurements.weight, 52);
  // mặc định (đặc tả A2): AI lỗi -> biểu mẫu, giữ số đo đã có
  const r3 = await say('52', boom, { productId: 'sp10', measurements: { height: 160, chest: 84, waist: 64, hip: 90 }, askedFor: ['weight'] });
  assert.equal(r3.fallback, true); assert.equal(r3.reply.cards[0].type, 'form');
});

// ==================== Kiểm thử yêu cầu tư vấn size linh hoạt ====================
test('không có số đo: không đưa size, không bịa thông số', () => {
  const result = advisor.recommend({ measurements: {}, product: catalog[3], chart });
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.size, undefined);
});

test('chỉ chiều cao: các size đều khớp, chatbot không tự chọn', async () => {
  const r = await say('mình cao 160cm muốn áo sơ mi cổ nơ', ai(ent({ height: 160 }, { productReference: 'áo sơ mi cổ nơ' })));
  assert.equal(r.reply.cards[0].status, 'AMBIGUOUS');
  assert.deepEqual(r.reply.cards[0].candidates, ['S', 'M', 'L']);
  assert.equal(r.reply.cards[0].size, undefined);
  assert.ok(r.state.askedFor.length > 0);
});

test('chỉ số đo vòng ngực: size duy nhất trong bảng được đề xuất có cảnh báo', async () => {
  const r = await say('vòng ngực 86 muốn mua áo sơ mi cổ nơ', ai(ent({ chest: 86 }, { productReference: 'áo sơ mi cổ nơ' })));
  assert.equal(r.reply.cards[0].status, 'OK'); assert.equal(r.reply.cards[0].size, 'M');
  assert.equal(r.reply.cards[0].complete, false);
  assert.equal(r.reply.cards[0].evidence.length, 1);
});

test('không có size khớp số đo hiện có: không chọn size gần nhất', async () => {
  const r = await say('mình ngực 100cm, eo 62cm mua áo sơ mi cổ nơ', ai(ent({ chest: 100, waist: 62 }, { productReference: 'áo sơ mi cổ nơ' })));
  assert.equal(r.reply.cards[0].status, 'NO_MATCH'); assert.equal(r.reply.cards[0].size, undefined);
  assert.doesNotMatch(r.reply.text, /đề xuất \*\*size/);
});

test('bảng size thiếu khoảng đo ở ứng viên khác: không loại bỏ size có dữ liệu thiếu để chốt bừa', () => {
  const incompleteChart = [
    R('S', [150, 165], [40, 55], [null, null], [60, 70], [84, 95]),
    R('M', [150, 165], [40, 55], [85, 90], [60, 70], [84, 95]),
  ];
  const result = advisor.recommend({ measurements: { chest: 86, height: 160 }, product: { sizes: ['S', 'M'] }, chart: incompleteChart });
  assert.equal(result.status, 'NO_CHART'); assert.equal(result.size, undefined);
});

test('biểu mẫu nhập 1 chỉ số, các chỉ số còn thiếu được bổ sung từ hồ sơ nếu có', async () => {
  const r = await adviseManual({
    productId: 'sp10', measurements: { chest: 84 }, catalog, chart,
    loadSaved: async () => ({ height: 160, weight: 47 }),
  });
  assert.equal(r.ok, true); assert.equal(r.reply.cards[0].status, 'OK');
  assert.equal(r.reply.cards[0].size, 'S'); assert.equal(r.reply.cards[0].complete, false);
  assert.deepEqual(r.reply.cards[0].fromProfile, ['height', 'weight']);
});

test('số đo khách nhập thủ công ưu tiên hơn hồ sơ, không tư vấn sai theo giá trị cũ', async () => {
  const r = await adviseManual({
    productId: 'sp10', measurements: { weight: 52, chest: 88, waist: 70, hip: 94 },
    state: { measurements: { height: 160 } }, catalog, chart,
    loadSaved: async () => FULL,
  });
  assert.equal(r.ok, true); assert.equal(r.reply.cards[0].size, 'M');
});

test('hồ sơ đã thay đổi sau lượt chat trước: cập nhật các chỉ số lấy từ hồ sơ', async () => {
  const savedNow = async () => ({ height: 163, weight: 52, chest: 87, waist: 68, hip: 94 });
  const state = { productId: 'sp10', measurements: FULL, fromProfile: ['height','weight','chest','waist','hip'] };
  const r = await say('tư vấn lại size áo sơ mi cổ nơ', ai(ent({}, { productReference: 'áo sơ mi cổ nơ' })), state, { loadSaved: savedNow });
  assert.equal(r.reply.cards[0].size, 'M');
  assert.equal(r.state.measurements.weight, 52);
  assert.equal(r.state.measurements.chest, 87);
});
