<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHqaShopStore } from '../../stores/hqaShop'
import '../../assets/hqa-pages.css'
const router = useRouter(), shop = useHqaShopStore()
const form = ref({ name: '', email: '', phone: '', password: '', confirm: '' }), error = ref('')
function submit() {
  error.value = ''
  if (form.value.name.trim().length < 2) { error.value = 'Họ tên phải có ít nhất 2 ký tự.'; return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) { error.value = 'Địa chỉ email không hợp lệ.'; return }
  if (form.value.password.length < 6) { error.value = 'Mật khẩu phải có ít nhất 6 ký tự.'; return }
  if (form.value.password !== form.value.confirm) { error.value = 'Mật khẩu xác nhận không khớp.'; return }
  // Bản demo không tạo tài khoản server và không lưu mật khẩu vào localStorage.
  shop.setViewer({ name: form.value.name, email: form.value.email, phone: form.value.phone })
  router.push('/tai-khoan')
}
</script>
<template>
  <main class="hqa-page"><nav class="hqa-breadcrumb"><router-link to="/">Trang chủ</router-link> › Đăng ký</nav><div class="hqa-auth"><aside class="hqa-auth-visual"><div class="logo">HQA</div><h2>Gia nhập thế giới HQA</h2><p>Cất giữ những món đồ yêu thích và tận hưởng trải nghiệm mua sắm theo phong cách riêng.</p><div style="font-size:45px;margin-top:28px">♡ ✿ ♡</div></aside><form class="hqa-auth-form" @submit.prevent="submit"><div class="hqa-eyebrow">CREATE ACCOUNT</div><h1>Đăng ký</h1><p class="hqa-subtitle">Tạo hồ sơ demo chỉ với một vài thông tin.</p><div class="hqa-form-field"><label for="reg-name">Họ và tên *</label><input id="reg-name" v-model.trim="form.name" required minlength="2" autocomplete="name" /></div><div class="hqa-form-field"><label for="reg-email">Email *</label><input id="reg-email" v-model.trim="form.email" type="email" required autocomplete="email" /></div><div class="hqa-form-field"><label for="reg-phone">Số điện thoại</label><input id="reg-phone" v-model.trim="form.phone" type="tel" autocomplete="tel" /></div><div class="hqa-form-grid"><div class="hqa-form-field"><label for="reg-password">Mật khẩu *</label><input id="reg-password" v-model="form.password" type="password" required minlength="6" autocomplete="new-password" /></div><div class="hqa-form-field"><label for="reg-confirm">Nhập lại mật khẩu *</label><input id="reg-confirm" v-model="form.confirm" type="password" required autocomplete="new-password" /></div></div><div v-if="error" class="hqa-alert" role="alert">{{error}}</div><button class="hqa-primary" type="submit">Tạo tài khoản demo →</button><p class="hqa-dim" style="text-align:center;margin:20px 0">Đã có tài khoản? <router-link to="/dang-nhap" style="color:#a55c73;font-weight:700">Đăng nhập</router-link></p><div class="hqa-note">Chế độ giao diện mẫu: không tạo tài khoản thật và không lưu mật khẩu. Đừng dùng mật khẩu thật khi thử nghiệm.</div></form></div></main>
</template>
