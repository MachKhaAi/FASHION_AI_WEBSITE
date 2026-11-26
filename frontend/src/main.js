import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { startAuthSessionMonitor } from './services/authSessionMonitor'

// Xóa dữ liệu dùng chung còn sót lại từ bản trước (không chuyển token cũ sang tab mới).
try {
  for (const key of ['hqa_user_token', 'hqa_admin_token', 'hqa_frontend_demo_v1']) {
    localStorage.removeItem(key)
  }
} catch { /* Trình duyệt chặn localStorage */ }

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
router.isReady().then(() => startAuthSessionMonitor(router))