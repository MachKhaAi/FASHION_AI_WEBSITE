<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useHqaShopStore } from '../../stores/hqaShop'
import HqaProductCard from '../../components/shop/HqaProductCard.vue'
import '../../assets/hqa-pages.css'
const shop = useHqaShopStore()
const route = useRoute()
const category = ref(String(route.query['danh-muc'] || 'all'))
const search = ref(String(route.query.tim || ''))
const sort = ref('newest')
watch(() => route.query, q => { category.value = String(q['danh-muc'] || 'all'); search.value = String(q.tim || '') })
const filtered = computed(() => {
  let list = shop.products.filter(p => (category.value === 'all' || p.categoryId === category.value) && p.name.toLocaleLowerCase('vi').includes(search.value.trim().toLocaleLowerCase('vi')))
  if (sort.value === 'price-asc') list = [...list].sort((a,b) => a.price-b.price)
  else if (sort.value === 'price-desc') list = [...list].sort((a,b) => b.price-a.price)
  else if (sort.value === 'name') list = [...list].sort((a,b) => a.name.localeCompare(b.name, 'vi'))
  return list
})
const loading = ref(false)
const apiError = ref('')

onMounted(async () => {
  loading.value = true
  apiError.value = ''

  try {
    await shop.fetchProducts()
  } catch {
    apiError.value = 'Không thể tải sản phẩm. Vui lòng thử lại.'
  } finally {
    loading.value = false
  }
})
</script>
<template>
  <main class="hqa-page">
    <nav class="hqa-breadcrumb" aria-label="Đường dẫn"><router-link to="/">Trang chủ</router-link><span>›</span><span>Sản phẩm</span></nav>
    <div class="hqa-head"><div class="hqa-eyebrow">HQA COLLECTION</div><h1 class="hqa-page-title">Bộ sưu tập của nàng</h1><p class="hqa-subtitle">Khám phá những thiết kế ngọt ngào, thanh lịch và dễ dàng thể hiện phong cách riêng.</p></div>
    <div class="hqa-filter-bar">
      <div class="hqa-chips" aria-label="Lọc theo danh mục">
        <button type="button" class="hqa-chip" :class="{active: category === 'all'}" @click="category='all'">Tất cả</button>
        <button v-for="item in shop.categories" :key="item.id" type="button" class="hqa-chip" :class="{active:category===item.id}" @click="category=item.id">{{ item.name }}</button>
      </div>
      <div class="hqa-search-row">
        <input v-model="search" type="search" placeholder="Tìm tên sản phẩm..." aria-label="Tìm sản phẩm" />
        <select v-model="sort" aria-label="Sắp xếp sản phẩm"><option value="newest">Mới nhất</option><option value="price-asc">Giá tăng dần</option><option value="price-desc">Giá giảm dần</option><option value="name">Tên A–Z</option></select>
      </div>
    </div>
    <div class="hqa-list-status"><span>Hiển thị <strong>{{ filtered.length }}</strong> sản phẩm</span><router-link to="/yeu-thich">♡ Danh sách yêu thích ({{ shop.favorites.length }})</router-link></div>
    <div v-if="filtered.length" class="hqa-product-grid"><HqaProductCard v-for="item in filtered" :key="item.id" :product="item" /></div>
    <div v-else class="hqa-empty"><div class="hqa-empty-icon">✿</div><h2>Chưa tìm thấy sản phẩm</h2><p class="hqa-dim">Hãy thử từ khóa hoặc danh mục khác nhé.</p><button class="hqa-secondary" @click="search='';category='all'">Xem tất cả sản phẩm</button></div>
  </main>
</template>