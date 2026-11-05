<script setup>
import { computed, ref } from 'vue'
import { useHqaShopStore } from '../../stores/hqaShop'
import { money } from '../../data/hqaCatalog'
import '../../assets/hqa-pages.css'
const shop = useHqaShopStore()
const search = ref(''), editing = ref(false), error = ref(''), draft = ref({})
const filtered = computed(() => shop.products.filter(p => p.name.toLowerCase().includes(search.value.toLowerCase())))
// Ảnh chính của từng màu (lấy từ images mà API trả về: ảnh đầu tiên của mỗi màu)
function colorImagesOf(product) {
  const out = {}
  for (const img of product?.images || []) {
    if (img.color && img.url && !out[img.color]) out[img.color] = img.url
  }
  return out
}
// Bảng số lượng: matrix[màu][size] = số lượng còn
function matrixOf(product) {
  const out = {}
  for (const v of product?.variants || []) {
    if (!out[v.color]) out[v.color] = {}
    out[v.color][v.size] = Number(v.stock) || 0
  }
  return out
}
// Tóm tắt trong danh sách: mỗi màu có tổng bao nhiêu, từng size bao nhiêu
function breakdown(item) {
  const map = new Map()
  for (const v of item.variants || []) {
    if (!map.has(v.color)) map.set(v.color, [])
    map.get(v.color).push({ size: v.size, stock: Number(v.stock) || 0 })
  }
  return [...map].map(([color, parts]) => ({ color, parts, total: parts.reduce((s, x) => s + x.stock, 0) }))
}
function openEdit(product = null) {
  draft.value = product
    ? { ...product, sizesText: product.sizes.join(', '), colorsText: product.colors.join(', '), colorImages: colorImagesOf(product), matrix: matrixOf(product) }
    : { id: '', name: '', categoryId: shop.categories[0]?.id || '', price: 0, oldPrice: 0, stock: 0, image: '', description: '', sizesText: 'S, M, L, XL', colorsText: 'Kem, Hồng', colorImages: {}, matrix: {} }
  error.value = ''; editing.value = true
}
// Danh sách màu đang gõ trong ô "Màu sắc" (để hiện ô ảnh cho từng màu)
const colorList = computed(() => (draft.value.colorsText || '').split(',').map(x => x.trim()).filter(Boolean))
const sizeList = computed(() => [...new Set((draft.value.sizesText || '').split(',').map(x => x.trim()).filter(Boolean))])
const cell = (c, s) => draft.value.matrix?.[c]?.[s] ?? 0
function setCell(c, s, raw) {
  const n = Math.floor(Number(raw))
  if (!draft.value.matrix[c]) draft.value.matrix[c] = {}
  draft.value.matrix[c][s] = Number.isFinite(n) && n > 0 ? n : 0
}
const rowTotal = (c) => sizeList.value.reduce((sum, s) => sum + cell(c, s), 0)
const colTotal = (s) => colorList.value.reduce((sum, c) => sum + cell(c, s), 0)
const grandTotal = computed(() => colorList.value.reduce((sum, c) => sum + rowTotal(c), 0))
function save() {
  error.value = ''
  const p = draft.value
  const sizes = p.sizesText.split(',').map(x=>x.trim()).filter(Boolean)
  const colors = p.colorsText.split(',').map(x=>x.trim()).filter(Boolean)
  if (!p.name.trim() || !p.categoryId || !Number.isFinite(Number(p.price)) || Number(p.price) <= 0 || !sizes.length || !colors.length) { error.value = 'Kiểm tra tên, danh mục, giá bán (>0), size và màu sắc.'; return }
  if (!shop.categories.some(x=>x.id===p.categoryId)) { error.value = 'Danh mục không hợp lệ.'; return }
  if (Number(p.oldPrice) < 0) { error.value = 'Giá gốc không được âm.'; return }
  const colorImages = {}
  for (const c of colors) {
    const url = String(p.colorImages?.[c] || '').trim()
    if (url && !/^(\/|https?:\/\/)/.test(url)) { error.value = `Ảnh của màu “${c}” phải bắt đầu bằng / hoặc https://`; return }
    if (url) colorImages[c] = url
  }
  const stockMatrix = {}
  let total = 0
  for (const c of colors) {
    stockMatrix[c] = {}
    for (const s of sizes) { const q = cell(c, s); stockMatrix[c][s] = q; total += q }
  }
  const payload = { id: p.id, name: p.name.trim(), categoryId: p.categoryId, price: Number(p.price), oldPrice: Number(p.oldPrice) || 0, stock: total, stockMatrix, image: p.image.trim(), description: p.description, sizes, colors, colorImages }
  if (p.id) shop.updateProduct(payload)
  else shop.addProduct(payload)
  editing.value = false
}
function del(p) { if (window.confirm(`Xóa sản phẩm “${p.name}”? Sản phẩm cũng sẽ biến mất khỏi trang cửa hàng.`)) shop.deleteProduct(p.id) }
</script>
<template>
  <main class="hqa-page hqa-admin-page" style="padding-left:0;padding-right:0"><div class="hqa-eyebrow">MANAGE PRODUCTS</div><h1>Quản lý sản phẩm</h1><p>Thêm, chỉnh sửa, xóa sản phẩm. Thay đổi được lưu vào database và hiện ngay ở trang cửa hàng.</p><div class="hqa-panel"><div class="hqa-admin-flex"><input v-model="search" type="search" placeholder="Tìm tên sản phẩm..." aria-label="Tìm sản phẩm"/><button class="hqa-primary" type="button" @click="openEdit()">+ Thêm sản phẩm</button></div><div class="hqa-admin-table-wrap"><table class="hqa-admin-table"><thead><tr><th>Ảnh</th><th>Sản phẩm</th><th>Giá</th><th>Kho</th><th>Thao tác</th></tr></thead><tbody><tr v-for="item in filtered" :key="item.id"><td><img :src="item.image" :alt="item.name" /></td><td><strong>{{item.name}}</strong><div class="hqa-dim">{{shop.categories.find(x=>x.id===item.categoryId)?.name || item.categoryId}}</div></td><td>{{money(item.price)}}</td><td><span v-if="item.stock <= 0" style="color:#b3261e;font-weight:600">Hết hàng</span><template v-else><strong>{{item.stock}}</strong></template><div v-for="b in breakdown(item)" :key="b.color" class="hqa-dim" style="font-size:12px;margin-top:3px"><strong style="color:inherit">{{b.color}}</strong> ({{b.total}}): <template v-for="(x, i) in b.parts" :key="x.size"><span :style="x.stock <= 0 ? 'color:#b3261e' : ''">{{x.size}} {{x.stock}}</span><template v-if="i < b.parts.length - 1"> · </template></template></div></td><td><button class="hqa-link-button" type="button" @click="openEdit(item)">Sửa</button> · <button type="button" class="hqa-link-button" @click="del(item)">Xóa</button></td></tr></tbody></table><p v-if="!filtered.length" class="hqa-dim">Không có sản phẩm phù hợp.</p></div></div>
    <div v-if="editing" class="hqa-modal-backdrop" @click.self="editing=false"><div class="hqa-modal" role="dialog" aria-modal="true" aria-label="Chỉnh sửa sản phẩm"><div class="hqa-modal-heading"><h2>{{draft.id ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm'}}</h2><button class="hqa-close" type="button" aria-label="Đóng" @click="editing=false">×</button></div><form @submit.prevent="save"><div class="hqa-form-field"><label for="admin-product-name">Tên sản phẩm *</label><input id="admin-product-name" v-model="draft.name" required /></div><div class="hqa-form-field"><label for="admin-product-category">Danh mục *</label><select id="admin-product-category" v-model="draft.categoryId"><option v-for="c in shop.categories" :key="c.id" :value="c.id">{{c.name}}</option></select></div><div class="hqa-form-grid"><div class="hqa-form-field"><label for="admin-product-price">Giá bán (đồng) *</label><input id="admin-product-price" v-model.number="draft.price" type="number" min="1" required /></div><div class="hqa-form-field"><label for="admin-product-old">Giá gốc (đồng)</label><input id="admin-product-old" v-model.number="draft.oldPrice" type="number" min="0" /></div><div class="hqa-form-field"><label for="admin-product-stock">Tổng số lượng (tự cộng)</label><input id="admin-product-stock" :value="grandTotal" readonly /></div><div class="hqa-form-field"><label for="admin-product-image">URL ảnh sản phẩm</label><input id="admin-product-image" v-model="draft.image" placeholder="https://..." /></div></div><div class="hqa-form-grid"><div class="hqa-form-field"><label for="admin-product-sizes">Size (cách nhau bằng dấu phẩy) *</label><input id="admin-product-sizes" v-model="draft.sizesText" /></div><div class="hqa-form-field"><label for="admin-product-colors">Màu sắc *</label><input id="admin-product-colors" v-model="draft.colorsText" /></div></div><div v-if="colorList.length && sizeList.length" class="hqa-form-field"><label>Số lượng theo từng màu và size (ghi 0 nếu hết)</label><div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;margin-top:6px"><thead><tr><th style="text-align:left;padding:6px">Màu \ Size</th><th v-for="s in sizeList" :key="s" style="padding:6px">{{s}}</th><th style="padding:6px">Tổng màu</th></tr></thead><tbody><tr v-for="c in colorList" :key="c"><td style="padding:6px"><strong>{{c}}</strong></td><td v-for="s in sizeList" :key="s" style="padding:4px"><input type="number" min="0" step="1" :value="cell(c, s)" @input="setCell(c, s, $event.target.value)" :aria-label="`Số lượng ${c} size ${s}`" style="width:68px;text-align:center" /></td><td style="padding:6px;text-align:center"><strong>{{rowTotal(c)}}</strong></td></tr><tr><td style="padding:6px"><strong>Tổng size</strong></td><td v-for="s in sizeList" :key="s" style="padding:6px;text-align:center"><strong>{{colTotal(s)}}</strong></td><td style="padding:6px;text-align:center"><strong>{{grandTotal}}</strong></td></tr></tbody></table></div></div><div v-if="colorList.length" class="hqa-form-field"><label>Ảnh theo từng màu (URL ảnh)</label><div v-for="c in colorList" :key="c" style="display:flex;gap:10px;align-items:center;margin-top:8px"><img v-if="draft.colorImages[c]" :src="draft.colorImages[c]" alt="" style="width:44px;height:56px;object-fit:cover;border-radius:6px;flex:none" /><span v-else style="width:44px;height:56px;border:1px dashed #d9c3c8;border-radius:6px;flex:none"></span><strong style="min-width:72px">{{c}}</strong><input v-model="draft.colorImages[c]" placeholder="/images/products/ten-anh.jpg" style="flex:1" /></div></div><div class="hqa-form-field"><label for="admin-product-description">Mô tả</label><textarea id="admin-product-description" v-model="draft.description" rows="3"></textarea></div><div v-if="error" class="hqa-alert" role="alert">{{error}}</div><div style="display:flex;gap:9px;justify-content:flex-end"><button class="hqa-outline" type="button" @click="editing=false">Hủy</button><button class="hqa-primary" type="submit">Lưu sản phẩm</button></div></form></div></div>
  </main>
</template>