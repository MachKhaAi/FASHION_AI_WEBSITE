// Chạy: node --test backend/tests   (Node 18+, không cần cài thêm gì)
const test = require('node:test');
const assert = require('node:assert/strict');
const nlu = require('../utils/sizeChatNlu');
const { handleMessage } = require('../utils/sizeChatEngine');

// Bảng size lấy từ bảng size_charts của cửa hàng
const R = (size, h, w, c, wa, hi) => ({ size, ranges: { height: h, weight: w, chest: c, waist: wa, hip: hi } });
const chart = [
  R('S', [150, 160], [40, 48], [78, 84], [60, 66], [84, 90]),
  R('M', [156, 165], [48, 55], [85, 90], [67, 72], [91, 96]),
  R('L', [160, 170], [55, 63], [91, 97], [73, 79], [97, 103]),
  R('XL', [165, 175], [63, 73], [98, 106], [80, 88], [104, 112]),
];
const P = (id, name, categoryId, categoryName, sizes, colors, stock = 10, extra = {}) => ({
  id, name, categoryId, categoryName, price: 359000, oldPrice: 0, image: `/images/products/${id}.jpg`, featured: false,
  sizes, colors, variants: sizes.flatMap((s) => colors.map((c) => ({ size: s, color: c, stock: typeof stock === 'function' ? stock(s, c) : stock }))), ...extra,
});
const catalog = [
  P('sp1', 'Áo sơ mi nữ công sở thanh lịch', 'ao', 'Áo nữ', ['S', 'M', 'L'], ['Trắng', 'Xanh navy']),
  P('sp4', 'Váy babydoll hoa nhí', 'dam', 'Đầm', ['S', 'M', 'L'], ['Hoa nhí', 'Trắng'], 10, { featured: true }),
  P('sp6', 'Chân váy xếp ly', 'chan-vay', 'Chân váy', ['S', 'M', 'L'], ['Xám', 'Nâu']),
  P('sp8', 'Túi tote da mềm', 'phu-kien', 'Phụ kiện', ['One size'], ['Nâu']),
  P('sp10', 'Áo sơ mi cổ nơ', 'ao', 'Áo nữ', ['S', 'M', 'L', 'XL'], ['Trắng', 'Hồng', 'Đen'], (s, c) => (s === 'S' && c === 'Hồng' ? 0 : 8), { featured: true }),
  P('sp11', 'Quần ống rộng lưng cao', 'quan', 'Quần', ['S', 'M', 'L', 'XL'], ['Đen', 'Be xám']),
  P('sp14', 'Chân váy chữ A Bella', 'chan-vay', 'Chân váy', ['S', 'M', 'L', 'XL'], ['Đen', 'Nâu']),
  P('sp17', 'Đầm suông thanh lịch Iris', 'dam', 'Đầm', ['S', 'M', 'L', 'XL'], ['Xanh nhạt'], (s) => (s === 'XL' || s === 'L' ? 0 : 6)),
];
const say = (message, state = {}, extra = {}) => handleMessage({ message, state, catalog, chart, ...extra });

test('trích xuất số đo từ nhiều cách nói', () => {
  const ex = (t, o) => nlu.extractMeasurements(t, o).values;
  assert.deepEqual(ex('mình cao 1m60 nặng 52kg'), { height: 160, weight: 52 });
  assert.deepEqual(ex('1.58m 48 cân'), { height: 158, weight: 48 });
  assert.deepEqual(ex('số đo 84-64-90'), { chest: 84, waist: 64, hip: 90 });
  assert.deepEqual(ex('vòng 1 84, vòng 2 64, vòng 3 90'), { chest: 84, waist: 64, hip: 90 });
  assert.deepEqual(ex('mông 100cm'), { hip: 100 });
  assert.deepEqual(ex('160 52'), { height: 160, weight: 52 });
  assert.deepEqual(ex('52', { awaiting: 'weight' }), { weight: 52 });
  assert.deepEqual(nlu.extractMeasurements('cao 300cm').invalid, [{ key: 'height', value: 300 }]);
});

test('nhận diện sản phẩm: chính xác, mơ hồ, sai chính tả, mã', () => {
  assert.equal(nlu.resolveProduct('mình muốn mua áo sơ mi cổ nơ', catalog).product.id, 'sp10');
  assert.equal(nlu.resolveProduct('chân váy xếp ly size M', catalog).product.id, 'sp6');
  assert.equal(nlu.resolveProduct('váy babydol hoa nhi', catalog).product.id, 'sp4');
  assert.equal(nlu.resolveProduct('cho mình hỏi sp11', catalog).product.id, 'sp11');
  const amb = nlu.resolveProduct('áo sơ mi', catalog);
  assert.equal(amb.product, null); assert.equal(amb.ambiguous, true);
  assert.deepEqual(amb.candidates.map((p) => p.id).sort(), ['sp1', 'sp10']);
  assert.equal(nlu.resolveProduct('hôm nay trời đẹp', catalog).product, null);
});

test('câu đầy đủ: nhận diện ý định, số đo, sản phẩm rồi tư vấn bằng bảng size', async () => {
  const r = await say('Mình cao 1m60, nặng 47kg, ngực 84 eo 64 hông 90, muốn mua áo sơ mi cổ nơ');
  assert.equal(r.intent, 'size_advice');
  assert.equal(r.extracted.product.id, 'sp10');
  assert.equal(r.extracted.measurements.length, 5);
  const card = r.reply.cards.find((c) => c.type === 'advice');
  assert.equal(card.size, 'S'); assert.equal(card.confidence, 'high');
  assert.match(r.reply.text, /size S/); assert.match(r.reply.text, /Vì sao/);
  assert.equal(r.extracted.color, null); assert.doesNotMatch(r.reply.text, /Màu \*\*Hồng/); // "hông 90" không phải màu Hồng
  assert.match(r.reply.text, /Vòng ngực 84 cm nằm trong khoảng 78–84 cm/);
  assert.equal(r.state.productId, 'sp10');
});

test('hội thoại nhiều lượt: nhớ sản phẩm và số đo', async () => {
  let r = await say('mình muốn mua quần ống rộng lưng cao');
  assert.equal(r.state.productId, 'sp11'); assert.equal(r.state.awaiting, 'measure');
  assert.match(r.reply.text, /chiều cao và cân nặng/);
  r = await say('1m65 56kg', r.state);
  assert.equal(r.reply.cards[0].type, 'advice'); assert.equal(r.reply.cards[0].product.id, 'sp11');
  const first = r.reply.cards[0].size;
  r = await say('mình thích mặc rộng hơn', r.state);
  assert.notEqual(r.reply.cards[0].size, first);
  assert.match(r.reply.text, /tăng lên 1 size/);
  r = await say('tại sao lại chọn size này?', r.state);
  assert.equal(r.intent, 'explain'); assert.match(r.reply.text, /Nếu chọn size khác/);
});

test('quần/váy không dùng vòng ngực để so sánh', async () => {
  const r = await say('ngực 100 eo 64 hông 90 muốn mua chân váy xếp ly');
  assert.equal(r.reply.cards[0].size, 'S');
  assert.match(r.reply.text, /không ảnh hưởng/);
});

test('số đo lệch nhau: ưu tiên số đo lớn hơn hoặc chọn size cân bằng, giải thích rõ', async () => {
  // hòa điểm -> chọn size lớn hơn, nói rõ ưu tiên vòng hông
  let r = await say('ngực 90 eo 70 hông 100 mình muốn mua váy babydoll hoa nhí');
  assert.equal(r.reply.cards[0].size, 'L');
  assert.match(r.reply.text, /ưu tiên vòng hông/);
  // lệch nhiều -> size cân bằng, nói rõ phần sẽ hơi chật và gợi ý size rộng hơn
  r = await say('ngực 84 eo 64 hông 100 mình muốn mua váy babydoll hoa nhí');
  assert.equal(r.reply.cards[0].size, 'M');
  assert.match(r.reply.text, /chưa đồng đều/); assert.match(r.reply.text, /cân bằng/); assert.match(r.reply.text, /size L/);
});

test('size hết hàng: gợi ý size gần nhất còn hàng', async () => {
  const r = await say('ngực 94 eo 76 hông 100 mua đầm suông thanh lịch iris');
  const card = r.reply.cards[0];
  assert.equal(card.size, 'L'); assert.equal(card.stock.status, 'out'); assert.equal(card.stock.suggestion, 'M');
  assert.equal(card.actions[0].size, 'M');
  assert.match(r.reply.text, /hết hàng/);
});

test('sản phẩm one size / phụ kiện', async () => {
  const r = await say('mình cao 1m60 nặng 50kg muốn mua túi tote da mềm');
  assert.match(r.reply.text, /không cần chọn size/);
});

test('mơ hồ: hỏi lại khách chọn sản phẩm nào, nhớ số đo', async () => {
  let r = await say('mình cao 1m60 nặng 50kg muốn mua áo sơ mi');
  assert.equal(r.reply.cards[0].type, 'products'); assert.equal(r.reply.cards[0].items.length, 2);
  assert.match(r.reply.text, /ghi nhận số đo/);
  r = await say('Mình muốn mua Áo sơ mi cổ nơ', r.state);
  assert.equal(r.reply.cards[0].type, 'advice'); assert.equal(r.reply.cards[0].product.id, 'sp10');
});

test('hỏi size cụ thể và còn hàng theo màu', async () => {
  let r = await say('áo sơ mi cổ nơ cao 1m60 nặng 50kg size M có vừa không?');
  assert.match(r.reply.text, /Size M/);
  r = await say('còn size S màu hồng không', { productId: 'sp10' });
  assert.equal(r.intent, 'stock'); assert.match(r.reply.text, /hết hàng/);
  r = await say('còn size S màu trắng không', { productId: 'sp10' });
  assert.match(r.reply.text, /còn 8 sản phẩm/);
});

test('nhận diện màu: nhạy dấu, nhận cả "mau hong" không dấu', () => {
  const colors = ['Trắng', 'Hồng', 'Đen'];
  assert.equal(nlu.detectColor('ngực 84 eo 64 hông 90', colors), null);
  assert.equal(nlu.detectColor('còn màu hồng không?', colors), 'Hồng');
  assert.equal(nlu.detectColor('co mau hong khong', colors), 'Hồng');
  assert.equal(nlu.detectColor('cho mình màu đen nhé', colors), 'Đen');
});

test('số đo không hợp lệ được báo lại', async () => {
  const r = await say('mình cao 300cm nặng 50kg muốn mua áo sơ mi cổ nơ');
  assert.match(r.reply.text, /Chiều cao 300 cm chưa hợp lý/);
});

test('các ý định khác', async () => {
  assert.equal((await say('xin chào')).intent, 'greeting');
  assert.equal((await say('cảm ơn bạn')).intent, 'thanks');
  assert.equal((await say('cách đo vòng ngực')).intent, 'measure_help');
  const c = await say('cho mình xem bảng size', { productId: 'sp10' });
  assert.equal(c.reply.cards[0].type, 'chart'); assert.equal(c.reply.cards[0].rows.length, 4);
  assert.equal((await say('áo này giá bao nhiêu', { productId: 'sp10' })).intent, 'product_info');
  const rs = await say('làm lại', { productId: 'sp10', measurements: { height: 160 } });
  assert.equal(rs.state.productId, null); assert.deepEqual(rs.state.measurements, {});
  assert.equal((await say('asdkjh qwe')).intent, 'unknown');
});

test('dùng số đo đã lưu trong hồ sơ khi khách chưa nói', async () => {
  const r = await say('tư vấn size cho mình áo sơ mi cổ nơ', {}, { loadSaved: async () => ({ height: 160, weight: 50, chest: 84, waist: 64, hip: 90 }) });
  assert.equal(r.reply.cards[0].size, 'S'); assert.match(r.reply.text, /số đo bạn lưu trong hồ sơ/);
});

test('state không hợp lệ bị làm sạch', async () => {
  const r = await say('xin chào', { measurements: { height: 9999, chest: 'abc' }, productId: { x: 1 } });
  assert.deepEqual(r.state.measurements, {}); assert.equal(r.state.productId, null);
});
