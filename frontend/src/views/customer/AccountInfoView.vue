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

// Danh sách số đo: dùng chung cho phần hiển thị, form và kiểm tra dữ liệu.
// min/max PHẢI khớp với MEASURE_RANGES trong routes/auth.js (backend).
// height/chest/waist/hip là cột integer nên step = 1; weight là numeric nên step = 0.1.
const MEASURES = [
  { key: 'height', label: 'Chiều cao', unit: 'cm', min: 100, max: 230, step: 1, placeholder: 'VD: 160' },
  { key: 'weight', label: 'Cân nặng', unit: 'kg', min: 20, max: 250, step: 0.1, placeholder: 'VD: 48.5' },
  { key: 'chest', label: 'Vòng ngực', unit: 'cm', min: 50, max: 160, step: 1, placeholder: 'VD: 82' },
  { key: 'waist', label: 'Vòng eo', unit: 'cm', min: 40, max: 160, step: 1, placeholder: 'VD: 62' },
  { key: 'hip', label: 'Vòng hông', unit: 'cm', min: 50, max: 170, step: 1, placeholder: 'VD: 88' },
]

const profile = ref(null)
const loading = ref(true)
const editing = ref(false)
const saving = ref(false)
const form = ref({
  full_name: '',
  phone: '',
  address: '',
  height: '',
  weight: '',
  chest: '',
  waist: '',
  hip: '',
})
const message = ref('')
const error = ref('')

const pw = ref({ current: '', next: '', confirm: '' })
const pwSaving = ref(false)
const pwMessage = ref('')
const pwError = ref('')

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function goLogin() {
  clearUserToken()
  router.replace({ path: '/dang-nhap', query: { redirect: '/thong-tin-ca-nhan' } })
}

function showMeasure(m) {
  const v = profile.value?.[m.key]
  return v === null || v === undefined ? '--' : `${v} ${m.unit}`
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
  const p = profile.value
  // Dùng ?? để giữ nguyên giá trị hợp lệ, chỉ đổi null/undefined thành chuỗi rỗng
  form.value = {
    full_name: p.full_name,
    phone: p.phone || '',
    address: p.address || '',
    height: p.height ?? '',
    weight: p.weight ?? '',
    chest: p.chest ?? '',
    waist: p.waist ?? '',
    hip: p.hip ?? '',
  }
  editing.value = true
}

async function save() {
  error.value = ''
  message.value = ''

  if (form.value.full_name.trim().length < 2) {
    error.value = 'Họ tên phải có ít nhất 2 ký tự.'
    scrollTop()
    return
  }
  if (form.value.phone && !/^0\d{9}$/.test(form.value.phone.replace(/\s/g, ''))) {
    error.value = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.'
    scrollTop()
    return
  }
  if (form.value.address.trim().length > 500) {
    error.value = 'Địa chỉ quá dài (tối đa 500 ký tự).'
    scrollTop()
    return
  }

  // Kiểm tra số đo trước khi gửi (để trống thì bỏ qua và sẽ lưu là "chưa cập nhật")
  const payload = {
    full_name: form.value.full_name,
    phone: form.value.phone,
    address: form.value.address,
  }
  for (const m of MEASURES) {
    const raw = form.value[m.key]
    if (raw === '' || raw === null || raw === undefined) {
      payload[m.key] = null
      continue
    }
    const n = Number(raw)
    if (!Number.isFinite(n) || n < m.min || n > m.max) {
      error.value = `${m.label} phải nằm trong khoảng ${m.min}–${m.max} ${m.unit}.`
      scrollTop()
      return
    }
    payload[m.key] = n
  }

  saving.value = true
  try {
    const { data } = await updateMyProfile(payload)

    // Backend trả về user đầy đủ (kèm địa chỉ và số đo đã đọc lại từ DB)
    profile.value = data.user

    // Cập nhật Store để giỏ hàng và thanh toán dùng lại
    shop.setViewer({
      name: data.user.full_name,
      email: data.user.email,
      phone: data.user.phone,
      address: data.user.address,
    })

    editing.value = false
    message.value = 'Đã cập nhật thông tin và số đo cơ thể thành công.'
    scrollTop()
  } catch (err) {
    if (err.response?.status === 401) return goLogin()
    error.value = err.response?.data?.message || 'Không thể kết nối máy chủ.'
    scrollTop()
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
      <div v-if="message" class="hqa-note" role="status" style="margin-top: 15px;">{{ message }}</div>
      <div v-if="error" class="hqa-alert" role="alert" style="margin-top: 15px;">{{ error }}</div>

      <div class="hqa-split" style="margin-top:25px">
        <!-- Khu vực thông tin cá nhân & số đo -->
        <section class="hqa-panel">

          <template v-if="!editing">
            <h3>Hồ sơ của bạn</h3>
            <div class="hqa-total-row"><span>Họ và tên</span><strong>{{ profile.full_name }}</strong></div>
            <div class="hqa-total-row"><span>Email</span><strong>{{ profile.email }}</strong></div>
            <div class="hqa-total-row"><span>Số điện thoại</span><strong>{{ profile.phone || 'Chưa cập nhật' }}</strong></div>
            <div class="hqa-total-row"><span>Loại tài khoản</span><strong>{{ String(profile.role).toLowerCase() === 'admin' ? 'Quản trị viên' : 'Khách hàng' }}</strong></div>
            <div class="hqa-total-row">
              <span style="flex-shrink: 0; margin-right: 15px;">Địa chỉ</span>
              <strong style="text-align: right; line-height: 1.5;">{{ profile.address || 'Chưa cập nhật' }}</strong>
            </div>

            <!-- Bảng số đo -->
            <h3 style="margin-top: 35px;">Bảng số đo cơ thể</h3>
            <p class="hqa-dim" style="margin-top: -10px; margin-bottom: 15px; font-size: 13px;">
              Dùng để AI tư vấn size chuẩn xác nhất
            </p>
            <table class="acc-table">
              <thead>
                <tr>
                  <th scope="col">Chỉ số</th>
                  <th scope="col">Số đo</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in MEASURES" :key="m.key">
                  <th scope="row">{{ m.label }}</th>
                  <td :class="{ 'acc-empty': showMeasure(m) === '--' }">{{ showMeasure(m) }}</td>
                </tr>
              </tbody>
            </table>

            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:25px; border-top: 1px solid #f1e6e9; padding-top: 20px;">
              <button type="button" class="hqa-primary" @click="startEdit">Chỉnh sửa hồ sơ</button>
              <router-link class="hqa-outline" to="/tai-khoan">Đơn hàng của tôi</router-link>
              <button type="button" class="hqa-outline" @click="logout">Đăng xuất</button>
            </div>
          </template>

          <form v-else @submit.prevent="save">
            <h3>Cập nhật Hồ sơ</h3>
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
            <div class="hqa-form-field">
              <label for="acc-address">Địa chỉ nhận hàng mặc định</label>
              <textarea
                id="acc-address"
                v-model.trim="form.address"
                rows="2"
                maxlength="500"
                autocomplete="street-address"
                placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
              ></textarea>
            </div>

            <h3 style="margin-top: 35px;">Chỉ số cơ thể</h3>
            <p class="hqa-dim" style="margin-top: -10px; margin-bottom: 15px; font-size: 13px;">
              Thông tin này giúp Trợ lý AI của HQA gợi ý đúng kích thước nhất cho bạn. Có thể để trống số đo chưa biết.
            </p>
            <div class="acc-grid">
              <div v-for="m in MEASURES" :key="m.key" class="hqa-form-field">
                <label :for="'acc-' + m.key">{{ m.label }} ({{ m.unit }})</label>
                <input
                  :id="'acc-' + m.key"
                  v-model="form[m.key]"
                  type="number"
                  inputmode="decimal"
                  :min="m.min"
                  :max="m.max"
                  :step="m.step"
                  :placeholder="m.placeholder"
                />
              </div>
            </div>

            <div style="display:flex;gap:10px;margin-top:25px; border-top: 1px solid #f1e6e9; padding-top: 20px;">
              <button class="hqa-primary" type="submit" :disabled="saving">{{ saving ? 'Đang lưu...' : 'Lưu thay đổi' }}</button>
              <button type="button" class="hqa-outline" :disabled="saving" @click="editing = false">Hủy</button>
            </div>
          </form>
        </section>

        <!-- Khu vực đổi mật khẩu (giữ nguyên) -->
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

<style scoped>
/* Lưới 2 cột cho các ô số đo, tự xuống 1 cột trên màn hình hẹp */
.acc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  column-gap: 18px;
}

/* Bảng số đo cơ thể (chế độ xem) */
.acc-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  border: 1px solid #ead7dc;
  border-radius: 12px;
  overflow: hidden;
  font-size: 15px;
}
.acc-table th,
.acc-table td {
  width: 50%;
  padding: 12px 16px;
  text-align: center;
  vertical-align: middle;
  border-bottom: 1px solid #f1e6e9;
}
.acc-table thead th {
  background: #fbf1f4;
  color: #a95d73;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.acc-table tbody th {
  font-weight: 400;
  color: inherit;
  border-right: 1px solid #f1e6e9;
}
.acc-table tbody td {
  font-weight: 600;
}
.acc-table tbody tr:nth-child(even) th,
.acc-table tbody tr:nth-child(even) td {
  background: #fdf8f9;
}
.acc-table tbody tr:last-child th,
.acc-table tbody tr:last-child td {
  border-bottom: none;
}
.acc-table td.acc-empty {
  font-weight: 400;
  opacity: 0.5;
}

/* Cho ô địa chỉ (textarea) có kích thước giống các ô input khác */
.hqa-form-field textarea {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  resize: vertical;
}
</style>