'use strict';

const FIELDS = {
  height: { label: 'Chiều cao', unit: 'cm', min: 100, max: 230 },
  weight: { label: 'Cân nặng', unit: 'kg', min: 20, max: 250 },
  chest: { label: 'Vòng ngực', unit: 'cm', min: 50, max: 160 },
  waist: { label: 'Vòng eo', unit: 'cm', min: 40, max: 160 },
  hip: { label: 'Vòng hông', unit: 'cm', min: 50, max: 170 },
};
const FIELD_KEYS = Object.keys(FIELDS);
// Giữ tên xuất khẩu cũ để các nơi dùng không bị lỗi. Đây là danh sách CHO PHÉP, không bắt buộc.
const REQUIRED_MEASUREMENTS = FIELD_KEYS;
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const sizeRank = (size, fallbackIdx = 0) => {
  const i = SIZE_ORDER.indexOf(String(size).toUpperCase());
  return i === -1 ? SIZE_ORDER.length + fallbackIdx : i;
};
const isNum = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
function normalizeMeasurements(raw) {
  const values = {}, invalid = [];
  for (const key of FIELD_KEYS) {
    const v = raw?.[key];
    if (v === undefined || v === null || v === '') continue;
    if (!isNum(v)) { invalid.push({ key, value: v }); continue; }
    const n = Math.round(Number(v) * 10) / 10;
    if (n >= FIELDS[key].min && n <= FIELDS[key].max) values[key] = n;
    else invalid.push({ key, value: n });
  }
  return { values, invalid };
}
function missingMeasurements(values, required = FIELD_KEYS) { return required.filter((k) => !isNum(values?.[k])); }
function chartRowsForProduct(chart = [], product) {
  if (!product) return [];
  const sold = new Set((product.sizes || []).map((s) => String(s).toUpperCase()));
  return chart.filter((r) => sold.has(String(r.size).toUpperCase()));
}
function stockInfo(product, size, color) {
  const variants = (product?.variants || []).filter((v) => v.size === size);
  if (!variants.length) return { status: 'unknown', quantity: null };
  const quantity = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
  const info = { status: quantity <= 0 ? 'out' : quantity <= 5 ? 'low' : 'in', quantity };
  if (color) {
    const v = variants.find((x) => x.color === color);
    info.color = color;
    info.colorQuantity = v ? Number(v.stock) || 0 : 0;
  }
  return info;
}
// Chỉ coi là đối chiếu được khi cặp min/max đều có thật và hợp lệ trên bảng size.
function validRange(r) {
  return Array.isArray(r) && r.length === 2 && r.every(isNum) && Number(r[0]) <= Number(r[1]);
}
function recommend({ measurements = {}, product, chart = [], color = null }) {
  const { values, invalid } = normalizeMeasurements(measurements);
  if (invalid.length) return { status: 'INVALID', invalid };
  const keys = FIELD_KEYS.filter((k) => values[k] !== undefined);
  const missing = missingMeasurements(values);
  const sold = product?.sizes || [];
  if (sold.length && sold.every((s) => /^(one ?size|free ?size|f)$/i.test(String(s).trim()))) {
    return { status: 'FREE_SIZE' };
  }
  const rows = chartRowsForProduct(chart, product);
  if (!rows.length) return { status: 'NO_CHART' };
  if (!keys.length) return { status: 'INCOMPLETE', missing };

  const evaluated = rows.map((row, idx) => ({
    row, rank: sizeRank(row.size, idx),
    checks: keys.map((k) => {
      const range = row.ranges?.[k];
      const valid = validRange(range);
      const lo = valid ? Number(range[0]) : null;
      const hi = valid ? Number(range[1]) : null;
      const value = values[k];
      const side = !valid ? 'unknown' : value < lo ? 'below' : value > hi ? 'above' : 'ok';
      return { key: k, label: FIELDS[k].label, unit: FIELDS[k].unit, value, min: lo, max: hi, side, diff: side === 'below' ? lo - value : side === 'above' ? value - hi : 0 };
    }),
  }));
  const matched = evaluated.filter((e) => e.checks.every((c) => c.side === 'ok'));
  // Một dòng size không đủ dữ liệu nhưng vẫn có thể khớp những số đo đã biết.
  // Không được bỏ qua dòng đó và kết luận sai rằng chỉ còn một size hợp lệ.
  const uncertain = evaluated.some((e) => e.checks.some((c) => c.side === 'unknown') &&
    e.checks.every((c) => c.side === 'ok' || c.side === 'unknown'));
  if (uncertain) return { status: 'NO_CHART', message: 'Bảng size có khoảng đo còn thiếu; shop chưa thể xác nhận một size duy nhất.' };
  if (!matched.length) {
    // Thiếu dữ liệu khoảng đo trên bảng: không được xem đó là một size lệch số đo.
    if (evaluated.some((e) => e.checks.every((c) => c.side === 'ok' || c.side === 'unknown'))) {
      return { status: 'NO_CHART', message: 'Bảng size chưa có đủ khoảng đo cho các chỉ số bạn cung cấp.' };
    }
    const mismatches = evaluated.map((e) => ({
      size: e.row.size, rank: e.rank, issues: e.checks.filter((c) => c.side !== 'ok' && c.side !== 'unknown'),
    })).sort((a, b) => a.issues.length - b.issues.length || a.rank - b.rank);
    return { status: 'NO_MATCH', mismatches, provided: keys, missing };
  }
  const ordered = [...matched].sort((a, b) => a.rank - b.rank);
  if (ordered.length > 1 && missing.length) {
    const useful = missing.filter((k) => {
      const intervals = ordered.map((e) => JSON.stringify(e.row.ranges?.[k] || null));
      return intervals.every((i) => i !== 'null') && new Set(intervals).size > 1;
    });
    return { status: 'AMBIGUOUS', candidates: ordered.map((e) => e.row.size), missing, suggested: useful.slice(0, 2), provided: keys };
  }
  // Khi đủ số đo nhưng nhiều size cùng khớp: giữ quy tắc ưu tiên size lớn hơn đã có của shop.
  const chosen = ordered[ordered.length - 1];
  return {
    status: 'OK', size: chosen.row.size, complete: missing.length === 0,
    missing, provided: keys, chosenBy: ordered.length > 1 ? 'larger' : 'single',
    matched: ordered.map((e) => e.row.size), evidence: chosen.checks,
    availability: stockInfo(product, chosen.row.size, color),
  };
}
module.exports = { FIELDS, FIELD_KEYS, REQUIRED_MEASUREMENTS, normalizeMeasurements, missingMeasurements, chartRowsForProduct, recommend, stockInfo, sizeRank };
