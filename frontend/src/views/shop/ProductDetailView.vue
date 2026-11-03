<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHqaShopStore, normalizeProduct, hasUserToken } from '../../stores/hqaShop'
import { getProductById, getProducts, getProductSizeChart } from '../../services/api'
import { money } from '../../data/hqaCatalog'
import HqaSizeAdvisor from '../../components/chatbot/HqaSizeAdvisor.vue'
import HqaProductCard from '../../components/shop/HqaProductCard.vue'
import '../../assets/hqa-pages.css'

const shop = useHqaShopStore(), route = useRoute(), router = useRouter()

const product = ref(null)
const loading = ref(false)
const loadError = ref('') 
const related = ref([])
const size = ref(''), color = ref(''), qty = ref(1), notice = ref(''), showChart = ref(false), showAdvisor = ref(false)
const chart = reactive({ productId: '', rows: [], loading: false, error: '', message: '' })

// Cờ đánh dấu sản phẩm được thêm vào giỏ nhờ AI tư vấn size
const isAiRecommended = ref(false)

// ---------- Thư viện ảnh theo màu ----------
const activeIndex = ref(0)
const images = computed(() => {
  const p = product.value
  if (!p) return []
  const list = (p.images || []).filter(i => i && i.url)
  return list.length ? list : [{ url: p.image, color: null }]
})
const activeImage = computed(() => images.value[activeIndex.value] || images.value[0] || { url: '', color: null })
const colorThumb = (c) => images.value.find(i => i.color === c)?.url || ''
// Hiện ảnh đầu tiên của màu đang chọn
function showColorImage() {
  const i = images.value.findIndex(img => img.color === color.value)
  if (i >= 0) activeIndex.value = i
}
// Bấm vào ảnh nhỏ: đổi ảnh lớn và đồng bộ màu tương ứng
function selectImage(i) {
  const c = images.value[i]?.color
  if (c && c !== color.value) pickColor(c)
  activeIndex.value = i
}

const variants = computed(() => product.value?.variants || [])
const hasVariants = computed(() => variants.value.length > 0)
const variantOf = (s, c) => variants.value.find(v => v.size === s && v.color === c)
const sizeInStock = (s) => hasVariants.value ? variants.value.some(v => v.size === s && v.stock > 0) : (product.value?.stock || 0) > 0
const colorInStock = (c) => hasVariants.value ? variants.value.some(v => v.color === c && v.stock > 0) : (product.value?.stock || 0) > 0
const currentStock = computed(() => hasVariants.value ? (variantOf(size.value, color.value)?.stock ?? 0) : (product.value?.stock || 0))

function pickSize(s) {
  size.value = s
  isAiRecommended.value = false // Tự chọn bằng tay thì tắt cờ AI
  if (hasVariants.value && !(variantOf(s, color.value)?.stock > 0)) {
    const match = variants.value.find(v => v.size === s && v.stock > 0)
    if (match) { color.value = match.color; showColorImage() }
  }
}

// Khi chọn size từ trợ lý AI
function pickAiSize(s) {
  pickSize(s)
  isAiRecommended.value = true // Bật cờ AI tư vấn
  showAdvisor.value = false
}

function pickColor(c) {
  color.value = c
  if (hasVariants.value && !(variantOf(size.value, c)?.stock > 0)) {
    const match = variants.value.find(v => v.color === c && v.stock > 0)
    if (match) size.value = match.size
  }
  showColorImage()
}

function pickDefaults(p) {
  // Ưu tiên màu của ảnh đầu tiên để ảnh lớn và màu được chọn luôn khớp nhau lúc mới vào trang
  const firstColor = p.images?.[0]?.color
  const first = p.variants?.find(v => v.color === firstColor && v.stock > 0)
    || p.variants?.find(v => v.stock > 0) || p.variants?.[0]
  activeIndex.value = 0
  size.value = first?.size || p.sizes[0] || ''
  color.value = first?.color || p.colors[0] || ''
  qty.value = 1
  notice.value = ''
  isAiRecommended.value = false
}

watch([size, color], () => { qty.value = Math.max(1, Math.min(qty.value, currentStock.value || 1)) })

let requestId = 0
async function loadProduct(id) {
  const token = ++requestId
  loading.value = true
  loadError.value = ''
  product.value = null
  related.value = []
  showChart.value = false
  chart.productId = ''
  try {
    const response = await getProductById(id)
    if (token !== requestId) return
    product.value = shop.upsertProduct(response.data.data)
    pickDefaults(product.value)
    loadRelated(product.value, token)
  } catch (error) {
    if (token !== requestId) return
    if (error.response?.status === 404) {
      loadError.value = 'notfound'
    } else {
      const local = shop.products.find(p => p.id === id)
      if (local) { product.value = local; pickDefaults(local) }
      else loadError.value = 'error'
    }
  } finally {
    if (token === requestId) loading.value = false
  }
}

async function loadRelated(p, token) {
  if (!p.categoryId) return
  try {
    const response = await getProducts({ category: p.categoryId })
    if (token !== requestId) return
    related.value = response.data.data.filter(x => x.id !== p.id).slice(0, 4).map(normalizeProduct)
  } catch {
    related.value = []
  }
}

watch(() => route.params.id, (id) => { if (id) loadProduct(String(id)) }, { immediate: true })

async function openChart() {
  showChart.value = true
  const id = product.value.id
  if (chart.productId === id) return
  Object.assign(chart, { productId: id, rows: [], loading: true, error: '', message: '' })
  try {
    const response = await getProductSizeChart(id)
    if (chart.productId !== id) return
    Object.assign(chart, { rows: response.data.data || [], message: response.data.message || '', loading: false })
  } catch {
    if (chart.productId !== id) return
    Object.assign(chart, { error: 'Không thể tải bảng kích thước. Vui lòng thử lại.', loading: false, productId: '' })
  }
}

// Thêm vào giỏ hàng (Chặn khách vãng lai)
async function add() {
  if (!hasUserToken()) {
    alert('Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng!')
    router.push({ path: '/dang-nhap', query: { redirect: route.fullPath } })
    return
  }

  if (currentStock.value <= 0) {
    notice.value = 'Lựa chọn này đã hết hàng. Vui lòng chọn size hoặc màu khác.'
    return
  }

  const result = await shop.addToCart(
    product.value.id,
    size.value,
    color.value,
    qty.value,
    {
      isAiRecommended: isAiRecommended.value,
      aiFitNote: isAiRecommended.value ? `Size ${size.value} được gợi ý bởi AI` : null,
    }
  )

  if (result.requireLogin) {
    alert(result.message)
    router.push({ path: '/dang-nhap', query: { redirect: route.fullPath } })
    return
  }

  notice.value = result.message
}
</script>

<template>
  <main class="hqa-page">
    <div v-if="loading" class="hqa-empty" role="status"><p class="hqa-dim">Đang tải sản phẩm...</p></div>
    <template v-else-if="product">
      <nav class="hqa-breadcrumb" aria-label="Đường dẫn"><router-link to="/">Trang chủ</router-link> › <router-link to="/san-pham">Sản phẩm</router-link> › {{ product.name }}</nav>
      <div class="hqa-detail">
        <div class="hqa-detail-media">
          <div class="hqa-detail-figure"><img :src="activeImage.url" :alt="activeImage.color ? `${product.name} - màu ${activeImage.color}` : product.name" /></div>
          <div v-if="images.length > 1" class="hqa-thumbs" role="list" aria-label="Các mẫu của sản phẩm">
            <button v-for="(img, i) in images" :key="img.url" type="button" role="listitem" class="hqa-thumb" :class="{ active: i === activeIndex }" :aria-label="img.color ? `Xem mẫu màu ${img.color}` : `Xem ảnh ${i + 1}`" :aria-current="i === activeIndex" @click="selectImage(i)">
              <img :src="img.url" :alt="img.color || `Ảnh ${i + 1}`" loading="lazy" />
              <span v-if="img.color">{{ img.color }}</span>
            </button>
          </div>
        </div>
        <div class="hqa-detail-info">
          <div class="hqa-eyebrow">HQA · {{ (product.categoryName || 'THỜI TRANG NỮ').toLocaleUpperCase('vi') }}</div><h1>{{ product.name }}</h1>
          <p class="hqa-dim">Mã sản phẩm: {{ product.id }} · {{ currentStock > 0 ? `Còn ${currentStock} sản phẩm` : 'Hết hàng' }}</p>
          <div class="hqa-detail-price">{{ money(product.price) }} <span v-if="product.oldPrice>product.price" class="hqa-old-price">{{ money(product.oldPrice) }}</span></div>
          <p class="hqa-detail-description">{{ product.description }}</p>
          <div class="hqa-detail-option"><strong>Màu sắc: {{ color }}</strong><div class="hqa-swatch-row"><button v-for="item in product.colors" :key="item" type="button" class="hqa-swatch" :class="{selected:color===item, 'is-out':!colorInStock(item), 'has-thumb':!!colorThumb(item)}" :aria-pressed="color===item" @click="pickColor(item)"><img v-if="colorThumb(item)" class="hqa-swatch-thumb" :src="colorThumb(item)" alt="" loading="lazy" />{{ item }}</button></div></div>
          <div class="hqa-detail-option"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><strong style="margin:0">Kích thước: {{ size }}</strong><button type="button" class="hqa-link-button" @click="openChart">Xem bảng size</button></div><div class="hqa-swatch-row" style="margin-top:11px"><button v-for="item in product.sizes" :key="item" type="button" class="hqa-swatch" :class="{selected:size===item, 'is-out':!sizeInStock(item)}" :aria-pressed="size===item" @click="pickSize(item)">{{ item }}</button></div></div>
          <button type="button" class="hqa-secondary" style="margin-top:16px" @click="showAdvisor=true">✧ Nhờ trợ lý tư vấn size phù hợp</button>
          <div class="hqa-buy-actions"><div class="hqa-qty" aria-label="Số lượng"><button type="button" aria-label="Giảm số lượng" :disabled="qty<=1" @click="qty--">−</button><span>{{ qty }}</span><button type="button" aria-label="Tăng số lượng" :disabled="qty>=currentStock" @click="qty++">+</button></div><button class="hqa-primary" type="button" :disabled="currentStock<=0" @click="add">Thêm vào giỏ hàng →</button></div>
          <div v-if="notice" :class="['hqa-alert', notice.startsWith('Đã') ? 'hqa-success' : '']" role="status">{{ notice }} <router-link v-if="notice.startsWith('Đã')" to="/gio-hang" style="text-decoration:underline">Xem giỏ hàng</router-link></div>
          <button type="button" class="hqa-link-button" @click="shop.toggleFavorite(product.id)">{{ shop.favorites.includes(product.id) ? '♥ Đã lưu yêu thích' : '♡ Thêm vào yêu thích' }}</button>
          <div class="hqa-line"></div><p class="hqa-dim">✧ Miễn phí vận chuyển đơn từ 600.000đ</p><p class="hqa-dim">✧ Vui lòng kiểm tra bảng size trước khi đặt hàng</p>
        </div>
      </div>
      <section v-if="related.length" style="margin-top:72px"><div class="hqa-head"><div class="hqa-eyebrow">YOU MAY ALSO LIKE</div><h2 class="hqa-page-title">Có thể nàng sẽ thích</h2></div><div class="hqa-product-grid"><HqaProductCard v-for="item in related" :key="item.id" :product="item" /></div></section>
      <div v-if="showChart" class="hqa-modal-backdrop" @click.self="showChart=false"><div class="hqa-modal" role="dialog" aria-modal="true" aria-label="Bảng kích thước"><div class="hqa-modal-heading"><h2>Bảng kích thước</h2><button class="hqa-close" type="button" aria-label="Đóng" @click="showChart=false">×</button></div>
        <p class="hqa-dim" style="margin-top:0">{{ product.name }}</p>
        <p v-if="chart.loading" class="hqa-dim" role="status">Đang tải bảng kích thước...</p>
        <div v-else-if="chart.error" class="hqa-alert" role="alert">{{ chart.error }} <button type="button" class="hqa-link-button" @click="openChart">Thử lại</button></div>
        <p v-else-if="!chart.rows.length" class="hqa-dim">{{ chart.message || 'Sản phẩm này chưa có bảng kích thước.' }}</p>
        <template v-else>
          <p class="hqa-dim">Đơn vị: centimet (cm), cân nặng tính bằng kg. Số đo chỉ mang tính tham khảo.</p>
          <div class="hqa-scroll-x"><table class="hqa-chart-table"><thead><tr><th>Size</th><th>Ngực</th><th>Eo</th><th>Hông</th><th>Cao</th><th>Nặng</th></tr></thead><tbody><tr v-for="row in chart.rows" :key="row.size" :class="{'hqa-row-active': row.size===size}"><th>{{ row.size }}</th><td>{{row.chestMin}}–{{row.chestMax}}</td><td>{{row.waistMin}}–{{row.waistMax}}</td><td>{{row.hipMin}}–{{row.hipMax}}</td><td>{{row.heightMin}}–{{row.heightMax}}</td><td>{{row.weightMin}}–{{row.weightMax}}</td></tr></tbody></table></div>
          <p class="hqa-dim" style="margin-top:10px">Dòng được tô nền là size bạn đang chọn.</p>
        </template>
        <button class="hqa-primary" style="margin-top:19px" @click="showChart=false">Đã hiểu</button></div></div>
      <div v-if="showAdvisor" class="hqa-modal-backdrop" @click.self="showAdvisor=false"><div class="hqa-modal" style="padding:0" role="dialog" aria-modal="true" aria-label="Tư vấn size"><div style="padding:12px 14px;background:#fff;display:flex;justify-content:flex-end"><button class="hqa-close" type="button" aria-label="Đóng" @click="showAdvisor=false">×</button></div><HqaSizeAdvisor :product="product" @choose-size="pickAiSize($event)" /></div></div>
    </template>
    <div v-else-if="loadError==='error'" class="hqa-empty"><h1>Không thể tải sản phẩm</h1><p class="hqa-dim">Vui lòng kiểm tra kết nối rồi thử lại.</p><button class="hqa-primary" @click="loadProduct(String(route.params.id))">Thử lại</button></div>
    <div v-else class="hqa-empty"><h1>Không tìm thấy sản phẩm</h1><button class="hqa-primary" @click="router.push('/san-pham')">Quay về cửa hàng</button></div>
  </main>
</template>