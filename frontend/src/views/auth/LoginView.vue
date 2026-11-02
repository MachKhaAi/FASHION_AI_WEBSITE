<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loginUser } from '../../services/api'
import { useHqaShopStore } from '../../stores/hqaShop'
import { useAdminAuthStore } from '../../stores/adminAuth'
import '../../assets/hqa-pages.css'

const router = useRouter()
const route = useRoute()
const shop = useHqaShopStore()
const admin = useAdminAuthStore()

const form = ref({ email: '', password: '' })
const error = ref('')
const loading = ref(false)

function safeRedirect(fallback) {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : fallback
}

async function submit() {
  error.value = ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
    error.value = 'Địa chỉ email không hợp lệ.'
    return
  }
  if (!form.value.password) {
    error.value = 'Vui lòng nhập mật khẩu.'
    return
  }

  loading.value = true
  try {
    const email = form.value.email.trim()
    const response = await loginUser({ email, password: form.value.password })

    if (!response.data.success) {
      throw new Error(response.data.message || 'Đăng nhập thất bại.')
    }

    const user = response.data.user

    if (user.role === 'admin') {
      await admin.login(email, form.value.password)
      await router.push(safeRedirect('/admin'))
      return
    }

    shop.setViewer({
      name: user.full_name,
      email: user.email,
      phone: user.phone || '',
    })

    // Tải giỏ hàng từ cơ sở dữ liệu ngay khi đăng nhập thành công
    await shop.fetchCart()

    await router.push(safeRedirect('/thong-tin-ca-nhan'))
  } catch (err) {
    error.value = err.response?.data?.message || err.message || 'Không thể kết nối máy chủ.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="hqa-page">
    <nav class="hqa-breadcrumb"><router-link to="/">Trang chủ</router-link> › Đăng nhập</nav>
    <div class="hqa-auth">
      <aside class="hqa-auth-visual">
        <div class="logo">HQA</div>
        <h2>Chào nàng trở lại!</h2>
        <p>Đôi khi chỉ cần một món đồ phù hợp để ngày thường trở nên thật đặc biệt.</p>
        <div style="font-size:45px;margin-top:28px">✿ ♡ ✿</div>
      </aside>
      <form class="hqa-auth-form" @submit.prevent="submit">
        <div class="hqa-eyebrow">WELCOME BACK</div>
        <h1>Đăng nhập</h1>
        <p class="hqa-subtitle">Hãy tiếp tục hành trình tìm kiếm phong cách của mình.</p>
        <div class="hqa-form-field">
          <label for="login-email">Email</label>
          <input id="login-email" v-model.trim="form.email" type="email" required autocomplete="email" placeholder="ban@example.com" />
        </div>
        <div class="hqa-form-field">
          <label for="login-password">Mật khẩu</label>
          <input id="login-password" v-model="form.password" type="password" required autocomplete="current-password" placeholder="Nhập mật khẩu" />
        </div>
        <div v-if="error" class="hqa-alert" role="alert">{{ error }}</div>
        <button class="hqa-primary" type="submit" :disabled="loading">{{ loading ? 'Đang đăng nhập...' : 'Đăng nhập →' }}</button>
        <p class="hqa-dim" style="text-align:center;margin:20px 0">Chưa có tài khoản? <router-link to="/dang-ky" style="color:#a55c73;font-weight:700">Đăng ký ngay</router-link></p>
      </form>
    </div>
  </main>
</template>