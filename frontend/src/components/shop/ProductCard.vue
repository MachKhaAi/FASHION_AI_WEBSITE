<!-- File: src/components/shop/ProductCard.vue -->
<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import HqaIcon from "../common/HqaIcon.vue";
import { money } from "../../mocks/products";
import { useHqaShopStore } from "../../stores/hqaShop";
import { demo } from "../../stores/hqaDemo"; // Tạm dùng biến dialog của demo để trigger mở popup

const props = defineProps({ product: { type: Object, required: true } });
const router = useRouter();
const shop = useHqaShopStore();

// Sản phẩm thật (trong database) tương ứng với thẻ này
const realProduct = computed(() => shop.products.find((p) => p.name === props.product.name));
// Hết hàng khi sản phẩm có trong database và tồn kho <= 0
const soldOut = computed(() => !!realProduct.value && Number(realProduct.value.stock) <= 0);

// Chuyển hướng đến trang chi tiết sản phẩm thực tế khi bấm vào hình hoặc tên
function goToRealProduct() {
  router.push({ name: "hqa-products", query: { tim: props.product.name } });
}

// Mở hộp thoại chọn size thật
function openRealProductDialog(event) {
  event.stopPropagation(); // Ngăn sự kiện click kích hoạt chuyển trang

  if (!realProduct.value) {
    alert("Sản phẩm chưa có dữ liệu chi tiết thực tế.");
    return;
  }
  if (soldOut.value) {
    alert("Sản phẩm này đã hết hàng.");
    return;
  }
  const real = realProduct.value;

  // Dùng chung biến demo.dialog để trigger mở hộp thoại trên ShopLayout, nhưng nạp dữ liệu thật
  demo.dialog = {
    title: real.name,
    text: money(real.price),
    product: real, // Chứa thông tin biến thể thật
    size: real.sizes?.[0] || 'Một cỡ', // Size mặc định
    color: real.colors?.[0] || '', // Màu mặc định
    type: 'real_add' // Cờ báo hiệu đây là form thêm hàng thật
  };
}
</script>

<template>
  <article class="product">
    <div :class="['ph', `tone${product.id % 4}`]">
      <!-- Bấm vào hình thì sang trang chi tiết -->
      <button
        style="position: absolute; inset: 0; width: 100%"
        :aria-label="`Xem ${product.name}`"
        @click="goToRealProduct"
      />
      <img
        v-if="product.image"
        class="ph-img"
        :src="product.image"
        :alt="product.name"
        loading="lazy"
        :style="soldOut ? 'opacity:.55' : ''"
      />
      <span v-else>Ảnh {{ product.name }}</span>
      <div class="labels" v-if="soldOut || product.tag">
        <span v-if="soldOut" class="tag dark">Hết hàng</span>
        <span
          v-else
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
        :aria-pressed="shop.favorites.includes(product.id)"
        @click.stop="shop.toggleFavorite(product.id)"
      >
        <span v-if="shop.favorites.includes(product.id)">♥</span
        ><HqaIcon v-else name="heart" />
      </button>
      <div class="quick">
        <!-- Nút chọn size hiển thị popup -->
        <button
          class="quick-size"
          :aria-label="`Chọn kích thước ${product.name}`"
          :disabled="soldOut"
          @click.stop="openRealProductDialog"
        >
          {{ soldOut ? "—" : product.id === 4 || product.id === 5 ? "—" : "M" }}
        </button>
        <!-- Nút thêm nhanh cũng hiển thị popup -->
        <button class="quick-add" :disabled="soldOut" @click.stop="openRealProductDialog">
          <template v-if="soldOut">Đã hết hàng</template>
          <template v-else>
            Chọn {{ product.id === 4 || product.id === 5 ? "mua" : "size" }} ·
            Thêm nhanh
          </template>
        </button>
      </div>
    </div>
    <!-- Bấm vào tên thì sang trang chi tiết -->
    <button class="product-name" @click="goToRealProduct">
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