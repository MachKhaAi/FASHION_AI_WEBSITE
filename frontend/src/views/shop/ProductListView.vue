<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHqaShopStore, normalizeProduct } from '../../stores/hqaShop'
import { getProducts, getProductFilters } from '../../services/api'
import HqaProductCard from '../../components/shop/HqaProductCard.vue'
import '../../assets/hqa-pages.css'

const shop = useHqaShopStore()
const route = useRoute()
const router = useRouter()

// ---------- Trạng thái bộ lọc (đồng bộ với URL để chia sẻ / nút Back hoạt động) ----------
const str = (v) => String(Array.isArray(v) ? v[0] : (v ?? ''))
const num = (v) => (str(v) !== '' && Number.isFinite(Number(str(v))) ? Number(str(v)) : '')
const sizeList = (v) => str(v).split(',').map(s => s.trim()).filter(Boolean)

const q = route.query
const category = ref(str(q['danh-muc']) || 'all')
const search = ref(str(q.tim))
const minPrice = ref(num(q['gia-tu']))
const maxPrice = ref(num(q['gia-den']))
const sizes = ref(sizeList(q['kich-thuoc']))
const sort = ref(str(q['sap-xep']) || 'newest')

// ---------- Dữ liệu ----------
const items = ref([])
const loading = ref(false)
const apiError = ref('')
const filterOptions = ref({ sizes: [], priceMin: 0, priceMax: 0 })
// Nếu API chưa trả danh sách size thì dùng bộ size phổ biến
const sizeOptions = computed(() => filterOptions.value.sizes.length ? filterOptions.value.sizes : ['S', 'M', 'L', 'XL'])

const PRICE_PRESETS = [
  { label: 'Dưới 200.000đ', min: '', max: 200000 },
  { label: '200.000đ – 400.000đ', min: 200000, max: 400000 },
  { label: '400.000đ – 600.000đ', min: 400000, max: 600000 },
  { label: 'Trên 600.000đ', min: 600000, max: '' },
]
const isPreset = (p) => minPrice.value === p.min && maxPrice.value === p.max
function togglePreset(p) {
  if (isPreset(p)) { minPrice.value = ''; maxPrice.value = '' }
  else { minPrice.value = p.min; maxPrice.value = p.max }
}
function toggleSize(s) {
  sizes.value = sizes.value.includes(s) ? sizes.value.filter(x => x !== s) : [...sizes.value, s]
}

const activeFilterCount = computed(() =>
  (category.value !== 'all' ? 1 : 0) + (search.value.trim() ? 1 : 0) +
  (minPrice.value !== '' || maxPrice.value !== '' ? 1 : 0) + (sizes.value.length ? 1 : 0))

const categoryName = computed(() => shop.categories.find(c => c.id === category.value)?.name || '')

function clearFilters() {
  category.value = 'all'; search.value = ''; minPrice.value = ''; maxPrice.value = ''; sizes.value = []
}

// ---------- Gọi API ----------
function apiParams() {
  const params = { sort: sort.value }
  if (search.value.trim()) params.q = search.value.trim()
  if (category.value !== 'all') params.category = category.value
  if (minPrice.value !== '') params.minPrice = minPrice.value
  if (maxPrice.value !== '') params.maxPrice = maxPrice.value
  if (sizes.value.length) params.size = sizes.value.join(',')
  return params
}

let requestId = 0 // bỏ qua kết quả của các request cũ trả về muộn
async function load() {
  const id = ++requestId
  loading.value = true
  apiError.value = ''
  try {
    const response = await getProducts(apiParams())
    if (id !== requestId) return
    items.value = Array.isArray(response.data.data) ? response.data.data.map(normalizeProduct) : []
  } catch {
    if (id !== requestId) return
    items.value = []
    apiError.value = 'Không thể tải sản phẩm. Vui lòng kiểm tra kết nối và thử lại.'
  } finally {
    if (id === requestId) loading.value = false
  }
}

function buildQuery() {
  const out = {}
  if (category.value !== 'all') out['danh-muc'] = category.value
  if (search.value.trim()) out.tim = search.value.trim()
  if (minPrice.value !== '') out['gia-tu'] = String(minPrice.value)
  if (maxPrice.value !== '') out['gia-den'] = String(maxPrice.value)
  if (sizes.value.length) out['kich-thuoc'] = sizes.value.join(',')
  if (sort.value !== 'newest') out['sap-xep'] = sort.value
  return out
}

function applyFilters() {
  router.replace({ query: buildQuery() })
  load()
}

// Chip / size / sắp xếp: áp dụng ngay. Ô gõ chữ và nhập giá: đợi người dùng ngừng gõ.
watch([category, sizes, sort], applyFilters, { deep: true })
let timer = null
watch([search, minPrice, maxPrice], () => {
  clearTimeout(timer)
  timer = setTimeout(applyFilters, 350)
})
onBeforeUnmount(() => clearTimeout(timer))

// Khi URL đổi từ bên ngoài (ví dụ ô tìm kiếm trên header) thì cập nhật lại bộ lọc
watch(() => route.query, (next) => {
  if (route.name !== 'hqa-products') return
  const nextCategory = str(next['danh-muc']) || 'all'
  const nextSearch = str(next.tim)
  const nextMin = num(next['gia-tu'])
  const nextMax = num(next['gia-den'])
  const nextSizes = sizeList(next['kich-thuoc'])
  const nextSort = str(next['sap-xep']) || 'newest'
  // Chỉ gán khi khác, tránh vòng lặp watch <-> router.replace
  if (nextCategory !== category.value) category.value = nextCategory
  if (nextSearch !== search.value.trim()) search.value = nextSearch
  if (nextMin !== minPrice.value) minPrice.value = nextMin
  if (nextMax !== maxPrice.value) maxPrice.value = nextMax
  if (nextSizes.join(',') !== sizes.value.join(',')) sizes.value = nextSizes
  if (nextSort !== sort.value) sort.value = nextSort
})

onMounted(async () => {
  load()
  // Danh mục + size + khoảng giá cho bộ lọc, và nạp cả catalog vào store (giỏ hàng, yêu thích)
  shop.fetchProducts().catch(() => {})
  try {
    const response = await getProductFilters()
    filterOptions.value = { sizes: [], priceMin: 0, priceMax: 0, ...response.data.data }
  } catch {
    // giữ giá trị mặc định
  }
})
</script>

<template>
  <main class="hqa-page">
    <nav class="hqa-breadcrumb" aria-label="Đường dẫn"><router-link to="/">Trang chủ</router-link><span>›</span><span>Sản phẩm</span></nav>
    <div class="hqa-head"><div class="hqa-eyebrow">HQA COLLECTION</div><h1 class="hqa-page-title">Bộ sưu tập của nàng</h1><p class="hqa-subtitle">Khám phá những thiết kế ngọt ngào, thanh lịch và dễ dàng thể hiện phong cách riêng.</p></div>

    <div class="hqa-filter-bar">
      <div class="hqa-chips" aria-label="Lọc theo danh mục">
        <button type="button" class="hqa-chip" :class="{ active: category === 'all' }" @click="category = 'all'">Tất cả</button>
        <button v-for="item in shop.categories" :key="item.id" type="button" class="hqa-chip" :class="{ active: category === item.id }" @click="category = item.id">{{ item.name }}</button>
      </div>
      <div class="hqa-search-row">
        <input v-model="search" type="search" placeholder="Tìm tên sản phẩm..." aria-label="Tìm sản phẩm" />
        <select v-model="sort" aria-label="Sắp xếp sản phẩm">
          <option value="newest">Mới nhất</option>
          <option value="price-asc">Giá tăng dần</option>
          <option value="price-desc">Giá giảm dần</option>
          <option value="name">Tên A–Z</option>
        </select>
      </div>

      <div class="hqa-filter-extra">
        <div class="hqa-filter-group" role="group" aria-label="Lọc theo giá">
          <span class="hqa-filter-label">Giá</span>
          <div class="hqa-chips">
            <button v-for="preset in PRICE_PRESETS" :key="preset.label" type="button" class="hqa-chip hqa-chip-sm" :class="{ active: isPreset(preset) }" @click="togglePreset(preset)">{{ preset.label }}</button>
          </div>
          <div class="hqa-price-range">
            <input v-model="minPrice" type="number" min="0" step="10000" inputmode="numeric" placeholder="Từ (đ)" aria-label="Giá thấp nhất" />
            <span aria-hidden="true">–</span>
            <input v-model="maxPrice" type="number" min="0" step="10000" inputmode="numeric" placeholder="Đến (đ)" aria-label="Giá cao nhất" />
          </div>
        </div>

        <div class="hqa-filter-group" role="group" aria-label="Lọc theo kích thước">
          <span class="hqa-filter-label">Kích thước</span>
          <div class="hqa-chips">
            <button v-for="s in sizeOptions" :key="s" type="button" class="hqa-chip hqa-chip-sm" :class="{ active: sizes.includes(s) }" :aria-pressed="sizes.includes(s)" @click="toggleSize(s)">{{ s }}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="hqa-list-status">
      <span>
        <template v-if="loading">Đang tải sản phẩm...</template>
        <template v-else>Hiển thị <strong>{{ items.length }}</strong> sản phẩm<template v-if="categoryName"> trong “{{ categoryName }}”</template></template>
        <button v-if="activeFilterCount" type="button" class="hqa-link-button hqa-clear-filter" @click="clearFilters">Xóa bộ lọc ({{ activeFilterCount }})</button>
      </span>
      <router-link to="/yeu-thich">♡ Danh sách yêu thích ({{ shop.favorites.length }})</router-link>
    </div>

    <div v-if="apiError" class="hqa-alert" role="alert">{{ apiError }} <button type="button" class="hqa-link-button" @click="load">Thử lại</button></div>
    <div v-else-if="items.length" class="hqa-product-grid" :class="{ 'hqa-is-loading': loading }"><HqaProductCard v-for="item in items" :key="item.id" :product="item" /></div>
    <div v-else-if="!loading" class="hqa-empty"><div class="hqa-empty-icon">✿</div><h2>Chưa tìm thấy sản phẩm</h2><p class="hqa-dim">Hãy thử từ khóa, mức giá hoặc kích thước khác nhé.</p><button class="hqa-secondary" @click="clearFilters">Xem tất cả sản phẩm</button></div>
  </main>
</template>
