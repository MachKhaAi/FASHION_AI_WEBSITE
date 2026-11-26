require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const gemini = require('../utils/geminiExtractor');

const mask = (k) => (k ? `${k.slice(0, 4)}...${k.slice(-3)} (${k.length} ký tự)` : '(trống)');
const ok = (m) => console.log(`  ✔ ${m}`);
const bad = (m) => console.log(`  ✖ ${m}`);

(async () => {
  console.log('\n=== Kiểm tra kết nối Google Gemini cho chatbot tư vấn size ===\n');
  const cfg = { ...gemini.getConfig() };
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== cfg.apiKey) console.log('  (Khóa trong .env có dấu nháy / khoảng trắng thừa, đã được tự làm sạch.)');
  console.log('Cấu hình đọc từ backend/.env:');
  console.log(`  GEMINI_API_KEY    : ${mask(cfg.apiKey)}`);
  console.log(`  GEMINI_MODEL      : ${cfg.model}`);
  console.log(`  GEMINI_BASE_URL   : ${cfg.baseUrl}`);
  console.log(`  GEMINI_TIMEOUT_MS : ${cfg.timeoutMs}`);
  console.log(`  Node.js           : ${process.version}\n`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) { bad(`Node.js ${process.version} quá cũ. Cần Node 18 trở lên.`); { process.exitCode = 1; return; } }
  ok('Phiên bản Node.js đủ mới (có fetch).');
  if (!cfg.apiKey) {
    bad('Chưa có GEMINI_API_KEY.');
    console.log(`\n=> ${gemini.explainAIError({ code: 'NO_API_KEY' })}\n`);
    { process.exitCode = 1; return; }
  }

  // Gọi thử với thời gian chờ rộng rãi (15 giây) để phân biệt "chậm" với "không kết nối được"
  const message = 'Mình cao 1m60, nặng 47kg, ngực 84, eo 64, hông 90, muốn mua áo sơ mi cổ nơ';
  console.log(`\nĐang gọi Gemini với câu: "${message}" ...`);
  const t0 = Date.now();
  try {
    const out = await gemini.extractEntities({ message, currentProduct: null, knownMeasurements: {}, askedFor: [] }, { config: { ...cfg, timeoutMs: 15000 } });
    const ms = Date.now() - t0;
    ok(`Gemini trả lời sau ${ms} ms.`);
    console.log('  Kết quả trích xuất:', JSON.stringify(out));
    const m = out.measurements || {};
    const good = m.height === 160 && m.weight === 47 && m.chest === 84 && m.waist === 64 && m.hip === 90;
    good ? ok('Trích xuất ĐÚNG cả 5 số đo.') : bad('Trích xuất chưa đúng 5 số đo (xem kết quả ở trên).');
    if (ms > cfg.timeoutMs) console.log(`\n  ! Mất ${ms} ms nhưng GEMINI_TIMEOUT_MS chỉ là ${cfg.timeoutMs} ms -> chatbot sẽ báo timeout. Tăng GEMINI_TIMEOUT_MS lên khoảng ${Math.ceil((ms * 2) / 1000) * 1000}.`);
    console.log('\nKết luận: kết nối Gemini HOẠT ĐỘNG.\n');
  } catch (error) {
    bad(`Lỗi: ${error.code || error.name}${error.status ? ` (HTTP ${error.status})` : ''}`);
    if (error.apiCode) console.log(`    Mã lỗi Google : ${error.apiCode}`);
    if (error.detail) console.log(`    Chi tiết      : ${error.detail}`);
    console.log(`\n=> ${gemini.explainAIError(error)}\n`);
    { process.exitCode = 1; return; }
  }
})();
