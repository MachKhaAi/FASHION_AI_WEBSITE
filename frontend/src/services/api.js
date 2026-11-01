import axios from 'axios'

export const ADMIN_TOKEN_KEY = 'hqa_admin_token'
export const USER_TOKEN_KEY = 'hqa_user_token'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})

function readStorage(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStorage(key, value) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // trình duyệt chặn localStorage: bỏ qua
  }
}

export const getUserToken = () => readStorage(USER_TOKEN_KEY) || ''
export const clearUserToken = () => writeStorage(USER_TOKEN_KEY, '')

// Tự động gửi kèm token: /admin/... dùng token quản trị, /auth/... dùng token khách hàng
API.interceptors.request.use((config) => {
  const url = config.url || ''
  if (url.startsWith('/admin')) {
    const token = readStorage(ADMIN_TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
  } else if (url.startsWith('/auth')) {
    const token = readStorage(USER_TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Đăng nhập / đăng ký thành công thì ghi nhớ token của khách hàng để xem và sửa hồ sơ
API.interceptors.response.use((response) => {
  const url = response.config?.url || ''
  if ((url === '/login' || url === '/register') && response.data?.token) {
    writeStorage(USER_TOKEN_KEY, response.data.token)
  }
  return response
})

export const getProducts = () => API.get('/products')

export const loginUser = (credentials) =>
  API.post('/login', credentials)

export const registerUser = (payload) =>
  API.post('/register', payload)

// ---------- Hồ sơ cá nhân (cần đăng nhập) ----------
export const getMyProfile = () => API.get('/auth/me')

export const updateMyProfile = (payload) =>
  API.put('/auth/profile', payload)

export const changeMyPassword = (payload) =>
  API.put('/auth/password', payload)

// ---------- Khu vực quản trị ----------
export const adminLogin = (credentials) =>
  API.post('/admin/login', credentials)

export const adminMe = () => API.get('/admin/me')

export const checkAiSize = (userData) =>
  API.post('/size-advisor', userData)

export const testDatabase = () => API.get('/test-db')

export default API