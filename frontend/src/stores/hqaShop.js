import { defineStore } from 'pinia'
import { seedSizeChart } from '../data/hqaCatalog'
import {
  getProducts, getCategories,
  adminCreateProduct, adminUpdateProduct, adminDeleteProduct,
  adminCreateCategory, adminDeleteCategory,
  getUserToken, getSizeCharts, adminUpdateSizeCharts,
  createOrder, getMyOrders, cancelMyOrder, adminGetOrders, adminSetOrderStatus,
  getFavorites, addFavorite, removeFavorite,
  getCart, apiAddToCart, apiUpdateCartItem, apiRemoveCartItem,
} from '../services/api'
import { useAdminAuthStore } from './adminAuth'

const KEY = 'hqa_frontend_demo_v1'
const clone = (value) => JSON.parse(JSON.stringify(value))
function loadDemo() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
const cached = typeof sessionStorage === 'undefined' ? {} : loadDemo()
const asArray = (v, def) => Array.isArray(v) ? v : clone(def)

// Khách có thể hủy đơn khi còn "Chờ xác nhận" hoặc "Đã duyệt" (chưa giao)
export const canCancelOrder = (order) => {
  if (!order) return false
  if (order.statusCode) return ['pending', 'confirmed'].includes(order.statusCode)
  return String(order.status || '').startsWith('Chờ xác nhận') // đơn cũ chỉ lưu trong trình duyệt
}

// Đã đăng nhập tài khoản khách hàng chưa (dùng ở ShopLayout, giỏ hàng, chi tiết sản phẩm)
export const hasUserToken = () => !!getUserToken()

// Chuyển 1 sản phẩm từ API (PostgreSQL) sang dạng giao diện đang dùng
export function normalizeProduct(p) {
  if (!p) return null
  return {
    ...p, // giữ thêm variants, images, categoryName... do API trả về
    id: String(p.id),
    name: p.name ?? '',
    categoryId: String(p.categoryId ?? p.category_id ?? ''),
    price: Number(p.price ?? 0),
    oldPrice: Number(p.oldPrice ?? p.old_price ?? 0),
    image: p.image ?? p.image_url ?? '',
    sizes: Array.isArray(p.sizes) ? p.sizes : [],
    colors: Array.isArray(p.colors) ? p.colors : [],
    stock: Number(p.stock ?? 0),
    featured: Boolean(p.featured ?? p.is_featured),
    description: p.description ?? '',
  }
}

// Tự làm mới dữ liệu (sản phẩm, đơn của khách) mỗi 20 giây để thấy thay đổi từ trang quản trị
let pollTimer = null
let cartRequestId = 0
let cartInFlight = null
let cartInFlightToken = ''
let favoritesRequestId = 0
let favoritesInFlight = null
let favoritesInFlightToken = ''

export const useHqaShopStore = defineStore('hqaShop', {
  state: () => ({
    products: [],
    categories: [],
    catalogLoaded: false,
    adminOrders: [], // đơn hàng của toàn cửa hàng (chỉ trang quản trị dùng)
    sizeChart: asArray(cached.sizeChart, seedSizeChart),
    cart: [],
    cartLoading: false,
    cartBusy: false,
    cartError: '',
    // Yêu thích là dữ liệu riêng của tài khoản; chỉ lấy từ backend, không dùng cache demo cũ.
    favorites: [],
    favoritesLoadedToken: '',
    favoritesLoading: false,
    favoritesError: '',
    favoriteBusyIds: [],
    orders: asArray(cached.orders, []),
    viewer: getUserToken() && cached.viewer && typeof cached.viewer === 'object' ? cached.viewer : null,
  }),
  getters: {
    cartCount: (s) => s.cart.reduce((total, line) => total + line.qty, 0),
    cartDetails: (s) => s.cart,
    subtotal() { return this.cartDetails.reduce((total, line) => total + line.product.price * line.qty, 0) },
    favoriteProducts: (s) => s.favorites.map(id => s.products.find(p => p.id === id)).filter(Boolean),
  },
  actions: {
    save() {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ sizeChart: this.sizeChart, orders: this.orders, viewer: this.viewer }))
      } catch (error) { console.warn('Không thể lưu dữ liệu demo vào trình duyệt', error) }
    },
    // Danh sách yêu thích được lưu trong PostgreSQL và chỉ tải cho JWT hiện hành.
    async fetchFavorites(force = false) {
      const token = getUserToken()
      if (!token) {
        this.favorites = []
        this.favoritesLoadedToken = ''
        return []
      }
      if (favoritesInFlight && favoritesInFlightToken === token) return favoritesInFlight
      if (!force && this.favoritesLoadedToken === token) return this.favorites
      const requestId = ++favoritesRequestId
      this.favoritesLoading = true
      this.favoritesError = ''
      const load = (async () => {
        try {
          const res = await getFavorites()
          if (getUserToken() !== token || requestId !== favoritesRequestId) return []
          const ids = Array.isArray(res.data.data) ? res.data.data.map(String) : null
          if (!ids) throw new Error('Dữ liệu yêu thích không hợp lệ.')
          this.favorites = [...new Set(ids)]
          this.favoritesLoadedToken = token
          return this.favorites
        } catch (error) {
          if (getUserToken() === token && requestId === favoritesRequestId) {
            this.favoritesError = error.response?.data?.message || 'Không tải được sản phẩm yêu thích.'
          }
          return []
        } finally {
          if (requestId === favoritesRequestId) this.favoritesLoading = false
        }
      })()
      favoritesInFlight = load
      favoritesInFlightToken = token
      try {
        return await load
      } finally {
        if (favoritesInFlight === load) {
          favoritesInFlight = null
          favoritesInFlightToken = ''
        }
      }
    },
    async toggleFavorite(rawId) {
      const token = getUserToken()
      if (!token) return { ok: false, reason: 'auth' }
      const id = String(rawId ?? '')
      if (!id) return { ok: false, message: 'Mã sản phẩm không hợp lệ.' }
      if (this.favoriteBusyIds.includes(id)) return { ok: false, reason: 'busy' }
      // Không cập nhật dựa vào danh sách chưa tải: có thể xóa nhầm yêu thích trên máy chủ.
      if (this.favoritesLoadedToken !== token) {
        await this.fetchFavorites()
        if (getUserToken() !== token) return { ok: false, reason: 'auth' }
        if (this.favoritesLoadedToken !== token) {
          return { ok: false, message: this.favoritesError || 'Không tải được danh sách yêu thích.' }
        }
      }
      if (this.favoriteBusyIds.includes(id)) return { ok: false, reason: 'busy' }
      const wasFavorite = this.favorites.includes(id)
      this.favoriteBusyIds.push(id)
      this.favorites = wasFavorite ? this.favorites.filter(x => x !== id) : [id, ...this.favorites]
      try {
        if (wasFavorite) await removeFavorite(id)
        else await addFavorite(id)
        if (getUserToken() !== token) return { ok: false, reason: 'auth' }
        return { ok: true, isFavorite: !wasFavorite }
      } catch (error) {
        if (getUserToken() === token) {
          this.favorites = wasFavorite ? [id, ...this.favorites.filter(x => x !== id)] : this.favorites.filter(x => x !== id)
          return { ok: false, message: error.response?.data?.message || 'Không lưu được sản phẩm yêu thích.' }
        }
        return { ok: false, reason: 'auth' }
      } finally {
        if (getUserToken() === token) this.favoriteBusyIds = this.favoriteBusyIds.filter(x => x !== id)
      }
    },
    applyCart(data) {
      if (!Array.isArray(data?.items)) throw new Error('Dữ liệu giỏ hàng không hợp lệ.')
      this.cart = data.items.map(item => ({
        key: String(item.cartItemId), cartItemId: item.cartItemId,
        productId: String(item.productId), size: item.size, color: item.color,
        qty: Number(item.quantity), stock: Number(item.stock),
        isAiRecommended: item.isAiRecommended, aiFitNote: item.aiFitNote,
        product: { id: String(item.productId), name: item.name, image: item.image,
          price: Number(item.price), oldPrice: Number(item.oldPrice), stock: Number(item.stock) },
      }))
    },
    async loadCart() {
      const token = getUserToken()
      if (!token) { this.cart = []; return [] }
      if (this.cartBusy) return this.cart
      if (cartInFlight && cartInFlightToken === token) return cartInFlight
      const requestId = ++cartRequestId
      this.cartLoading = true
      this.cartError = ''
      const load = (async () => {
        try {
          const res = await getCart()
          if (getUserToken() === token && requestId === cartRequestId) this.applyCart(res.data.data)
        } catch (error) {
          if (getUserToken() === token && requestId === cartRequestId) {
            this.cartError = error.response?.data?.message || error.message || 'Không tải được giỏ hàng.'
          }
        } finally {
          if (requestId === cartRequestId) this.cartLoading = false
        }
        return this.cart
      })()
      cartInFlight = load
      cartInFlightToken = token
      try { return await load } finally {
        if (cartInFlight === load) { cartInFlight = null; cartInFlightToken = '' }
      }
    },
    async changeCart(request) {
      const token = getUserToken()
      if (!token || this.cartBusy) return false
      // Kết quả GET cũ không được ghi đè kết quả POST/PUT/DELETE mới.
      const requestId = ++cartRequestId
      cartInFlight = null
      cartInFlightToken = ''
      this.cartLoading = false
      this.cartBusy = true
      this.cartError = ''
      try {
        const res = await request()
        if (getUserToken() !== token || requestId !== cartRequestId) return false
        this.applyCart(res.data.data)
        return true
      } catch (error) {
        if (getUserToken() === token && requestId === cartRequestId) {
          this.cartError = error.response?.data?.message || error.message || 'Không cập nhật được giỏ hàng.'
        }
        return false
      } finally {
        if (requestId === cartRequestId) this.cartBusy = false
      }
    },
    async addToCart(productId, size, color, quantity = 1) {
      const qty = Math.max(1, Math.floor(Number(quantity) || 1))
      const ok = await this.changeCart(() => apiAddToCart({ productId, size, color, quantity: qty }))
      if (ok && typeof window !== 'undefined') {
        const product = this.products.find(p => p.id === String(productId))
        window.dispatchEvent(new CustomEvent('hqa-cart-added', {
          detail: { name: product?.name || 'Sản phẩm', quantity: qty },
        }))
      }
      return ok
    },
    async updateQuantity(key, quantity) {
      const item = this.cart.find(line => line.key === key)
      if (!item) return false
      return this.changeCart(() => apiUpdateCartItem(item.cartItemId, quantity))
    },
    async removeFromCart(key) {
      const item = this.cart.find(line => line.key === key)
      if (!item) return false
      return this.changeCart(() => apiRemoveCartItem(item.cartItemId))
    },
    async placeOrder(customer) {
      const token = getUserToken()
      if (!token || this.cartBusy || this.cartLoading || !this.cart.length) return null
      const lines = this.cart.map(({ productId, qty, size, color }) => ({ productId, size, color, qty }))
      const id = `HQA-${Date.now()}`
      const requestId = ++cartRequestId
      cartInFlight = null
      cartInFlightToken = ''
      this.cartBusy = true
      this.cartError = ''
      try {
        const res = await createOrder({ id, customer: clone(customer), items: lines })
        if (getUserToken() !== token || requestId !== cartRequestId) return null
        // Backend đã xóa các số lượng được mua trong cùng giao dịch tạo đơn.
        this.cart = []
        this.cartBusy = false
        await Promise.all([this.loadCart(), this.fetchCatalog(), this.fetchMyOrders()])
        if (getUserToken() !== token) return null
        return res.data.id || id
      } catch (error) {
        if (getUserToken() === token && requestId === cartRequestId) {
          this.cartError = error.response?.data?.message || error.message || 'Không đặt được đơn hàng.'
        }
        return null
      } finally {
        if (requestId === cartRequestId) this.cartBusy = false
      }
    },
    setViewer(person) {
      this.viewer = { name: String(person.name || '').trim(), email: String(person.email || '').trim(), phone: String(person.phone || '').trim() }
      this.save()
    },
    clearSession() {
      ++cartRequestId
      cartInFlight = null
      cartInFlightToken = ''
      this.cartLoading = false
      this.cartBusy = false
      this.cartError = ''
      ++favoritesRequestId // hủy hiệu lực các yêu cầu đang chạy từ phiên cũ
      favoritesInFlight = null
      favoritesInFlightToken = ''
      this.viewer = null
      this.cart = []
      this.favorites = []
      this.favoritesLoadedToken = ''
      this.favoritesLoading = false
      this.favoritesError = ''
      this.favoriteBusyIds = []
      this.orders = []
      this.adminOrders = []
      try { sessionStorage.removeItem(KEY) } catch { /* không thể lưu */ }
    },
    logout() { this.clearSession() },
    // ===== Đơn hàng: lưu trong PostgreSQL =====
    // Đơn của khách đang đăng nhập (kèm trạng thái mới nhất do admin duyệt)
    async fetchMyOrders() {
      const token = getUserToken()
      if (!token) return
      try {
        const res = await getMyOrders()
        // Một yêu cầu đang chạy không được ghi dữ liệu của tài khoản cũ vào phiên mới.
        if (getUserToken() !== token) return
        const server = Array.isArray(res.data.data) ? res.data.data : []
        const ids = new Set(server.map(o => o.id))
        this.orders = [...server, ...this.orders.filter(o => !ids.has(o.id))]
        this.save()
      } catch (error) { console.error('Không tải được đơn hàng:', error) }
    },
    startPolling() {
      if (pollTimer || typeof window === 'undefined') return
      pollTimer = window.setInterval(() => {
        if (document.hidden) return
        this.fetchCatalog()
        this.fetchMyOrders()
      }, 20000)
    },
    // Quản trị: toàn bộ đơn hàng + đổi trạng thái (duyệt / giao / hoàn thành / hủy)
    // Phiên quản trị hết hạn / thiếu quyền: đưa về trang đăng nhập admin
    adminSessionLost(error, notify) {
      const code = error?.response?.status
      if (code !== 401 && code !== 403) return false
      useAdminAuthStore().logout()
      if (notify) alert('Phiên đăng nhập quản trị đã hết hạn. Vui lòng đăng nhập lại.')
      window.location.assign('/admin/dang-nhap')
      return true
    },
    async fetchAdminOrders() {
      try {
        const res = await adminGetOrders()
        this.adminOrders = Array.isArray(res.data.data) ? res.data.data : []
      } catch (error) {
        if (!this.adminSessionLost(error, false)) console.error('Không tải được đơn hàng quản trị:', error)
      }
    },
    async setOrderStatus(id, status) {
      try {
        await adminSetOrderStatus(id, status)
      } catch (error) {
        if (this.adminSessionLost(error, true)) return
        alert(error?.response?.data?.message || 'Không cập nhật được đơn hàng.')
      }
      await this.fetchAdminOrders()
      await this.fetchCatalog() // hủy đơn sẽ hoàn lại tồn kho
    },
    // Khách tự hủy đơn của mình
    async cancelOrder(id) {
      const local = this.orders.find(o => o.id === id)
      if (local && !local.statusCode) { // đơn cũ chưa có trên máy chủ: chỉ đánh dấu hủy trong trình duyệt
        local.status = 'Đã hủy'
        this.save()
        return true
      }
      try {
        await cancelMyOrder(id)
        await this.fetchMyOrders()
        await this.fetchCatalog() // hàng được trả lại kho
        return true
      } catch (error) {
        alert(error?.response?.data?.message || 'Không hủy được đơn hàng. Vui lòng đăng nhập lại.')
        await this.fetchMyOrders()
        return false
      }
    },
    // ===== Sản phẩm / danh mục: nguồn dữ liệu là PostgreSQL =====
    async fetchCatalog() {
      try {
        const [pr, cr, sr] = await Promise.all([getProducts(), getCategories(), getSizeCharts().catch(() => null)])
        const rows = pr.data.data
        const cats = cr.data.data
        if (!Array.isArray(rows) || !Array.isArray(cats)) throw new Error('API trả dữ liệu không hợp lệ')
        this.products = rows.map(normalizeProduct)
        this.categories = cats.map((c) => ({ id: String(c.id), name: c.name, icon: c.icon || '✿' }))
        const sizes = sr?.data?.data
        if (Array.isArray(sizes) && sizes.length) this.sizeChart = sizes
        this.catalogLoaded = true
      } catch (error) {
        console.error('Không thể tải sản phẩm từ máy chủ:', error)
      }
    },
    // Giỏ hàng và yêu thích được tải theo tài khoản từ PostgreSQL.
    // Đồng thời tải sản phẩm/danh mục từ database (nếu chưa tải) để các trang quản trị và cửa hàng luôn có dữ liệu.
    async fetchCart() {
      if (!this.catalogLoaded) await this.fetchCatalog()
      await Promise.all([this.loadCart(), this.fetchMyOrders(), this.fetchFavorites()])
      this.startPolling()
      return this.cart
    },
    // Tên cũ, giữ lại để các trang gọi shop.fetchProducts() vẫn chạy
    fetchProducts() { return this.fetchCatalog() },
    // Thêm/cập nhật 1 sản phẩm vừa tải từ API vào store (trang chi tiết dùng khi khách vào thẳng đường dẫn)
    upsertProduct(raw) {
      const product = normalizeProduct(raw)
      const index = this.products.findIndex(p => p.id === product.id)
      if (index >= 0) this.products.splice(index, 1, product)
      else this.products.push(product)
      return this.products.find(p => p.id === product.id)
    },
    // Cập nhật giao diện ngay, gửi lên máy chủ ở nền; lỗi thì tải lại từ DB cho đúng.
    async syncOrRevert(request, reload = false) {
      try {
        await request()
        if (reload) await this.fetchCatalog() // lấy lại từ database (ảnh theo màu, tồn kho từng biến thể)
      } catch (error) {
        console.error(error)
        alert(error?.response?.data?.message || 'Không lưu được lên máy chủ. Vui lòng đăng nhập lại bằng tài khoản admin.')
        await this.fetchCatalog()
      }
    },
    updateProduct(payload) {
      const found = this.products.find(p => p.id === payload.id)
      if (!found) return false
      Object.assign(found, payload)
      this.syncOrRevert(() => adminUpdateProduct(found.id, clone(found)), true)
      return true
    },
    addProduct(payload) {
      const id = `sp-${Date.now()}`
      const product = { id, name: '', categoryId: this.categories[0]?.id || '', price: 0, oldPrice: 0, image: '', sizes: ['S', 'M', 'L'], colors: ['Kem'], stock: 0, featured: false, description: '', ...payload, id }
      this.products.unshift(product)
      this.syncOrRevert(() => adminCreateProduct(clone(product)), true)
      return id
    },
    deleteProduct(id) {
      this.products = this.products.filter(p => p.id !== id)
      this.cart = this.cart.filter(p => p.productId !== id)
      this.favorites = this.favorites.filter(f => f !== id)
      this.save()
      this.syncOrRevert(() => adminDeleteProduct(id))
    },
    addCategory(name) {
      const trimmed = name.trim(); if (!trimmed || this.categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return false
      const category = { id: `dm-${Date.now()}`, name: trimmed, icon: '✿' }
      this.categories.push(category)
      this.syncOrRevert(() => adminCreateCategory(clone(category)))
      return true
    },
    deleteCategory(id) {
      if (this.products.some(p => p.categoryId === id)) return false
      this.categories = this.categories.filter(c => c.id !== id)
      this.syncOrRevert(() => adminDeleteCategory(id))
      return true
    },
    updateSizeChart(rows) {
      this.sizeChart = clone(rows)
      this.save()
      this.syncOrRevert(() => adminUpdateSizeCharts(clone(rows)))
    },
  },
})