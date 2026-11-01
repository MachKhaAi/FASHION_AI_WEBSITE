const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

// Thứ tự hiển thị size (size lạ xếp cuối, theo bảng chữ cái)
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

function sortSizes(sizes) {
  const rank = (s) => {
    const i = SIZE_ORDER.indexOf(String(s).toUpperCase());
    return i === -1 ? SIZE_ORDER.length : i;
  };
  return [...sizes].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b), 'vi'));
}

const unique = (arr) => [...new Set(arr)];

// Bỏ dấu tiếng Việt để tìm "ao so mi" ra "Áo sơ mi"
const VN_LOWER = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ'.normalize('NFC');
const baseChar = (c) => (c === 'đ' ? 'd' : c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
const VN_FROM = Array.from(VN_LOWER).concat(Array.from(VN_LOWER.toUpperCase()));
const VN_TO = Array.from(VN_LOWER).map(baseChar);
// Ký tự gốc (có dấu, hoa + thường) -> chữ cái không dấu viết thường
const TRANSLATE_FROM = VN_FROM.join('');
const TRANSLATE_TO = VN_TO.concat(VN_TO).join('');

function stripAccents(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

// Escape ký tự đặc biệt của LIKE (\ % _)
const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');

// Đọc số dương từ query string; không hợp lệ thì trả null
function toPrice(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// size có thể là "S,M" hoặc ?size=S&size=M
function toList(value) {
  const raw = Array.isArray(value) ? value : [value];
  return unique(
    raw
      .flatMap((v) => String(v ?? '').split(','))
      .map((v) => v.trim())
      .filter(Boolean)
  ).slice(0, 20);
}

// Ghép 1 dòng products + các biến thể thành object trả về cho frontend
function shapeProduct(row, variants) {
  const list = variants.map((v) => ({ size: v.size, color: v.color, stock: Number(v.stock) || 0 }));
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id || '',
    categoryName: row.category_name || '',
    price: Number(row.price),
    oldPrice: Number(row.old_price) || 0,
    image: row.image,
    description: row.description || '',
    featured: Boolean(row.is_featured),
    createdAt: row.created_at,
    sizes: sortSizes(unique(list.map((v) => v.size))),
    colors: unique(list.map((v) => v.color)),
    stock: list.reduce((sum, v) => sum + v.stock, 0),
    variants: list,
  };
}

function shapeSizeChart(row) {
  return {
    size: row.size_code,
    heightMin: row.height_min, heightMax: row.height_max,
    weightMin: row.weight_min, weightMax: row.weight_max,
    chestMin: row.chest_min, chestMax: row.chest_max,
    waistMin: row.waist_min, waistMax: row.waist_max,
    hipMin: row.hip_min, hipMax: row.hip_max,
  };
}

async function loadVariants(productIds) {
  const map = new Map(productIds.map((id) => [id, []]));
  if (!productIds.length) return map;
  const result = await db.query(
    'SELECT product_id, size, color, stock FROM product_variants WHERE product_id = ANY($1::text[]) ORDER BY id',
    [productIds]
  );
  for (const v of result.rows) map.get(v.product_id)?.push(v);
  return map;
}

const PRODUCT_COLUMNS = `
  p.id, p.name, p.category_id, c.name AS category_name,
  p.price, p.old_price, p.image, p.description, p.is_featured, p.created_at`;

// Chỉ cho phép các kiểu sắp xếp trong danh sách này (tránh SQL injection)
const SORTS = {
  newest: 'p.created_at DESC, p.id',
  'price-asc': 'p.price ASC, p.id',
  'price-desc': 'p.price DESC, p.id',
  name: 'p.name ASC, p.id',
};

function serverError(res, label, error) {
  console.error(`${label}:`, error.message);
  res.status(500).json({ success: false, message: 'Lỗi server' });
}

// ---------------------------------------------------------------------------
// Danh mục & bảng size
// ---------------------------------------------------------------------------

// GET /api/categories
router.get('/categories', async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, icon FROM categories ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    serverError(res, 'Lỗi lấy danh mục', error);
  }
});

// GET /api/size-charts  -> toàn bộ bảng size của cửa hàng
router.get('/size-charts', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM size_charts ORDER BY id');
    res.json({ success: true, data: result.rows.map(shapeSizeChart) });
  } catch (error) {
    serverError(res, 'Lỗi lấy bảng size', error);
  }
});

// ---------------------------------------------------------------------------
// Sản phẩm
// ---------------------------------------------------------------------------

// GET /api/products/filters  -> dữ liệu để dựng bộ lọc (danh mục, size, khoảng giá)
// (khai báo TRƯỚC /products/:id để "filters" không bị hiểu là id)
router.get('/products/filters', async (req, res) => {
  try {
    const [categories, sizes, prices] = await Promise.all([
      db.query('SELECT id, name, icon FROM categories ORDER BY name'),
      db.query('SELECT DISTINCT size FROM product_variants'),
      db.query('SELECT MIN(price) AS min, MAX(price) AS max FROM products'),
    ]);
    res.json({
      success: true,
      data: {
        categories: categories.rows,
        sizes: sortSizes(sizes.rows.map((r) => r.size)),
        priceMin: Number(prices.rows[0].min) || 0,
        priceMax: Number(prices.rows[0].max) || 0,
      },
    });
  } catch (error) {
    serverError(res, 'Lỗi lấy dữ liệu bộ lọc', error);
  }
});

// GET /api/products
//   ?q=ao so mi          tìm theo tên / tên danh mục (không phân biệt dấu, hoa thường, khớp đầu từ)
//   &category=ao         lọc theo danh mục
//   &minPrice=200000     lọc theo giá
//   &maxPrice=500000
//   &size=S,M            lọc theo size (chỉ tính size còn hàng)
//   &sort=newest|price-asc|price-desc|name
router.get('/products', async (req, res) => {
  try {
    const where = [];
    const params = [];
    const add = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    const category = String(req.query.category || '').trim();
    if (category && category !== 'all') where.push(`p.category_id = ${add(category)}`);

    let minPrice = toPrice(req.query.minPrice);
    let maxPrice = toPrice(req.query.maxPrice);
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      [minPrice, maxPrice] = [maxPrice, minPrice];
    }
    if (minPrice !== null) where.push(`p.price >= ${add(minPrice)}`);
    if (maxPrice !== null) where.push(`p.price <= ${add(maxPrice)}`);

    const sizes = toList(req.query.size);
    if (sizes.length) {
      where.push(
        `EXISTS (SELECT 1 FROM product_variants v
                 WHERE v.product_id = p.id AND v.stock > 0 AND v.size = ANY(${add(sizes)}::text[]))`
      );
    }

    // Mỗi từ khóa phải khớp ĐẦU MỘT TỪ trong "tên + danh mục" (đã bỏ dấu):
    // "ao" khớp "Áo sơ mi" nhưng không khớp "dạo phố".
    const terms = stripAccents(String(req.query.q || '').trim()).split(/\s+/).filter(Boolean).slice(0, 8);
    if (terms.length) {
      const from = add(TRANSLATE_FROM);
      const to = add(TRANSLATE_TO);
      const normalized = `lower(translate(p.name || ' ' || COALESCE(c.name, ''), ${from}, ${to}))`;
      for (const term of terms) {
        const atStart = add(`${escapeLike(term)}%`);
        const afterSpace = add(`% ${escapeLike(term)}%`);
        where.push(`(${normalized} LIKE ${atStart} OR ${normalized} LIKE ${afterSpace})`);
      }
    }

    const orderBy = SORTS[req.query.sort] || SORTS.newest;
    const sql = `
      SELECT ${PRODUCT_COLUMNS}
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${orderBy}`;

    const result = await db.query(sql, params);
    const variants = await loadVariants(result.rows.map((r) => r.id));
    const data = result.rows.map((row) => shapeProduct(row, variants.get(row.id) || []));

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    serverError(res, 'Lỗi truy vấn sản phẩm', error);
  }
});

// GET /api/products/:id/size-chart  -> bảng size ứng với các size mà sản phẩm đang có
router.get('/products/:id/size-chart', async (req, res) => {
  try {
    const found = await db.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!found.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    const variants = (await loadVariants([req.params.id])).get(req.params.id) || [];
    const sizes = unique(variants.map((v) => v.size));

    let rows = [];
    if (sizes.length) {
      const result = await db.query(
        'SELECT * FROM size_charts WHERE size_code = ANY($1::text[]) ORDER BY id',
        [sizes]
      );
      rows = result.rows;
    }

    res.json({
      success: true,
      data: rows.map(shapeSizeChart),
      message: rows.length ? undefined : 'Sản phẩm này chưa có bảng kích thước.',
    });
  } catch (error) {
    serverError(res, 'Lỗi lấy bảng size sản phẩm', error);
  }
});

// GET /api/products/:id  -> chi tiết 1 sản phẩm (kèm size, màu, tồn kho theo từng biến thể)
router.get('/products/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    const variants = await loadVariants([result.rows[0].id]);
    res.json({ success: true, data: shapeProduct(result.rows[0], variants.get(result.rows[0].id) || []) });
  } catch (error) {
    serverError(res, 'Lỗi lấy chi tiết sản phẩm', error);
  }
});

module.exports = router;
module.exports._internals = { stripAccents, TRANSLATE_FROM, TRANSLATE_TO, toList, toPrice, sortSizes };
