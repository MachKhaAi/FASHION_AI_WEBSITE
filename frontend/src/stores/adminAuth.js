import { defineStore } from 'pinia'
import { adminLogin, adminMe, getAdminToken, setAdminToken, clearUserToken } from '../services/api'

export const useAdminAuthStore = defineStore('adminAuth', {
  state: () => ({
    token: getAdminToken(),
    admin: null,
    checked: false,
  }),
  getters: {
    isAuthenticated: (s) => !!s.token && !!s.admin,
  },
  actions: {
    async login(email, password) {
      const { data } = await adminLogin({ email, password })
      // Mỗi tab chỉ có một vai trò; không ảnh hưởng các tab khác.
      clearUserToken()
      this.token = data.token
      this.admin = data.user
      this.checked = true
      setAdminToken(data.token)
    },

    async restore() {
      if (this.checked) return this.isAuthenticated
      if (!this.token) {
        this.checked = true
        return false
      }
      const token = this.token
      try {
        const { data } = await adminMe()
        if (this.token !== token) return this.isAuthenticated
        this.admin = data.user
      } catch (error) {
        if (this.token !== token) return this.isAuthenticated
        const code = error?.response?.status
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
      setAdminToken('')
      try { window.dispatchEvent(new Event('hqa-admin-logout')) } catch { /* không có window */ }
    },
  },
})
