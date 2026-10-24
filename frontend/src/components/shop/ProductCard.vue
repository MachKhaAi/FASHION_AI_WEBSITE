<script setup>
import HqaIcon from "../common/HqaIcon.vue";
import { money } from "../../mocks/products";
import { demo, toggleLike, openProduct } from "../../stores/hqaDemo";
defineProps({ product: { type: Object, required: true } });
</script>
<template>
  <article class="product">
    <div :class="['ph', `tone${product.id % 4}`]">
      <button
        style="position: absolute; inset: 0; width: 100%"
        :aria-label="`Xem ${product.name}`"
        @click="openProduct(product)"
      />
      <span>Ảnh {{ product.name }}</span>
      <div class="labels" v-if="product.tag">
        <span
          :class="[
            'tag',
            {
              dark: product.tag === 'Best Seller',
              pink: product.tag === 'New',
            },
          ]"
          >{{ product.tag }}</span
        >
      </div>
      <button
        class="ib heart"
        :aria-label="`Yêu thích ${product.name}`"
        :aria-pressed="demo.liked.includes(product.id)"
        @click="toggleLike(product.id)"
      >
        <span v-if="demo.liked.includes(product.id)">♥</span
        ><HqaIcon v-else name="heart" />
      </button>
      <div class="quick">
        <button
          class="quick-size"
          :aria-label="`Chọn kích thước ${product.name}`"
          @click="openProduct(product)"
        >
          {{ product.id === 4 || product.id === 5 ? "—" : "M" }}
        </button>
        <button class="quick-add" @click="openProduct(product)">
          Chọn {{ product.id === 4 || product.id === 5 ? "mua" : "size" }} ·
          Thêm nhanh
        </button>
      </div>
    </div>
    <button class="product-name" @click="openProduct(product)">
      <h4>{{ product.name }}</h4>
    </button>
    <div class="swatches" aria-label="Màu minh họa: kem, hồng, nâu">
      <span></span><span></span><span></span>
    </div>
    <p>
      <b style="font-weight: 600">{{ money(product.price) }}</b
      ><span v-if="product.oldPrice" class="old">{{
        money(product.oldPrice)
      }}</span>
    </p>
  </article>
</template>
