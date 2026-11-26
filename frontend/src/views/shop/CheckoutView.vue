<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getMyProfile, getUserToken } from '../../services/api'
import { useHqaShopStore } from '../../stores/hqaShop'
import { money } from '../../data/hqaCatalog'
import '../../assets/hqa-pages.css'

const shop = useHqaShopStore()
const router = useRouter()
const form = ref({
  name: shop.viewer?.name || '',
  phone: shop.viewer?.phone || '',
  email: shop.viewer?.email || '',
  address: shop.viewer?.address || '',
  note: '',
  payment: 'cod',
})
const submittedOrder = ref('')
const error = ref('')
const loadingProfile = ref(false)
const profileMessage = ref('')
const profileAddress = ref('')
const shipping = computed(() => shop.subtotal >= 600000 || !shop.subtotal ? 0 : 30000)

// Không ghi đè thông tin khách đã tự sửa trong lúc API đang tải hồ sơ.
const changedByCustomer = { name: false, phone: false, email: false, address: false }
let pageActive = true

async function fillFromProfile() {
  const token = getUserToken()
  if (!token) return // Khách chưa đăng nhập vẫn có thể nhập địa chỉ thủ công.

  loadingProfile.value = true
  profileMessage.value = ''
  try {
    const { data } = await getMyProfile()
    // Không dùng dữ liệu trả về từ phiên cũ nếu khách đã đăng xuất/đổi tài khoản.
    if (!pageActive || getUserToken() !== token) return
    const user = data?.user
    if (!user) throw new Error('Không đọc được thông tin khách hàng.')

    const fields = {
      name: user.full_name,
      phone: user.phone,
      email: user.email,
      address: user.address,
    }
    for (const [key, value] of Object.entries(fields)) {
      if (!changedByCustomer[key] && typeof value === 'string') {
        form.value[key] = value
      }
    }

    profileAddress.value = String(user.address || '').trim()
    profileMessage.value = profileAddress.value
      ? (changedByCustomer.address
          ? 'Đã tìm thấy địa chỉ trong hồ sơ; địa chỉ bạn đang nhập được giữ nguyên.'
          : 'Bạn có thể chỉnh sửa địa chỉ cho đơn hàng này.')
      : 'Bạn chưa lưu địa chỉ trong hồ sơ. Vui lòng nhập địa chỉ nhận hàng.'
  } catch (err) {
    if (!pageActive || getUserToken() !== token) return
    profileMessage.value = 'Chưa tải được địa chỉ đã lưu. Bạn vẫn có thể nhập địa chỉ nhận hàng thủ công.'
  } finally {
    if (pageActive) loadingProfile.value = false
  }
}

onMounted(() => { fillFromProfile(); shop.loadCart() })
onBeforeUnmount(() => { pageActive = false })

async function submit() {
  if (shop.cartBusy || shop.cartLoading) return
  error.value = ''
  if (!form.value.name.trim() || !/^0\d{9}$/.test(form.value.phone.replace(/\s/g, '')) || !form.value.address.trim()) {
    error.value = 'Vui lòng nhập họ tên, số điện thoại Việt Nam gồm 10 chữ số bắt đầu bằng 0 và địa chỉ giao hàng.'
    return
  }
  if (form.value.address.trim().length > 500) {
    error.value = 'Địa chỉ giao hàng không được vượt quá 500 ký tự.'
    return
  }
  if (form.value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
    error.value = 'Email chưa đúng định dạng.'
    return
  }
  // Dùng địa chỉ đang hiển thị trong ô nhập, không thay bằng địa chỉ hồ sơ.
  // Việc chỉnh sửa ở đây chỉ áp dụng cho đơn này, không tự cập nhật hồ sơ khách hàng.
  const id = await shop.placeOrder({ ...form.value })
  if (!id) {
    error.value = shop.cartError || 'Giỏ hàng trống hoặc một số sản phẩm đã vượt tồn kho.'
    return
  }
  submittedOrder.value = id
  window.scrollTo?.({ top: 0, behavior: 'smooth' })
}
</script>
<template>
  <main class="hqa-page">
    <nav class="hqa-breadcrumb"><router-link to="/">Trang chủ</router-link> › <router-link to="/gio-hang">Giỏ hàng</router-link> › Thanh toán</nav>
    <div v-if="submittedOrder" class="hqa-order-done"><h3 class="hqa-page-title">Đặt hàng thành công!</h3><p>Đơn hàng <strong>{{submittedOrder}}</strong> đã được tạo.</p><router-link class="hqa-primary" to="/san-pham">Tiếp tục mua sắm</router-link><button type="button" style="margin-left:10px" class="hqa-outline" @click="router.push('/tai-khoan')">Xem đơn hàng</button></div>
    <template v-else><div class="hqa-eyebrow">CHECKOUT</div><h1 class="hqa-page-title">Thông tin đặt hàng</h1>
      <div v-if="shop.cartError" class="hqa-alert" role="alert">{{ shop.cartError }}</div><div v-if="shop.cartLoading" class="hqa-empty">Đang tải giỏ hàng...</div><div v-else-if="!shop.cartDetails.length" class="hqa-empty"><h2>Chưa có sản phẩm để thanh toán</h2><router-link class="hqa-primary" to="/san-pham">Đi mua sắm</router-link></div>
      <div v-else class="hqa-split" style="margin-top:25px">
        <form class="hqa-panel" @submit.prevent="submit"><h3>Thông tin giao hàng</h3><div class="hqa-form-grid"><div class="hqa-form-field"><label for="checkout-name">Họ và tên *</label><input id="checkout-name" v-model.trim="form.name" @input="changedByCustomer.name = true" required autocomplete="name" /></div><div class="hqa-form-field"><label for="checkout-phone">Số điện thoại *</label><input id="checkout-phone" v-model="form.phone" @input="changedByCustomer.phone = true" type="tel" autocomplete="tel" required placeholder="0xxxxxxxxx" /></div></div><div class="hqa-form-field"><label for="checkout-email">Email (không bắt buộc)</label><input id="checkout-email" v-model.trim="form.email" @input="changedByCustomer.email = true" type="email" autocomplete="email" /></div><div class="hqa-form-field"><label for="checkout-address">Địa chỉ nhận hàng *</label><textarea id="checkout-address" v-model.trim="form.address" @input="changedByCustomer.address = true" rows="3" maxlength="500" required placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"></textarea>
          <p v-if="loadingProfile" class="hqa-dim" role="status">Đang tải địa chỉ từ hồ sơ khách hàng...</p>
          <p v-else-if="profileMessage" class="hqa-dim" role="status">{{ profileMessage }}</p>
          </div><div class="hqa-form-field"><label for="checkout-note">Ghi chú cho cửa hàng</label><textarea id="checkout-note" v-model="form.note" rows="2" placeholder="Ghi chú (nếu có)"></textarea></div><h3>Phương thức thanh toán</h3><div class="hqa-note">◉ Thanh toán khi nhận hàng (COD) </div><div v-if="error" class="hqa-alert" role="alert">{{error}}</div><button class="hqa-primary" type="submit" :disabled="shop.cartBusy || shop.cartLoading" style="margin-top:18px;width:100%">{{ shop.cartBusy ? 'Đang đặt hàng...' : 'Xác nhận đặt hàng' }}</button></form>
        <aside class="hqa-panel"><h3>Đơn hàng của bạn</h3><div v-for="line in shop.cartDetails" :key="line.key" class="hqa-total-row"><span style="max-width:195px">{{line.product.name}}<br><small class="hqa-dim">{{line.size}} · {{line.color}} × {{line.qty}}</small></span><strong>{{money(line.qty*line.product.price)}}</strong></div><div class="hqa-line"></div><div class="hqa-total-row"><span>Tạm tính</span><strong>{{money(shop.subtotal)}}</strong></div><div class="hqa-total-row"><span>Vận chuyển</span><strong>{{shipping ? money(shipping) : 'Miễn phí'}}</strong></div><div class="hqa-total-row grand"><span>Thanh toán</span><strong>{{money(shop.subtotal+shipping)}}</strong></div></aside>
      </div>
    </template>
  </main>
</template>
