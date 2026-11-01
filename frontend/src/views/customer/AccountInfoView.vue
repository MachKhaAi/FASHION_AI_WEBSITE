<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  getUserToken,
  clearUserToken,
} from '../../services/api'
import { useHqaShopStore } from '../../stores/hqaShop'
import '../../assets/hqa-pages.css'

const router = useRouter()
const shop = useHqaShopStore()

const profile = ref(null)
const loading = ref(true)
const editing = ref(false)
const saving = ref(false)
const form = ref({ full_name: '', phone: '' })
const message = ref('')
const error = ref('')

const pw = ref({ current: '', next: '', confirm: '' })
const pwSaving = ref(false)
const pwMessage = ref('')
const pwError = ref('')

function goLogin() {
  clearUserToken()
  router.replace({ path: '/dang-nhap', query: { redirect: '/thong-tin-ca-nhan' } })
}

async function load() {
  if (!getUserToken()) return goLogin()
  try {
    const { data } = await getMyProfile()
    profile.value = data.user
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 404) return goLogin()
    error.value = err.response?.data?.message || 'Không thể kết nối máy chủ.'
  } finally {
    loading.value = false
  }
}

function startEdit() {
  message.value = ''
  error.value = ''
  form.value = { full_name: profile.value.full_name, phone: profile.value.phone || '' }
  editing.value = true
}

async function save() {
  error.value = ''
  message.value = ''
  if (form.value.full_name.trim().length < 2) {
    error.value = 'Họ tên phải có ít nhất 2 ký tự.'
    return
  }
  if (form.value.phone && !/^0\d{9}$/.test(form.value.phone.replace(/\s/g, ''))) {
    error.value = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.'
    return
  }
  saving.value = true
  try {
    const { data } = await updateMyProfile({
      full_name: form.value.full_name,
      phone: form.value.phone,
    })
    profile.value = data.user
    // Cập nhật luôn thông tin đang hiển thị ở các trang khác (ví dụ trang thanh toán)
    shop.setViewer({ name: data.user.full_name, email: data.user.email, phone: data.user.phone })
    editing.value = false
    message.value = 'Đã cập nhật thông tin cá nhân.'
  } catch (err) {
    if (err.response?.status === 401) return goLogin()
    error.value = err.response?.data?.message || 'Không thể kết nối máy chủ.'
  } finally {
    saving.value = false
  }
}

async function savePassword() {
  pwError.value = ''
  pwMessage.value = ''
  if (!pw.value.current) { pwError.value = 'Vui lòng nhập mật khẩu hiện tại.'; return }
  if (pw.value.next.length < 6) { pwError.value = 'Mật khẩu mới phải có ít nhất 6 ký tự.'; return }
  if (pw.value.next !== pw.value.confirm) { pwError.value = 'Mật khẩu xác nhận không khớp.'; return }
  pwSaving.value = true
  try {
    await changeMyPassword({ current_password: pw.value.current, new_password: pw.value.next })
    pw.value = { current: '', next: '', confirm: '' }
    pwMessage.value = 'Đã đổi mật khẩu thành công.'
  } catch (err) {
    if (err.response?.status === 401) return goLogin()
    pwError.value = err.response?.data?.message || 'Không thể kết nối máy chủ.'
  } finally {
    pwSaving.value = false
  }
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
    <nav class="hqa-breadcrumb"><router-link to="/">Trang chủ</router-link> › Thông tin cá nhân</nav>
    <div class="hqa-eyebrow">MY PROFILE</div>
    <h1 class="hqa-page-title">Thông tin cá nhân</h1>

    <div v-if="loading" class="hqa-dim">Đang tải thông tin...</div>

    <template v-else-if="profile">
      <div class="hqa-split" style="margin-top:25px">
        <section class="hqa-panel">
          <h3>Hồ sơ của bạn</h3>

          <div v-if="message" class="hqa-note" role="status">{{ message }}</div>
          <div v-if="error" class="hqa-alert" role="alert">{{ error }}</div>

          <template v-if="!editing">
            <div class="hqa-total-row"><span>Họ và tên</span><strong>{{ profile.full_name }}</strong></div>
            <div class="hqa-total-row"><span>Email</span><strong>{{ profile.email }}</strong></div>
            <div class="hqa-total-row"><span>Số điện thoại</span><strong>{{ profile.phone || 'Chưa cập nhật' }}</strong></div>
            <div class="hqa-total-row"><span>Loại tài khoản</span><strong>{{ profile.role === 'admin' ? 'Quản trị viên' : 'Khách hàng' }}</strong></div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
              <button type="button" class="hqa-primary" @click="startEdit">Chỉnh sửa thông tin</button>
              <router-link class="hqa-outline" to="/tai-khoan">Đơn hàng của tôi</router-link>
              <button type="button" class="hqa-outline" @click="logout">Đăng xuất</button>
            </div>
          </template>

          <form v-else @submit.prevent="save">
            <div class="hqa-form-field">
              <label for="acc-name">Họ và tên *</label>
              <input id="acc-name" v-model.trim="form.full_name" required minlength="2" autocomplete="name" />
            </div>
            <div class="hqa-form-field">
              <label for="acc-email">Email</label>
              <input id="acc-email" :value="profile.email" disabled />
              <small class="hqa-dim">Email dùng để đăng nhập nên không thể thay đổi.</small>
            </div>
            <div class="hqa-form-field">
              <label for="acc-phone">Số điện thoại</label>
              <input id="acc-phone" v-model="form.phone" type="tel" autocomplete="tel" placeholder="0xxxxxxxxx" />
            </div>
            <div style="display:flex;gap:10px;margin-top:10px">
              <button class="hqa-primary" type="submit" :disabled="saving">{{ saving ? 'Đang lưu...' : 'Lưu thay đổi' }}</button>
              <button type="button" class="hqa-outline" @click="editing = false">Hủy</button>
            </div>
          </form>
        </section>

        <aside class="hqa-panel">
          <h3>Đổi mật khẩu</h3>
          <div v-if="pwMessage" class="hqa-note" role="status">{{ pwMessage }}</div>
          <form @submit.prevent="savePassword">
            <div class="hqa-form-field">
              <label for="pw-current">Mật khẩu hiện tại</label>
              <input id="pw-current" v-model="pw.current" type="password" autocomplete="current-password" />
            </div>
            <div class="hqa-form-field">
              <label for="pw-next">Mật khẩu mới</label>
              <input id="pw-next" v-model="pw.next" type="password" autocomplete="new-password" placeholder="Ít nhất 6 ký tự" />
            </div>
            <div class="hqa-form-field">
              <label for="pw-confirm">Nhập lại mật khẩu mới</label>
              <input id="pw-confirm" v-model="pw.confirm" type="password" autocomplete="new-password" />
            </div>
            <div v-if="pwError" class="hqa-alert" role="alert">{{ pwError }}</div>
            <button class="hqa-primary" type="submit" :disabled="pwSaving" style="margin-top:10px">{{ pwSaving ? 'Đang lưu...' : 'Đổi mật khẩu' }}</button>
          </form>
        </aside>
      </div>
    </template>

    <div v-else-if="error" class="hqa-alert" role="alert">{{ error }}</div>
  </main>
</template>