<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminAuthStore } from '../../stores/adminAuth'
import '../../assets/hqa-pages.css'

const router = useRouter()
const route = useRoute()
const admin = useAdminAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    error.value = 'Vui lòng nhập email hợp lệ.'
    return
  }
  if (!password.value) {
    error.value = 'Vui lòng nhập mật khẩu.'
    return
  }

  loading.value = true
  try {
    await admin.login(email.value, password.value)
    // Quay lại trang admin người dùng định vào; chỉ chấp nhận đường dẫn nội bộ /admin...
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    const safe = target.startsWith('/admin') && !target.startsWith('//') ? target : '/admin'
    await router.push(safe)
  } catch (err) {
    error.value =
      err.response?.data?.message ||
      'Không thể kết nối máy chủ. Vui lòng thử lại.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="hqa-page" style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff9f9">
    <form class="hqa-panel" style="width:100%;max-width:420px;padding:38px 32px" @submit.prevent="submit">
      <div style="text-align:center;margin-bottom:26px">
        <div style="font:italic 38px Georgia,serif;color:#955468;letter-spacing:3px">HQA</div>
        <div class="hqa-eyebrow" style="margin-top:6px">Khu vực quản trị</div>
      </div>

      <h1 style="font:500 26px Georgia,serif;margin:0 0 6px;text-align:center">Đăng nhập quản trị</h1>
      <p class="hqa-dim" style="text-align:center;margin-bottom:24px">Chỉ dành cho tài khoản quản trị viên.</p>

      <div class="hqa-form-field">
        <label for="admin-email">Email</label>
        <input id="admin-email" v-model.trim="email" type="email" autocomplete="username" required placeholder="admin@hqa.vn" />
      </div>

      <div class="hqa-form-field">
        <label for="admin-password">Mật khẩu</label>
        <input id="admin-password" v-model="password" type="password" autocomplete="current-password" required />
      </div>

      <div v-if="error" class="hqa-alert" role="alert">{{ error }}</div>

      <button class="hqa-primary" type="submit" style="width:100%;margin-top:6px" :disabled="loading">
        {{ loading ? 'Đang đăng nhập...' : 'Đăng nhập →' }}
      </button>

      <p style="text-align:center;margin:22px 0 0">
        <router-link to="/" class="hqa-dim" style="text-decoration:underline">← Về cửa hàng</router-link>
      </p>
    </form>
  </main>
</template>