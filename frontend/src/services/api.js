import axios from 'axios'

export const ADMIN_TOKEN_KEY = 'hqa_admin_token'
export const USER_TOKEN_KEY = 'hqa_user_token'
export const CHAT_SESSION_KEY = 'hqa_size_chat_v2' // phiên chat tư vấn size (có thể chứa số đo lấy từ hồ sơ)
export const USER_LOGOUT_EVENT = 'hqa-user-logout'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})

// sessionStorage thuộc từng tab, không dùng localStorage chung cho mọi tab.
function readStorage(key) {
  try { return sessionStorage.getItem(key) } catch { return null }
}
function writeStorage(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    // Trình duyệt không cho lưu: phiên chỉ tồn tại cho đến khi làm mới trang.
  }
}

export const getUserToken = () => readStorage(USER_TOKEN_KEY) || ''
export const getAdminToken = () => readStorage(ADMIN_TOKEN_KEY) || ''
export const setAdminToken = (token) => writeStorage(ADMIN_TOKEN_KEY, token)

// Đổi tài khoản trong cùng tab phải xóa toàn bộ dữ liệu riêng của tài khoản cũ.
export const setUserToken = (token) => {
  if (getUserToken() !== token && getUserToken()) clearUserToken()
  writeStorage(USER_TOKEN_KEY, token)
}

export const clearUserToken = () => {
  writeStorage(USER_TOKEN_KEY, '')
  try { sessionStorage.removeItem(CHAT_SESSION_KEY) } catch { /* bỏ qua */ }
  try { window.dispatchEvent(new Event(USER_LOGOUT_EVENT)) } catch { /* bỏ qua */ }
}

// Tự động gửi kèm token: /admin/... dùng token quản trị, /auth/... dùng token khách hàng
API.interceptors.request.use((config) => {
  const url = config.url || ''
  if (url.startsWith('/admin')) {
    const token = readStorage(ADMIN_TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
  } else if (url.startsWith('/auth') || url.startsWith('/cart') || url.startsWith('/favorites') || url.startsWith('/orders') || url.startsWith('/chat') || url.startsWith('/advisor') || url.startsWith('/size-advisor')) {
    const token = readStorage(USER_TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Nếu server báo token hiện tại không hợp lệ, xóa ngay phiên ở tab này.
// So sánh token của request để tránh response cũ xóa một phiên mới vừa đăng nhập.
API.interceptors.response.use(undefined, (error) => {
  const status = error.response?.status
  const url = error.config?.url || ''
  const authHeader = error.config?.headers?.Authorization || ''
  const token = String(authHeader).startsWith('Bearer ') ? String(authHeader).slice(7) : ''
  if ([401, 403, 404].includes(status) && url.startsWith('/auth/') && token && token === getUserToken()) {
    clearUserToken()
  } else if ([401, 403].includes(status) &&
    (/^\/(cart|favorites|orders)(\/|$)/.test(url) || url.startsWith('/advisor/')) &&
    token && token === getUserToken()) {
    clearUserToken()
  }
  return Promise.reject(error)
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

export const loginUser = async (credentials) => {
  const response = await API.post('/login', credentials)
  // /login cũng cho admin đăng nhập: KHÔNG ghi JWT admin vào phiên khách hàng.
  if (response.data?.token && response.data?.user?.role === 'customer') {
    setUserToken(response.data.token)
  }
  return response
}

export const registerUser = async (payload) => {
  const response = await API.post('/register', payload)
  if (response.data?.token && response.data?.user?.role === 'customer') {
    setUserToken(response.data.token)
  }
  return response
}

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

// ---------- Quản lý bảng size (admin) ----------
export const adminGetSizeCharts = () => API.get('/admin/size-charts')
export const adminCreateSizeChart = (payload) => API.post('/admin/size-charts', payload)
export const adminUpdateSizeChart = (id, payload) => API.put(`/admin/size-charts/${id}`, payload)
export const adminDeleteSizeChart = (id) => API.delete(`/admin/size-charts/${id}`)
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

// Chat tư vấn size bằng tiếng Việt (backend gọi Google Gemini để trích xuất; frontend không gọi AI trực tiếp).
// state là trạng thái hội thoại do server trả về ở lượt trước.
export const sendChatMessage = (message, state) =>
  API.post('/chat/message', { message, state })

// Biểu mẫu nhập số đo thủ công (dùng khi AI không dùng được hoặc khách muốn nhập trực tiếp)
export const submitManualAdvice = (payload) =>
  API.post('/advisor/manual', payload)

export const testDatabase = () => API.get('/test-db')

// Thêm các hàm API giỏ hàng:
export const getCart = () => API.get('/cart')
export const apiAddToCart = (payload) => API.post('/cart/items', payload)
export const apiUpdateCartItem = (cartItemId, quantity) => API.put(`/cart/items/${cartItemId}`, { quantity })
export const apiRemoveCartItem = (cartItemId) => API.delete(`/cart/items/${cartItemId}`)
export const apiClearCart = () => API.delete('/cart')

// ---------- Sản phẩm yêu thích của tài khoản khách hàng ----------
export const getFavorites = () => API.get('/favorites')
export const addFavorite = (productId) => API.post(`/favorites/${encodeURIComponent(productId)}`)
export const removeFavorite = (productId) => API.delete(`/favorites/${encodeURIComponent(productId)}`)

export default API