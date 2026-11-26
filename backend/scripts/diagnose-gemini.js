require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const gemini = require('../utils/geminiExtractor');

const cfg = gemini.getConfig();
const model = (process.argv[2] || cfg.model).replace(/^models\//, '');
const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey };

async function timed(label, url, init, timeoutMs) {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const body = await res.text();
    console.log(`  ${res.ok ? '✔' : '✖'} ${label}: HTTP ${res.status} sau ${Date.now() - t0} ms`);
    return { res, body };
  } catch (e) {
    const why = e?.name === 'AbortError' ? `QUÁ ${timeoutMs} ms (không có phản hồi)` : `${e?.cause?.code || e?.message}`;
    console.log(`  ✖ ${label}: ${why} (sau ${Date.now() - t0} ms)`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  console.log(`\n=== Chẩn đoán Gemini (model: ${model}, Node ${process.version}) ===\n`);
  if (!cfg.apiKey) { console.log('Chưa có GEMINI_API_KEY trong backend/.env'); return; }

  console.log('1) Kiểm tra mạng tới Google + danh sách model:');
  const list = await timed('GET /models', `${cfg.baseUrl}/models?pageSize=100`, { headers }, 20000);
  if (!list) { console.log('\n=> Không có phản hồi từ Google: lỗi MẠNG (tường lửa, VPN, DNS hoặc IPv6). Thử đổi mạng / tắt VPN / dùng 4G.\n'); return; }
  if (list.res.ok) {
    try {
      const names = JSON.parse(list.body).models.filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace('models/', '')).filter((n) => /flash|lite/i.test(n) && !/image|tts|audio|live|embed|robotics|computer/i.test(n));
      console.log('  Model Flash / Flash-Lite khả dụng với khóa của bạn:\n    ' + names.join('\n    '));
    } catch { /* bỏ qua */ }
  } else console.log('  ', list.body.slice(0, 300));

  console.log('\n2) Gọi thử model với 3 cách cấu hình "suy nghĩ" (chờ tối đa 60 giây mỗi lần):');
  const variants = [
    ['mặc định (không thinkingConfig)', undefined],
    ['thinkingBudget = 0', { thinkingBudget: 0 }],
    ['thinkingLevel = minimal', { thinkingLevel: 'minimal' }],
  ];
  for (const [label, thinking] of variants) {
    const body = {
      contents: [{ role: 'user', parts: [{ text: 'Trả về JSON {"ok": true}' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 300, responseMimeType: 'application/json', ...(thinking ? { thinkingConfig: thinking } : {}) },
    };
    const r = await timed(label, `${cfg.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers, body: JSON.stringify(body) }, 60000);
    if (r && !r.res.ok) { try { console.log('     ', JSON.parse(r.body).error.message.slice(0, 200)); } catch { console.log('     ', r.body.slice(0, 200)); } }
  }
  console.log('\nĐọc kết quả: GET /models nhanh nhưng gọi model chậm => model suy nghĩ lâu: dùng cách cấu hình nhanh nhất hoặc đổi model Flash-Lite.');
  console.log('Cả hai đều chậm => mạng chậm: tăng GEMINI_TIMEOUT_MS (20000) hoặc đổi mạng.\n');
})();
