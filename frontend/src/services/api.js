import axios from 'axios'

export const ADMIN_TOKEN_KEY = 'hqa_admin_token'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})

// Các request tới /admin/... tự động gửi kèm token quản trị
API.interceptors.request.use((config) => {
  if (config.url && config.url.startsWith('/admin')) {
    try {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY)
      if (token) config.headers.Authorization = `Bearer ${token}`
    } catch {
      // trình duyệt chặn localStorage: bỏ qua
    }
  }
  return config
})

export const getProducts = () => API.get('/products')

export const loginUser = (credentials) =>
  API.post('/login', credentials)

export const registerUser = (payload) =>
  API.post('/register', payload)

export const adminLogin = (credentials) =>
  API.post('/admin/login', credentials)

export const adminMe = () => API.get('/admin/me')

export const checkAiSize = (userData) =>
  API.post('/size-advisor', userData)

export const testDatabase = () => API.get('/test-db')

export default API