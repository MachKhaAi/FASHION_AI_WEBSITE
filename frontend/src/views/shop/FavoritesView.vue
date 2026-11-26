<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { hasUserToken, useHqaShopStore } from '../../stores/hqaShop'
import HqaProductCard from '../../components/shop/HqaProductCard.vue'
import '../../assets/hqa-pages.css'

const shop = useHqaShopStore()
const router = useRouter()
const loading = ref(true)
const catalogError = ref('')

async function load() {
  if (!hasUserToken()) {
    router.replace({ path: '/dang-nhap', query: { redirect: '/yeu-thich' } })
    return
  }
  loading.value = true
  catalogError.value = ''
  try {
    if (!shop.catalogLoaded) await shop.fetchCatalog()
    await shop.fetchFavorites()
    if (!shop.catalogLoaded) catalogError.value = 'Không tải được thông tin sản phẩm.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <main class="hqa-page">
    <nav class="hqa-breadcrumb"><router-link to="/">Trang chủ</router-link> › Yêu thích</nav>
    <div class="hqa-head">
      <div class="hqa-eyebrow">MY FAVORITES</div>
      <h1 class="hqa-page-title">Sản phẩm yêu thích ♡</h1>
      <p class="hqa-subtitle">Những sản phẩm bạn đã lưu vào tài khoản.</p>
    </div>
    <div v-if="loading || shop.favoritesLoading" class="hqa-empty" role="status">Đang tải sản phẩm yêu thích...</div>
    <div v-else-if="shop.favoritesError || catalogError" class="hqa-alert" role="alert">
      {{ shop.favoritesError || catalogError }}
      <button type="button" class="hqa-link-button" @click="load">Thử lại</button>
    </div>
    <div v-else-if="shop.favoriteProducts.length" class="hqa-product-grid">
      <HqaProductCard v-for="item in shop.favoriteProducts" :key="item.id" :product="item" />
    </div>
    <div v-else class="hqa-empty">
      <div class="hqa-empty-icon">♡</div>
      <h2>Chưa có sản phẩm yêu thích</h2>
      <p class="hqa-dim">Nhấn trái tim trên sản phẩm để lưu vào danh sách này.</p>
      <router-link class="hqa-primary" to="/san-pham">Khám phá sản phẩm</router-link>
    </div>
  </main>
</template>
