<script setup>
import { computed } from 'vue'
import { useHqaShopStore } from '../../stores/hqaShop'
import { money } from '../../data/hqaCatalog'
import '../../assets/hqa-pages.css'
const props = defineProps({ product: { type: Object, required: true } })
const shop = useHqaShopStore()
const categoryName = computed(() => shop.categories.find(x => x.id === props.product.categoryId)?.name || 'Thời trang')
const discount = computed(() => props.product.oldPrice > props.product.price ? Math.round((props.product.oldPrice - props.product.price) / props.product.oldPrice * 100) : 0)
</script>
<template>
  <article class="hqa-product-card">
    <div class="hqa-product-image">
      <router-link :to="`/san-pham/${product.id}`" :aria-label="`Xem ${product.name}`">
        <span class="hqa-image-fallback">HQA</span>
        <img :src="product.image" :alt="product.name" loading="lazy" @error="e => e.target.style.opacity = '0'" />
      </router-link>
      <span v-if="discount" class="hqa-sale-badge">-{{ discount }}%</span>
      <button class="hqa-heart" :class="{ 'is-favorite': shop.favorites.includes(product.id) }" type="button"
        :aria-label="shop.favorites.includes(product.id) ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích'"
        :title="shop.favorites.includes(product.id) ? 'Bỏ yêu thích' : 'Yêu thích'"
        @click="shop.toggleFavorite(product.id)">{{ shop.favorites.includes(product.id) ? '♥' : '♡' }}</button>
    </div>
    <p class="hqa-product-category">{{ categoryName }}</p>
    <router-link :to="`/san-pham/${product.id}`"><h3 class="hqa-product-title">{{ product.name }}</h3></router-link>
    <span class="hqa-price">{{ money(product.price) }}</span>
    <span v-if="discount" class="hqa-old-price">{{ money(product.oldPrice) }}</span>
  </article>
</template>
