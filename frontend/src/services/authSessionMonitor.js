import {
  getUserToken, getAdminToken, getMyProfile, adminMe, clearUserToken,
  USER_LOGOUT_EVENT,
} from './api'
import { useHqaShopStore } from '../stores/hqaShop'
import { useAdminAuthStore } from '../stores/adminAuth'

const INVALID_SESSION_CODES = [401, 403, 404]

export function startAuthSessionMonitor(router) {
  const shop = useHqaShopStore()
  const admin = useAdminAuthStore()
  let checking = false

  const handleUserLogout = () => {
    shop.clearSession()
    const path = router.currentRoute.value.path
    if (path === '/tai-khoan' || path === '/thong-tin-ca-nhan' || path === '/thanh-toan') {
      router.replace({ path: '/dang-nhap', query: { redirect: path } })
    }
  }
  window.addEventListener(USER_LOGOUT_EVENT, handleUserLogout)
  window.addEventListener('hqa-admin-logout', () => { shop.adminOrders = [] })

  async function check() {
    if (document.hidden || checking) return
    checking = true
    try {
      const userToken = getUserToken()
      const adminToken = getAdminToken()
      const tasks = []
      if (userToken) {
        tasks.push(getMyProfile().catch((error) => {
          if (INVALID_SESSION_CODES.includes(error.response?.status) && getUserToken() === userToken) {
            clearUserToken()
          }
        }))
      }
      if (adminToken) {
        tasks.push(adminMe().then(({ data }) => {
          if (getAdminToken() === adminToken) {
            admin.token = adminToken
            admin.admin = data.user
            admin.checked = true
          }
        }).catch((error) => {
          if (INVALID_SESSION_CODES.includes(error.response?.status) && getAdminToken() === adminToken) {
            admin.logout()
            if (router.currentRoute.value.matched.some((r) => r.meta.requiresAdmin)) {
              router.replace({ path: '/admin/dang-nhap', query: { redirect: router.currentRoute.value.fullPath } })
            }
          }
        }))
      }
      await Promise.all(tasks)
    } finally {
      checking = false
    }
  }

  const onVisible = () => { if (!document.hidden) check() }
  window.addEventListener('focus', check)
  document.addEventListener('visibilitychange', onVisible)
  window.setInterval(check, 15000)
  check()
}
