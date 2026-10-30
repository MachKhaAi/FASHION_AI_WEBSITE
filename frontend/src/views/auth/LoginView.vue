<script setup>
import { loginUser } from '../../services/api'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHqaShopStore } from '../../stores/hqaShop'
import '../../assets/hqa-pages.css'
const router = useRouter(), shop = useHqaShopStore()
const email = ref(''), password = ref(''), error = ref('')

const loading = ref(false)

async function submit() {
  error.value = ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    error.value = 'Vui lòng nhập email hợp lệ.'
    return
  }

  if (password.value.length < 6) {
    error.value = 'Vui lòng kiểm tra lại mật khẩu.'
    return
  }

  loading.value = true

  try {
    const response = await loginUser({
      email: email.value,
      password: password.value,
    })

    if (!response.data.success) {
      throw new Error(response.data.message || 'Đăng nhập thất bại.')
    }

    const user = response.data.user

    shop.setViewer({
      name: user.full_name,
      email: user.email,
      phone: user.phone || '',
    })

    await router.push('/tai-khoan')
  } catch (err) {
    error.value =
      err.response?.data?.message ||
      err.message ||
      'Không thể kết nối máy chủ.'
  } finally {
    loading.value = false
  }
}

</script>
<template>
  <main class="hqa-page"><nav class="hqa-breadcrumb"><router-link to="/">Trang chủ</router-link> › Đăng nhập</nav><div class="hqa-auth"><aside class="hqa-auth-visual"><div class="logo">HQA</div><h2>Chào nàng trở lại!</h2><p>Đôi khi chỉ cần một món đồ phù hợp để ngày thường trở nên thật đặc biệt.</p><div style="font-size:45px;margin-top:28px">✿ ♡ ✿</div></aside><form class="hqa-auth-form" @submit.prevent="submit"><div class="hqa-eyebrow">WELCOME BACK</div><h1>Đăng nhập</h1><p class="hqa-subtitle">Hãy tiếp tục hành trình tìm kiếm phong cách của mình.</p><div class="hqa-form-field"><label for="login-email">Email</label><input id="login-email" v-model.trim="email" type="email" autocomplete="email" required placeholder="ban@example.com" /></div><div class="hqa-form-field"><label for="login-password">Mật khẩu</label><input id="login-password" v-model="password" type="password" autocomplete="current-password" minlength="6" required placeholder="Ít nhất 6 ký tự" /></div><div v-if="error" class="hqa-alert" role="alert">{{error}}</div><button class="hqa-primary" type="submit">Đăng nhập (demo) →</button><p class="hqa-dim" style="text-align:center;margin:20px 0">Chưa có tài khoản? <router-link to="/dang-ky" style="color:#a55c73;font-weight:700">Đăng ký ngay</router-link></p><div class="hqa-note">Chế độ demo: biểu mẫu <strong>không xác minh mật khẩu với máy chủ</strong>. Vui lòng không nhập mật khẩu thật của bạn.</div></form></div></main>
</template>
