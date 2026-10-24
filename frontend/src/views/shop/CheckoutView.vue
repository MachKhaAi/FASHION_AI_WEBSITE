<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHqaShopStore } from '../../stores/hqaShop'
import { money } from '../../data/hqaCatalog'
import '../../assets/hqa-pages.css'
const shop = useHqaShopStore(), router = useRouter()
const form = ref({ name: shop.viewer?.name || '', phone: shop.viewer?.phone || '', email: shop.viewer?.email || '', address: '', note: '', payment: 'cod' })
const submittedOrder = ref(''), error = ref('')
const shipping = computed(() => shop.subtotal >= 600000 || !shop.subtotal ? 0 : 30000)
function submit() {
  error.value = ''
  if (!form.value.name.trim() || !/^0\d{9}$/.test(form.value.phone.replace(/\s/g,'')) || !form.value.address.trim()) {
    error.value = 'Vui lòng nhập họ tên, số điện thoại Việt Nam gồm 10 chữ số bắt đầu bằng 0 và địa chỉ giao hàng.'; return
  }
  if (form.value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) { error.value = 'Email chưa đúng định dạng.'; return }
  const id = shop.placeOrder(form.value)
  if (!id) { error.value = 'Giỏ hàng trống hoặc một số sản phẩm đã vượt tồn kho.'; return }
  submittedOrder.value = id
  window.scrollTo?.({ top: 0, behavior: 'smooth' })
}
</script>
<template>
  <main class="hqa-page">
    <nav class="hqa-breadcrumb"><router-link to="/">Trang chủ</router-link> › <router-link to="/gio-hang">Giỏ hàng</router-link> › Thanh toán</nav>
    <div v-if="submittedOrder" class="hqa-order-done"><div class="icon">✓</div><h1 class="hqa-page-title">Đặt hàng thành công!</h1><p>Đơn hàng <strong>{{submittedOrder}}</strong> đã được tạo trong <strong>chế độ demo</strong> trên trình duyệt.</p><p class="hqa-dim">Đơn chưa được gửi lên máy chủ, chưa phát sinh thanh toán hoặc giao hàng thực tế.</p><router-link class="hqa-primary" to="/san-pham">Tiếp tục mua sắm</router-link><button type="button" style="margin-left:10px" class="hqa-outline" @click="router.push('/tai-khoan')">Xem đơn hàng</button></div>
    <template v-else><div class="hqa-eyebrow">CHECKOUT</div><h1 class="hqa-page-title">Thông tin đặt hàng</h1>
      <div v-if="!shop.cartDetails.length" class="hqa-empty"><h2>Chưa có sản phẩm để thanh toán</h2><router-link class="hqa-primary" to="/san-pham">Đi mua sắm</router-link></div>
      <div v-else class="hqa-split" style="margin-top:25px">
        <form class="hqa-panel" @submit.prevent="submit"><h3>Thông tin giao hàng</h3><p class="hqa-note">Đây là bản demo lưu thông tin ngay trên trình duyệt. Hãy dùng dữ liệu thử nghiệm, không nhập địa chỉ hoặc số điện thoại thật.</p><div class="hqa-form-grid"><div class="hqa-form-field"><label for="checkout-name">Họ và tên *</label><input id="checkout-name" v-model.trim="form.name" required autocomplete="name" /></div><div class="hqa-form-field"><label for="checkout-phone">Số điện thoại *</label><input id="checkout-phone" v-model="form.phone" type="tel" autocomplete="tel" required placeholder="0xxxxxxxxx" /></div></div><div class="hqa-form-field"><label for="checkout-email">Email (không bắt buộc)</label><input id="checkout-email" v-model.trim="form.email" type="email" autocomplete="email" /></div><div class="hqa-form-field"><label for="checkout-address">Địa chỉ nhận hàng *</label><textarea id="checkout-address" v-model.trim="form.address" rows="3" required placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"></textarea></div><div class="hqa-form-field"><label for="checkout-note">Ghi chú cho cửa hàng</label><textarea id="checkout-note" v-model="form.note" rows="2" placeholder="Ghi chú (nếu có)"></textarea></div><h3>Phương thức thanh toán</h3><div class="hqa-note">◉ Thanh toán khi nhận hàng (COD) — mô phỏng giao diện, không tạo giao dịch thực tế.</div><div v-if="error" class="hqa-alert" role="alert">{{error}}</div><button class="hqa-primary" type="submit" style="margin-top:18px;width:100%">Xác nhận đặt hàng demo →</button></form>
        <aside class="hqa-panel"><h3>Đơn hàng của bạn</h3><div v-for="line in shop.cartDetails" :key="line.key" class="hqa-total-row"><span style="max-width:195px">{{line.product.name}}<br><small class="hqa-dim">{{line.size}} · {{line.color}} × {{line.qty}}</small></span><strong>{{money(line.qty*line.product.price)}}</strong></div><div class="hqa-line"></div><div class="hqa-total-row"><span>Tạm tính</span><strong>{{money(shop.subtotal)}}</strong></div><div class="hqa-total-row"><span>Vận chuyển</span><strong>{{shipping ? money(shipping) : 'Miễn phí'}}</strong></div><div class="hqa-total-row grand"><span>Thanh toán</span><strong>{{money(shop.subtotal+shipping)}}</strong></div></aside>
      </div>
    </template>
  </main>
</template>
