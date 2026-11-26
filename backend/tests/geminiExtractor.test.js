// Kiểm thử bộ gọi Gemini bằng máy chủ GIẢ (không tốn hạn mức, không cần mạng).
// Chạy: node --test backend/tests/geminiExtractor.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const gx = require('../utils/geminiExtractor');
const { handleMessage, adviseManual } = require('../utils/sizeChatEngine');

// ---- máy chủ giả mô phỏng POST /v1beta/models/<model>:generateContent ----
function startMock(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const parsed = body ? JSON.parse(body) : null;
      seen.push({ url: req.url, method: req.method, headers: req.headers, body: parsed });
      await handler(req, res, parsed, seen.length);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, baseUrl: `http://127.0.0.1:${server.address().port}/v1beta` })));
}
const json = (res, obj, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
const reply = (res, content, extra = {}) => json(res, { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: typeof content === 'string' ? content : JSON.stringify(content) }] } }], ...extra });
const apiError = (res, status, message, statusText, reason) => json(res, { error: { code: status, message, status: statusText, ...(reason ? { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] } : {}) } }, status);
const GOOD = { intent: 'size_advice', height_cm: 160, weight_kg: 47, chest_cm: 84, waist_cm: 64, hip_cm: 90, product_reference: 'áo sơ mi cổ nơ', color: null, asked_size: null, correction: false };
const KEY = 'AIzaTestKey123';
const cfg = (baseUrl, over = {}) => ({ apiKey: KEY, model: 'gemini-3.8-flash', baseUrl, timeoutMs: 400, naturalReply: false, ...over });
const close = (m) => new Promise((r) => m.server.close(r));

test('thành công: gửi đúng yêu cầu generateContent (schema JSON, khóa trong header) và nhận thực thể đã kiểm tra', async () => {
  const m = await startMock((req, res) => reply(res, GOOD));
  const out = await gx.extractEntities({ message: 'Mình cao 1m60 nặng 47kg ...', currentProduct: 'Áo sơ mi cổ nơ', knownMeasurements: { chest: 84 }, askedFor: ['waist'] }, { config: cfg(m.baseUrl) });
  await close(m);
  assert.deepEqual(out.measurements, { height: 160, weight: 47, chest: 84, waist: 64, hip: 90 });
  assert.equal(out.productReference, 'áo sơ mi cổ nơ'); assert.equal(out.intent, 'size_advice');

  const r = m.seen[0];
  assert.equal(r.method, 'POST'); assert.equal(r.url, '/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(r.headers['x-goog-api-key'], KEY);
  assert.ok(!r.url.includes(KEY), 'khóa không được nằm trong URL');
  assert.equal(r.headers.authorization, undefined);
  const gc = r.body.generationConfig;
  assert.equal(gc.temperature, 0); assert.equal(gc.responseMimeType, 'application/json');
  assert.equal(gc.responseSchema.type, 'OBJECT'); assert.equal(gc.responseSchema.properties.height_cm.nullable, true);
  assert.deepEqual(gc.thinkingConfig, { thinkingLevel: 'minimal' }); // Gemini 3.x
  assert.match(r.body.systemInstruction.parts[0].text, /KHÔNG tư vấn size/);
  assert.equal(r.body.contents[0].role, 'user');
});

test('bảo mật: chỉ gửi tin nhắn, tên sản phẩm, số đo (số) và chỉ số vừa hỏi; không gửi token / mật khẩu / định danh', async () => {
  const m = await startMock((req, res) => reply(res, GOOD));
  await gx.extractEntities({ message: 'cao 1m60', currentProduct: null, knownMeasurements: { height: 160 }, askedFor: [], token: 'JWT.SECRET', password: 'p', email: 'a@b.c', userId: 'u1' }, { config: cfg(m.baseUrl) });
  await close(m);
  const sent = JSON.stringify(m.seen[0].body);
  for (const secret of ['JWT.SECRET', 'a@b.c', 'u1', '"password"', KEY]) assert.ok(!sent.includes(secret), `không được gửi ${secret}`);
  assert.deepEqual(Object.keys(JSON.parse(m.seen[0].body.contents[0].parts[0].text)).sort(), ['asked_for', 'current_product', 'known_measurements', 'message']);
});

test('quá thời gian chờ (>timeout) -> TIMEOUT để chuyển sang chế độ dự phòng', async () => {
  const m = await startMock((req, res) => setTimeout(() => reply(res, GOOD), 1500));
  const t0 = Date.now();
  await assert.rejects(gx.extractEntities({ message: 'x1' }, { config: cfg(m.baseUrl, { timeoutMs: 250 }) }), (e) => e.code === 'TIMEOUT');
  assert.ok(Date.now() - t0 < 1000, 'không được chờ quá hạn');
  m.server.closeAllConnections?.(); await close(m);
});

test('lỗi HTTP (401/403/429/500) -> HTTP_ERROR, không lộ chi tiết / khóa trong message', async () => {
  for (const status of [401, 403, 429, 500]) {
    const m = await startMock((req, res) => { res.statusCode = status; res.end('{"error":{"message":"secret detail"}}'); });
    await assert.rejects(gx.extractEntities({ message: 'x1' }, { config: cfg(m.baseUrl) }), (e) => e.code === 'HTTP_ERROR' && !String(e.message).includes('secret detail') && !String(e.message).includes(KEY));
    await close(m);
  }
});

test('JSON sai định dạng / sai kiểu / bị chặn / bị cắt -> INVALID_RESPONSE', async () => {
  const bad = [
    (res) => reply(res, 'đây không phải JSON'),
    (res) => reply(res, { ...GOOD, height_cm: '160' }),            // số viết dạng chuỗi
    (res) => reply(res, { ...GOOD, product_reference: 123 }),
    (res) => reply(res, [1, 2, 3]),
    (res) => json(res, { promptFeedback: { blockReason: 'SAFETY' } }),                                    // bị chặn từ đầu
    (res) => json(res, { candidates: [{ finishReason: 'SAFETY' }] }),                                     // bị chặn khi sinh
    (res) => json(res, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"intent":' }] } }] }), // bị cắt
    (res) => json(res, { candidates: [] }),
    (res) => { res.setHeader('Content-Type', 'application/json'); res.end('<html>502</html>'); },
  ];
  for (const send of bad) {
    const m = await startMock((req, res) => send(res));
    await assert.rejects(gx.extractEntities({ message: 'x1' }, { config: cfg(m.baseUrl) }), (e) => e.code === 'INVALID_RESPONSE');
    await close(m);
  }
});

test('bỏ qua phần "thought" và chấp nhận JSON bọc trong ```json', async () => {
  const m = await startMock((req, res) => json(res, { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'đang suy nghĩ...' }, { text: '```json\n' + JSON.stringify(GOOD) + '\n```' }] } }] }));
  const out = await gx.extractEntities({ message: 'x1' }, { config: cfg(m.baseUrl) });
  await close(m);
  assert.equal(out.measurements.waist, 64);
});

test('mất kết nối -> NETWORK; chưa cấu hình khóa -> NO_API_KEY (và không gửi yêu cầu nào)', async () => {
  await assert.rejects(gx.extractEntities({ message: 'x1' }, { config: cfg('http://127.0.0.1:1/v1beta') }), (e) => e.code === 'NETWORK');
  const m = await startMock((req, res) => reply(res, GOOD));
  await assert.rejects(gx.extractEntities({ message: 'x1' }, { config: cfg(m.baseUrl, { apiKey: '' }) }), (e) => e.code === 'NO_API_KEY');
  await close(m);
  assert.equal(m.seen.length, 0);
});

test('cấu hình đọc từ biến môi trường: mặc định chờ 5 giây, diễn đạt tự nhiên bật sẵn', () => {
  const c = gx.getConfig({ GEMINI_API_KEY: ' AIzaX ', GEMINI_MODEL: 'models/gemini-2.5-flash-lite', GEMINI_BASE_URL: 'https://proxy.example/v1beta/', GEMINI_NATURAL_REPLY: 'TRUE' });
  assert.equal(gx.getConfig({ GEMINI_NATURAL_REPLY: 'false' }).naturalReply, false); assert.equal(gx.getConfig({}).naturalReply, true);
  assert.deepEqual(c, { apiKey: 'AIzaX', model: 'gemini-2.5-flash-lite', baseUrl: 'https://proxy.example/v1beta', timeoutMs: 5000, naturalReply: true, proxy: '' });
  assert.equal(gx.getConfig({ GEMINI_TIMEOUT_MS: '5000' }).timeoutMs, 5000);
  assert.equal(gx.getConfig({}).model, 'gemini-3.8-flash'); assert.equal(gx.getConfig({}).apiKey, '');
  assert.equal(gx.getConfig({}).baseUrl, 'https://generativelanguage.googleapis.com/v1beta');
});

test('intent lạ -> other; thiếu khóa trong JSON vẫn chấp nhận (coi như null)', () => {
  const v = gx.validateExtraction({ intent: 'hack', height_cm: 160 });
  assert.equal(v.intent, 'other'); assert.deepEqual(v.measurements, { height: 160 }); assert.equal(v.productReference, null);
});

test('không còn trích xuất sở thích rộng / ôm: schema và kết quả không có fit_preference', () => {
  const props = Object.keys(gx.__schema?.properties || {});
  const v = gx.validateExtraction({ intent: 'size_advice', fit_preference: 'loose' });
  assert.equal('fitPreference' in v, false); assert.ok(!props.includes('fit_preference'));
});

test('diễn đạt tự nhiên bị giới hạn theo thời gian còn lại của lượt (tổng không quá 5 giây)', async () => {
  const m = await startMock((req, res) => setTimeout(() => reply(res, { text: 'Size S là hợp nhất.' }), 1200));
  const t0 = Date.now();
  const out = await gx.polishAnswer({ size: 'S', matched: ['S'], product: 'X', measurements: {}, status: 'OK' }, { config: cfg(m.baseUrl, { naturalReply: true, timeoutMs: 5000 }), timeoutMs: 400 });
  assert.equal(out, null); assert.ok(Date.now() - t0 < 1000, 'phải ngắt theo phần thời gian còn lại, không chờ đủ 5 giây');
  m.server.closeAllConnections?.(); await close(m);
});

test('(tùy chọn) AI viết lại: chấp nhận bản trung thành, loại bản thêm size/số liệu lạ', async () => {
  const facts = { size: 'S', matched: ['S'], product: 'Áo sơ mi cổ nơ', measurements: { height: 160, chest: 84 }, status: 'OK' };
  const run = async (text, over = {}) => {
    const m = await startMock((req, res) => reply(res, { text }));
    const out = await gx.polishAnswer(facts, { config: cfg(m.baseUrl, { naturalReply: true, ...over }) });
    await close(m); return out;
  };
  assert.equal(await run('Với số đo của bạn, size S là lựa chọn vừa vặn cho Áo sơ mi cổ nơ nhé!'), 'Với số đo của bạn, size S là lựa chọn vừa vặn cho Áo sơ mi cổ nơ nhé!');
  assert.equal(await run('Mình nghĩ size M sẽ hợp hơn.'), null);
  assert.equal(await run('Size S nhưng bạn cũng có thể thử size L.'), null);
  assert.equal(await run('Size S, giảm giá 50% hôm nay!'), null);
  assert.equal(await run('Hãy xem tại http://evil.example size S'), null);
  assert.equal(await run('Size S là hợp nhất.', { naturalReply: false }), null);
});

test('tích hợp: engine + Gemini giả -> tư vấn; Gemini chậm (>timeout) -> mở biểu mẫu thủ công', async () => {
  const chart = [{ size: 'S', ranges: { height: [150, 160], weight: [40, 48], chest: [78, 84], waist: [60, 66], hip: [84, 90] } }];
  const catalog = [{ id: 'sp10', name: 'Áo sơ mi cổ nơ', categoryId: 'ao', categoryName: 'Áo', price: 1, oldPrice: 0, image: 'x', featured: false, sizes: ['S'], colors: ['Trắng'], variants: [{ size: 'S', color: 'Trắng', stock: 9 }] }];
  let slow = false;
  const m = await startMock((req, res) => (slow ? setTimeout(() => reply(res, GOOD), 1200) : reply(res, GOOD)));
  try {
    const config = cfg(m.baseUrl, { timeoutMs: 300 });
    const extract = (input) => gx.extractEntities(input, { config });
    const msg = 'Mình cao 1m60 nặng 47kg ngực 84 eo 64 hông 90, áo sơ mi cổ nơ';
    let r = await handleMessage({ message: msg, state: {}, catalog, chart, extract });
    assert.equal(r.fallback, false); assert.equal(r.degraded, false); assert.equal(r.reply.cards[0].size, 'S');

    slow = true; // Gemini quá chậm -> TIMEOUT: đặc tả 1.2.2.7 (A2) mở biểu mẫu nhập số đo thủ công
    r = await handleMessage({ message: msg, state: {}, catalog, chart, extract });
    assert.equal(r.fallback, true); assert.equal(r.degraded, false); assert.equal(r.aiError, 'TIMEOUT'); assert.equal(r.reply.cards[0].type, 'form');
    assert.deepEqual(r.reply.cards[0].prefill.measurements, { height: 160, weight: 47, chest: 84, waist: 64, hip: 90 });

    // tùy chọn CHAT_LOCAL_FALLBACK=true: vẫn đọc tin nhắn bằng bộ phân tích cơ bản
    r = await handleMessage({ message: msg, state: {}, catalog, chart, extract, localFallback: true });
    assert.equal(r.degraded, true); assert.equal(r.reply.cards[0].size, 'S');
    assert.match(r.reply.text, /đọc tin nhắn theo cách cơ bản/);
  } finally {
    m.server.closeAllConnections?.();
    await close(m);
  }
});

test('hết hạn mức Free Tier (429) -> chatbot mở biểu mẫu thủ công, khách vẫn được tư vấn qua biểu mẫu', async () => {
  const chart = [{ size: 'S', ranges: { height: [150, 160], weight: [40, 48], chest: [78, 84], waist: [60, 66], hip: [84, 90] } }];
  const catalog = [{ id: 'sp10', name: 'Áo sơ mi cổ nơ', categoryId: 'ao', categoryName: 'Áo', price: 1, oldPrice: 0, image: 'x', featured: false, sizes: ['S'], colors: ['Trắng'], variants: [{ size: 'S', color: 'Trắng', stock: 9 }] }];
  const m = await startMock((req, res) => apiError(res, 429, 'You exceeded your current quota', 'RESOURCE_EXHAUSTED'));
  const r = await handleMessage({ message: 'Mình cao 1m60 nặng 47kg ngực 84 eo 64 hông 90, áo sơ mi cổ nơ', state: {}, catalog, chart, extract: (i) => gx.extractEntities(i, { config: cfg(m.baseUrl) }) });
  await close(m);
  assert.equal(r.fallback, true); assert.equal(r.aiError, 'HTTP_ERROR'); assert.equal(r.reply.cards[0].type, 'form');
  // biểu mẫu dùng cùng thuật toán, không cần AI
  const manual = await adviseManual({ productId: 'sp10', measurements: { height: 160, weight: 47, chest: 84, waist: 64, hip: 90 }, catalog, chart });
  assert.equal(manual.reply.cards[0].size, 'S');
});

test('chẩn đoán: khóa sai / hết hạn mức / limit 0 / sai model / vùng không hỗ trợ có mã, chi tiết và gợi ý tiếng Việt', async () => {
  const cases = [
    [400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT', 'API_KEY_INVALID', /Khóa API không hợp lệ/],
    [429, 'You exceeded your current quota, please check your plan and billing details.', 'RESOURCE_EXHAUSTED', null, /Hết hạn mức gói miễn phí/],
    [429, 'Quota exceeded for metric ... limit: 0, model: gemini-2.5-pro', 'RESOURCE_EXHAUSTED', null, /limit: 0/],
    [404, 'This model models/gemini-2.5-flash is no longer available to new users.', 'NOT_FOUND', null, /Model không tồn tại/],
    [403, 'Permission denied', 'PERMISSION_DENIED', null, /từ chối/],
    [400, 'User location is not supported for the API use.', 'FAILED_PRECONDITION', null, /Khu vực/],
    [503, 'The model is overloaded.', 'UNAVAILABLE', null, /quá tải|sự cố tạm thời/],
  ];
  for (const [status, message, statusText, reason, hint] of cases) {
    const m = await startMock((req, res) => apiError(res, status, message, statusText, reason));
    let err;
    try { await gx.extractEntities({ message: 'x1' }, { config: cfg(m.baseUrl) }); } catch (e) { err = e; }
    await close(m);
    assert.equal(err.code, 'HTTP_ERROR'); assert.equal(err.status, status); assert.equal(err.apiCode, reason || statusText); assert.ok(err.detail.length > 5);
    assert.match(gx.explainAIError(err), hint);
    assert.ok(!String(err.message).includes(err.detail), 'chi tiết không được nằm trong message');
  }
});

test('gợi ý cho từng loại lỗi kết nối', () => {
  const e = (code, extra = {}) => gx.explainAIError({ code, ...extra });
  assert.match(e('NO_API_KEY'), /GEMINI_API_KEY/); assert.match(e('NO_API_KEY'), /KHỞI ĐỘNG LẠI backend/); assert.match(e('NO_FETCH'), /Node.js 18/);
  assert.match(e('TIMEOUT'), /GEMINI_TIMEOUT_MS/); assert.match(e('NETWORK'), /generativelanguage\.googleapis\.com/); assert.match(e('INVALID_RESPONSE'), /gemini-3\.8-flash/);
  assert.match(e('HTTP_ERROR', { status: 503 }), /sự cố tạm thời/);
});

test('Node quá cũ (không có fetch) -> NO_FETCH, không gửi yêu cầu', async () => {
  await assert.rejects(gx.extractEntities({ message: 'x1' }, { config: cfg('http://127.0.0.1:1/v1beta'), fetchImpl: null }), (e) => e.code === 'NO_FETCH');
});

test('model không nhận thinkingConfig (HTTP 400) -> tự bỏ thinkingConfig rồi thử lại', async () => {
  const m = await startMock((req, res, body, n) => {
    if (n === 1) return apiError(res, 400, 'Budget 0 is invalid. This model only works in thinking mode.', 'INVALID_ARGUMENT');
    reply(res, GOOD);
  });
  const out = await gx.extractEntities({ message: 'x1' }, { config: cfg(m.baseUrl, { timeoutMs: 1500 }) });
  await close(m);
  assert.equal(out.measurements.height, 160); assert.equal(m.seen.length, 2);
  assert.ok(m.seen[0].body.generationConfig.thinkingConfig); assert.ok(!('thinkingConfig' in m.seen[1].body.generationConfig));
  assert.ok(m.seen[1].body.generationConfig.responseSchema, 'vẫn giữ schema');
});

test('model không nhận responseSchema (HTTP 400) -> chỉ dùng JSON mode và nhắc các khóa trong lời nhắc', async () => {
  const m = await startMock((req, res, body, n) => {
    if (n === 1) return apiError(res, 400, 'Invalid JSON payload received. Unknown name "responseSchema": Cannot find field.', 'INVALID_ARGUMENT');
    reply(res, GOOD);
  });
  const out = await gx.extractEntities({ message: 'x1' }, { config: cfg(m.baseUrl, { timeoutMs: 1500 }) });
  await close(m);
  assert.equal(out.measurements.height, 160); assert.equal(m.seen.length, 2);
  assert.ok('responseSchema' in m.seen[0].body.generationConfig); assert.ok(!('responseSchema' in m.seen[1].body.generationConfig));
  assert.equal(m.seen[1].body.generationConfig.responseMimeType, 'application/json');
  assert.match(m.seen[1].body.systemInstruction.parts[0].text, /height_cm.*correction/);
});

test('HTTP 400 vì lý do khác: không thử lại, báo HTTP_ERROR kèm chi tiết', async () => {
  const m = await startMock((req, res) => apiError(res, 400, 'bad things', 'INVALID_ARGUMENT'));
  await assert.rejects(gx.extractEntities({ message: 'x1' }, { config: cfg(m.baseUrl) }), (e) => e.code === 'HTTP_ERROR' && e.status === 400 && e.detail === 'bad things');
  await close(m);
  assert.equal(m.seen.length, 1);
});

test('làm sạch khóa API dán vào .env: dấu nháy, khoảng trắng, xuống dòng, chữ Bearer', () => {
  for (const raw of ['AIzaAbc123', '"AIzaAbc123"', "'AIzaAbc123'", '  AIzaAbc123  ', 'AIzaAbc123\r\n', 'Bearer AIzaAbc123', ' "Bearer AIzaAbc123" ']) {
    assert.equal(gx.cleanKey(raw), 'AIzaAbc123', JSON.stringify(raw));
  }
  assert.equal(gx.getConfig({ GEMINI_API_KEY: '"AIzaAbc123"\r' }).apiKey, 'AIzaAbc123');
  assert.equal(gx.cleanKey(undefined), '');
});

test('probe (trang kiểm tra): báo thành công hoặc nguyên nhân lỗi kèm gợi ý, không lộ khóa', async () => {
  let m = await startMock((req, res) => reply(res, GOOD));
  let r = await gx.probe({ config: cfg(m.baseUrl, { timeoutMs: 2000 }) });
  await close(m);
  assert.equal(r.ok, true); assert.equal(r.correct, true); assert.equal(r.config.keyLength, KEY.length);
  assert.ok(!JSON.stringify(r).includes(KEY));
  m = await startMock((req, res) => apiError(res, 400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT', 'API_KEY_INVALID'));
  r = await gx.probe({ config: cfg(m.baseUrl) });
  await close(m);
  assert.equal(r.ok, false); assert.equal(r.status, 400); assert.equal(r.apiCode, 'API_KEY_INVALID'); assert.match(r.hint, /Khóa API không hợp lệ/);
  assert.ok(!JSON.stringify(r).includes(KEY));
  r = await gx.probe({ config: cfg('http://127.0.0.1:1/v1beta', { apiKey: '' }) });
  assert.equal(r.code, 'NO_API_KEY'); assert.match(r.hint, /KHỞI ĐỘNG LẠI/);
});
