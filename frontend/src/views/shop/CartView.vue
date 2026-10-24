<script setup>
import { useHqaShopStore } from '../../stores/hqaShop'
import { money } from '../../data/hqaCatalog'
import '../../assets/hqa-pages.css'
const shop = useHqaShopStore()
const shipping = () => shop.subtotal >= 600000 || shop.subtotal === 0 ? 0 : 30000
</script>
<template>
  <main class="hqa-page">
    <nav class="hqa-breadcrumb"><router-link to="/">Trang chủ</router-link> › Giỏ hàng</nav>
    <div class="hqa-eyebrow">YOUR SHOPPING BAG</div><h1 class="hqa-page-title">Giỏ hàng của bạn ({{shop.cartCount}})</h1>
    <div v-if="shop.cartDetails.length" class="hqa-split" style="margin-top:25px">
      <section class="hqa-panel">
        <div v-for="line in shop.cartDetails" :key="line.key" class="hqa-cart-row">
          <router-link :to="`/san-pham/${line.product.id}`"><img :src="line.product.image" :alt="line.product.name" /></router-link>
          <div><router-link :to="`/san-pham/${line.product.id}`"><h3>{{line.product.name}}</h3></router-link><p>Size: {{line.size}} · Màu: {{line.color}}</p><p class="hqa-price">{{money(line.product.price)}}</p><button type="button" class="hqa-link-button" @click="shop.removeFromCart(line.key)">Xóa sản phẩm</button></div>
          <div class="hqa-cart-row-side"><div class="hqa-qty"><button type="button" :disabled="line.qty<=1" @click="shop.updateQuantity(line.key,line.qty-1)">−</button><span>{{line.qty}}</span><button type="button" :disabled="line.qty>=line.product.stock" @click="shop.updateQuantity(line.key,line.qty+1)">+</button></div><strong>{{money(line.product.price*line.qty)}}</strong></div>
        </div>
        <router-link class="hqa-outline" style="margin-top:24px" to="/san-pham">← Tiếp tục mua sắm</router-link>
      </section>
      <aside class="hqa-panel"><h3>Tóm tắt đơn hàng</h3><div class="hqa-total-row"><span>Tạm tính</span><strong>{{money(shop.subtotal)}}</strong></div><div class="hqa-total-row"><span>Phí vận chuyển</span><strong>{{shipping() ? money(shipping()) : 'Miễn phí'}}</strong></div><div class="hqa-total-row grand"><span>Tổng cộng</span><strong>{{money(shop.subtotal+shipping())}}</strong></div><p class="hqa-summary-note">Miễn phí vận chuyển cho đơn từ 600.000đ. Giá chỉ mang tính minh họa trong phiên bản demo.</p><router-link class="hqa-primary" style="width:100%" to="/thanh-toan">Tiến hành đặt hàng →</router-link></aside>
    </div>
    <div v-else class="hqa-empty" style="margin-top:25px"><div class="hqa-empty-icon">♡</div><h2>Giỏ hàng của bạn đang trống</h2><p class="hqa-dim">Hãy chọn những món đồ xinh xắn cho riêng mình.</p><router-link class="hqa-primary" to="/san-pham">Khám phá sản phẩm</router-link></div>
  </main>
</template>
