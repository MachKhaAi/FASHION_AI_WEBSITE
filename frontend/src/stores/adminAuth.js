import { defineStore } from 'pinia'
import { adminLogin, adminMe, ADMIN_TOKEN_KEY } from '../services/api'

function readToken() {
  try { return localStorage.getItem(ADMIN_TOKEN_KEY) || '' } catch { return '' }
}
function writeToken(value) {
  try {
    if (value) localStorage.setItem(ADMIN_TOKEN_KEY, value)
    else localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    // bỏ qua nếu trình duyệt chặn localStorage
  }
}

export const useAdminAuthStore = defineStore('adminAuth', {
  state: () => ({
    token: readToken(),
    admin: null,
    checked: false, // đã hỏi server xác nhận token trong lần mở trang này chưa
  }),
  getters: {
    isAuthenticated: (s) => !!s.token && !!s.admin,
  },
  actions: {
    async login(email, password) {
      const { data } = await adminLogin({ email, password })
      this.token = data.token
      this.admin = data.user
      this.checked = true
      writeToken(data.token)
    },

    // Khôi phục phiên khi tải lại trang: hỏi server token còn hợp lệ và còn là admin không
    async restore() {
      if (this.checked) return this.isAuthenticated
      if (!this.token) {
        this.checked = true
        return false
      }
      try {
        const { data } = await adminMe()
        this.admin = data.user
      } catch (error) {
        const code = error?.response?.status
        // Chỉ đăng xuất khi máy chủ nói token sai/hết hạn. Lỗi mạng/timeout thì giữ token, thử lại sau.
        if (code === 401 || code === 403 || code === 404) this.logout()
        else { this.checked = false; return false }
      }
      this.checked = true
      return this.isAuthenticated
    },

    logout() {
      this.token = ''
      this.admin = null
      this.checked = true
      writeToken('')
    },
  },
})

// Đồng bộ giữa các tab: đăng nhập/đăng xuất admin ở tab này thì tab khác tự cập nhật
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== ADMIN_TOKEN_KEY) return
    const store = useAdminAuthStore()
    store.token = event.newValue || ''
    store.admin = null
    store.checked = false
    if (store.token) store.restore()
  })
}