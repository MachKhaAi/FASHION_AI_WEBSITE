<script setup>
import { useHqaShopStore } from '../../stores/hqaShop'
import HqaProductCard from '../../components/shop/HqaProductCard.vue'
import '../../assets/hqa-pages.css'
const shop = useHqaShopStore()
</script>
<template>
  <main class="hqa-page">
    <nav class="hqa-breadcrumb"><router-link to="/">Trang chủ</router-link> › Yêu thích</nav>
    <div class="hqa-head"><div class="hqa-eyebrow">MY FAVORITES</div><h1 class="hqa-page-title">Sản phẩm yêu thích ♡</h1><p class="hqa-subtitle">Lưu lại những thiết kế khiến bạn rung động.</p></div>
    <div v-if="shop.favoriteProducts.length" class="hqa-product-grid"><HqaProductCard v-for="item in shop.favoriteProducts" :key="item.id" :product="item" /></div>
    <div v-else class="hqa-empty"><div class="hqa-empty-icon">♡</div><h2>Chưa có sản phẩm yêu thích</h2><p class="hqa-dim">Chạm vào biểu tượng trái tim để lưu sản phẩm nhé.</p><router-link class="hqa-primary" to="/san-pham">Khám phá sản phẩm</router-link></div>
  </main>
</template>
