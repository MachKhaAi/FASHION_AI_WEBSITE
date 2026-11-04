<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getMyProfile, updateMyProfile, getUserToken, clearUserToken } from '../../services/api'
import { useHqaShopStore, canCancelOrder } from '../../stores/hqaShop'
import '../../assets/hqa-pages.css'

const shop = useHqaShopStore()
const money = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + 'đ'
const router = useRouter()

const form = ref({ name: '', email: '', phone: '' })
const message = ref('')
const error = ref('')
const saving = ref(false)
const cancelling = ref('')

const displayName = computed(() => form.value.name || shop.viewer?.name || 'Khách hàng')
const orders = computed(() => shop.orders)

const BADGE = {
  pending: 'background:#fff3e0;color:#a65f00',
  confirmed: 'background:#e6f4ea;color:#1e6b3a',
  shipping: 'background:#e3f0fb;color:#1a5a96',
  completed: 'background:#e6f4ea;color:#1e6b3a',
  cancelled: 'background:#fdeaea;color:#b3261e',
}
const badgeStyle = (o) => BADGE[o.statusCode] || (String(o.status).startsWith('Đã hủy') ? BADGE.cancelled : BADGE.pending)
const when = (iso) => {
  try { const d = new Date(iso); return `${d.toLocaleTimeString('vi-VN')} ${d.toLocaleDateString('vi-VN')}` } catch { return '' }
}

function goLogin() {
  router.replace({ path: '/dang-nhap', query: { redirect: '/tai-khoan' } })
}

async function load() {
  if (getUserToken()) {
    try {
      const { data } = await getMyProfile()
      form.value = { name: data.user.full_name, email: data.user.email, phone: data.user.phone || '' }
      shop.setViewer({ name: data.user.full_name, email: data.user.email, phone: data.user.phone })
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 404) { clearUserToken(); return goLogin() }
      error.value = err.response?.data?.message || 'Không thể kết nối máy chủ.'
    }
    shop.fetchMyOrders()
  } else if (shop.viewer) {
    form.value = { name: shop.viewer.name, email: shop.viewer.email, phone: shop.viewer.phone || '' }
  } else {
    goLogin()
  }
}

async function save() {
  error.value = ''
  message.value = ''
  if (form.value.name.trim().length < 2) { error.value = 'Họ tên phải có ít nhất 2 ký tự.'; return }
  if (form.value.phone && !/^0\d{9}$/.test(form.value.phone.replace(/\s/g, ''))) {
    error.value = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.'
    return
  }
  saving.value = true
  try {
    if (getUserToken()) {
      const { data } = await updateMyProfile({ full_name: form.value.name, phone: form.value.phone })
      shop.setViewer({ name: data.user.full_name, email: data.user.email, phone: data.user.phone })
    } else {
      shop.setViewer({ name: form.value.name, email: form.value.email, phone: form.value.phone })
    }
    message.value = 'Đã cập nhật thông tin cá nhân.'
  } catch (err) {
    if (err.response?.status === 401) { clearUserToken(); return goLogin() }
    error.value = err.response?.data?.message || 'Không thể kết nối máy chủ.'
  } finally {
    saving.value = false
  }
}

async function cancel(order) {
  if (!window.confirm(`Hủy đơn ${order.id}? Hàng sẽ được trả lại kho.`)) return
  cancelling.value = order.id
  await shop.cancelOrder(order.id)
  cancelling.value = ''
}

function logout() {
  clearUserToken()
  shop.logout()
  router.push('/')
}

onMounted(load)
</script>
<template>
  <main class="hqa-page">
    <div class="hqa-eyebrow">MY ACCOUNT</div>
    <h1 class="hqa-page-title">Tài khoản của tôi</h1>
    <div class="hqa-profile-cards" style="margin-top:25px">
      <aside class="hqa-panel">
        <div class="hqa-profile-avatar">{{ displayName.charAt(0).toUpperCase() }}</div>
        <h3 style="margin-bottom:4px">{{ displayName }}</h3>
        <p class="hqa-dim" style="margin-top:0">{{ form.email }}</p>
        <div class="hqa-line"></div>
        <p class="hqa-dim">Đơn hàng: <strong>{{ orders.length }}</strong></p>
        <p class="hqa-dim">Sản phẩm yêu thích: <strong>{{ shop.favorites.length }}</strong></p>
        <router-link class="hqa-outline" to="/yeu-thich" style="display:block;text-align:center">♡ Xem yêu thích</router-link>
        <p style="margin-top:18px"><button type="button" class="hqa-link-button" @click="logout">Đăng xuất</button></p>
      </aside>

      <div>
        <section class="hqa-panel">
          <h3>Thông tin cá nhân</h3>
          <div v-if="message" class="hqa-note" role="status">{{ message }}</div>
          <div v-if="error" class="hqa-alert" role="alert">{{ error }}</div>
          <form @submit.prevent="save">
            <div class="hqa-form-field"><label for="pf-name">Họ và tên</label><input id="pf-name" v-model.trim="form.name" required minlength="2" autocomplete="name" /></div>
            <div class="hqa-form-field"><label for="pf-email">Email</label><input id="pf-email" :value="form.email" disabled /></div>
            <div class="hqa-form-field"><label for="pf-phone">Số điện thoại</label><input id="pf-phone" v-model="form.phone" type="tel" autocomplete="tel" placeholder="0xxxxxxxxx" /></div>
            <button class="hqa-primary" type="submit" :disabled="saving">{{ saving ? 'Đang lưu...' : 'Lưu thay đổi' }}</button>
          </form>
        </section>

        <section class="hqa-panel" style="margin-top:24px">
          <h3>Đơn hàng đã đặt</h3>
          <div v-if="!orders.length" class="hqa-dim">Bạn chưa có đơn hàng nào. <router-link to="/san-pham" style="text-decoration:underline">Mua sắm ngay</router-link></div>
          <article v-for="order in orders" :key="order.id" class="hqa-order-card">
            <div class="top">
              <div><strong>{{ order.id }}</strong><div class="hqa-dim">{{ when(order.createdAt) }}</div></div>
              <span :style="badgeStyle(order)" style="align-self:flex-start;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600">{{ order.status }}</span>
            </div>
            <div class="items"><div v-for="(it, i) in order.items" :key="i">{{ it.name }} ({{ it.size }}<template v-if="it.color">, {{ it.color }}</template> × {{ it.qty }})</div></div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px">
              <strong>{{ money(order.subtotal + order.shipping) }}</strong>
              <button v-if="canCancelOrder(order)" type="button" class="hqa-outline" style="padding:7px 16px;min-height:0" :disabled="cancelling === order.id" @click="cancel(order)">{{ cancelling === order.id ? 'Đang hủy...' : 'Hủy đơn' }}</button>
              <span v-else-if="order.statusCode === 'shipping'" class="hqa-dim" style="font-size:13px">Đơn đang được giao, không thể hủy.</span>
            </div>
          </article>
        </section>
      </div>
    </div>
  </main>
</template>