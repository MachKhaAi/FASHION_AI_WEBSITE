<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHqaShopStore } from '../../stores/hqaShop'
import { money } from '../../data/hqaCatalog'
import HqaSizeAdvisor from '../../components/chatbot/HqaSizeAdvisor.vue'
import HqaProductCard from '../../components/shop/HqaProductCard.vue'
import '../../assets/hqa-pages.css'
const shop = useHqaShopStore(), route = useRoute(), router = useRouter()
const product = computed(() => shop.products.find(p => p.id === route.params.id))
const size = ref(''), color = ref(''), qty = ref(1), notice = ref(''), showChart = ref(false), showAdvisor = ref(false)
watch(product, p => { size.value = p?.sizes[0] || ''; color.value = p?.colors[0] || ''; qty.value = 1; notice.value = '' }, { immediate: true })
const related = computed(() => shop.products.filter(p => p.id !== product.value?.id && p.categoryId === product.value?.categoryId).slice(0,4))
function add() {
  notice.value = shop.addToCart(product.value.id, size.value, color.value, qty.value) ? 'Đã thêm sản phẩm vào giỏ hàng ♡' : 'Không thể thêm: số lượng vượt quá tồn kho hoặc tùy chọn không hợp lệ.'
}
</script>
<template>
  <main class="hqa-page">
    <template v-if="product">
      <nav class="hqa-breadcrumb" aria-label="Đường dẫn"><router-link to="/">Trang chủ</router-link> › <router-link to="/san-pham">Sản phẩm</router-link> › {{ product.name }}</nav>
      <div class="hqa-detail">
        <div class="hqa-detail-figure"><img :src="product.image" :alt="product.name" /></div>
        <div class="hqa-detail-info">
          <div class="hqa-eyebrow">HQA · THỜI TRANG NỮ</div><h1>{{ product.name }}</h1>
          <p class="hqa-dim">Mã sản phẩm: {{ product.id }} · {{ product.stock > 0 ? `Còn ${product.stock} sản phẩm` : 'Hết hàng' }}</p>
          <div class="hqa-detail-price">{{ money(product.price) }} <span v-if="product.oldPrice>product.price" class="hqa-old-price">{{ money(product.oldPrice) }}</span></div>
          <p class="hqa-detail-description">{{ product.description }}</p>
          <div class="hqa-detail-option"><strong>Màu sắc: {{ color }}</strong><div class="hqa-swatch-row"><button v-for="item in product.colors" :key="item" type="button" class="hqa-swatch" :class="{selected:color===item}" @click="color=item">{{ item }}</button></div></div>
          <div class="hqa-detail-option"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><strong style="margin:0">Kích thước: {{ size }}</strong><button type="button" class="hqa-link-button" @click="showChart=true">Xem bảng size</button></div><div class="hqa-swatch-row" style="margin-top:11px"><button v-for="item in product.sizes" :key="item" type="button" class="hqa-swatch" :class="{selected:size===item}" @click="size=item">{{ item }}</button></div></div>
          <button type="button" class="hqa-secondary" style="margin-top:16px" @click="showAdvisor=true">✧ Nhờ trợ lý tư vấn size phù hợp</button>
          <div class="hqa-buy-actions"><div class="hqa-qty" aria-label="Số lượng"><button type="button" aria-label="Giảm số lượng" :disabled="qty<=1" @click="qty--">−</button><span>{{ qty }}</span><button type="button" aria-label="Tăng số lượng" :disabled="qty>=product.stock" @click="qty++">+</button></div><button class="hqa-primary" type="button" :disabled="product.stock<=0" @click="add">Thêm vào giỏ hàng →</button></div>
          <div v-if="notice" :class="['hqa-alert', notice.startsWith('Đã') ? 'hqa-success' : '']" role="status">{{ notice }} <router-link v-if="notice.startsWith('Đã')" to="/gio-hang" style="text-decoration:underline">Xem giỏ hàng</router-link></div>
          <button type="button" class="hqa-link-button" @click="shop.toggleFavorite(product.id)">{{ shop.favorites.includes(product.id) ? '♥ Đã lưu yêu thích' : '♡ Thêm vào yêu thích' }}</button>
          <div class="hqa-line"></div><p class="hqa-dim">✧ Miễn phí vận chuyển đơn từ 600.000đ</p><p class="hqa-dim">✧ Vui lòng kiểm tra bảng size trước khi đặt hàng</p>
        </div>
      </div>
      <section v-if="related.length" style="margin-top:72px"><div class="hqa-head"><div class="hqa-eyebrow">YOU MAY ALSO LIKE</div><h2 class="hqa-page-title">Có thể nàng sẽ thích</h2></div><div class="hqa-product-grid"><HqaProductCard v-for="item in related" :key="item.id" :product="item" /></div></section>
      <div v-if="showChart" class="hqa-modal-backdrop" @click.self="showChart=false"><div class="hqa-modal" role="dialog" aria-modal="true" aria-label="Bảng size tham khảo"><div class="hqa-modal-heading"><h2>Bảng size tham khảo</h2><button class="hqa-close" type="button" aria-label="Đóng" @click="showChart=false">×</button></div><p class="hqa-dim">Đơn vị: centimet (cm), cân nặng tính bằng kg. Số liệu đang là dữ liệu minh họa.</p><div class="hqa-scroll-x"><table class="hqa-chart-table"><thead><tr><th>Size</th><th>Ngực</th><th>Eo</th><th>Hông</th><th>Cao</th><th>Nặng</th></tr></thead><tbody><tr v-for="row in shop.sizeChart.filter(r=>product.sizes.includes(r.size))" :key="row.size"><th>{{ row.size }}</th><td>{{row.chestMin}}–{{row.chestMax}}</td><td>{{row.waistMin}}–{{row.waistMax}}</td><td>{{row.hipMin}}–{{row.hipMax}}</td><td>{{row.heightMin}}–{{row.heightMax}}</td><td>{{row.weightMin}}–{{row.weightMax}}</td></tr></tbody></table></div><button class="hqa-primary" style="margin-top:19px" @click="showChart=false">Đã hiểu</button></div></div>
      <div v-if="showAdvisor" class="hqa-modal-backdrop" @click.self="showAdvisor=false"><div class="hqa-modal" style="padding:0" role="dialog" aria-modal="true" aria-label="Tư vấn size"><div style="padding:12px 14px;background:#fff;display:flex;justify-content:flex-end"><button class="hqa-close" type="button" aria-label="Đóng" @click="showAdvisor=false">×</button></div><HqaSizeAdvisor :product="product" @choose-size="chosen => {size=chosen;showAdvisor=false}" /></div></div>
    </template>
    <div v-else class="hqa-empty"><h1>Không tìm thấy sản phẩm</h1><button class="hqa-primary" @click="router.push('/san-pham')">Quay về cửa hàng</button></div>
  </main>
</template>
