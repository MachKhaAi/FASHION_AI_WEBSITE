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
  } else if (url.startsWith('/auth') || url.startsWith('/cart') || url.startsWith('/orders')) {
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

// ---------- Sản phẩm ----------
// params: { q, category, minPrice, maxPrice, size ("S,M"), sort }
export const getProducts = (params) => API.get('/products', { params })

export const getProductById = (id) =>
  API.get(`/products/${encodeURIComponent(id)}`)

// Bảng kích thước ứng với các size mà sản phẩm đang bán
export const getProductSizeChart = (id) =>
  API.get(`/products/${encodeURIComponent(id)}/size-chart`)

// Danh mục, các size, khoảng giá: dùng để dựng bộ lọc
export const getProductFilters = () => API.get('/products/filters')

export const getCategories = () => API.get('/categories')

// Bảng size của cửa hàng
export const getSizeCharts = () => API.get('/size-charts')

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

// Quản trị sản phẩm / danh mục (tự gắn token admin vì đường dẫn bắt đầu bằng /admin)
export const adminCreateProduct = (payload) => API.post('/admin/products', payload)
export const adminUpdateProduct = (id, payload) => API.put(`/admin/products/${encodeURIComponent(id)}`, payload)
export const adminDeleteProduct = (id) => API.delete(`/admin/products/${encodeURIComponent(id)}`)
export const adminCreateCategory = (payload) => API.post('/admin/categories', payload)
export const adminDeleteCategory = (id) => API.delete(`/admin/categories/${encodeURIComponent(id)}`)
export const adminUpdateSizeCharts = (rows) => API.put('/admin/size-charts', { rows })

// ---------- Đơn hàng ----------
export const createOrder = (payload) => API.post('/orders', payload)
export const getMyOrders = () => API.get('/orders/mine')
export const cancelMyOrder = (id) => API.put(`/orders/${encodeURIComponent(id)}/cancel`)
export const adminGetOrders = () => API.get('/admin/orders')
export const adminSetOrderStatus = (id, status) => API.put(`/admin/orders/${encodeURIComponent(id)}/status`, { status })

export const checkAiSize = (userData) =>
  API.post('/size-advisor', userData)

export const testDatabase = () => API.get('/test-db')

// Thêm các hàm API giỏ hàng:
export const getCart = () => API.get('/cart')
export const apiAddToCart = (payload) => API.post('/cart/items', payload)
export const apiUpdateCartItem = (cartItemId, quantity) => API.put(`/cart/items/${cartItemId}`, { quantity })
export const apiRemoveCartItem = (cartItemId) => API.delete(`/cart/items/${cartItemId}`)
export const apiClearCart = () => API.delete('/cart')

export default API