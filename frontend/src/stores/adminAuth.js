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
      } catch {
        this.logout()
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