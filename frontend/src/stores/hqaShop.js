import { defineStore } from 'pinia'
import { seedSizeChart } from '../data/hqaCatalog'
import {
  getProducts, getCategories,
  adminCreateProduct, adminUpdateProduct, adminDeleteProduct,
  adminCreateCategory, adminDeleteCategory,
  getUserToken, getSizeCharts, adminUpdateSizeCharts,
  createOrder, getMyOrders, cancelMyOrder, adminGetOrders, adminSetOrderStatus,
} from '../services/api'
import { useAdminAuthStore } from './adminAuth'

const KEY = 'hqa_frontend_demo_v1'
const clone = (value) => JSON.parse(JSON.stringify(value))
function loadDemo() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
const cached = typeof localStorage === 'undefined' ? {} : loadDemo()
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

export const useHqaShopStore = defineStore('hqaShop', {
  state: () => ({
    products: [],
    categories: [],
    catalogLoaded: false,
    adminOrders: [], // đơn hàng của toàn cửa hàng (chỉ trang quản trị dùng)
    sizeChart: asArray(cached.sizeChart, seedSizeChart),
    cart: asArray(cached.cart, []),
    favorites: asArray(cached.favorites, []),
    orders: asArray(cached.orders, []),
    viewer: cached.viewer && typeof cached.viewer === 'object' ? cached.viewer : null,
  }),
  getters: {
    cartCount: (s) => s.cart.reduce((total, line) => total + line.qty, 0),
    cartDetails: (s) => s.cart.map(line => ({ ...line, product: s.products.find(p => p.id === line.productId) })).filter(line => !!line.product),
    subtotal() { return this.cartDetails.reduce((total, line) => total + line.product.price * line.qty, 0) },
    favoriteProducts: (s) => s.products.filter(p => s.favorites.includes(p.id)),
  },
  actions: {
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ sizeChart: this.sizeChart, cart: this.cart, favorites: this.favorites, orders: this.orders, viewer: this.viewer }))
      } catch (error) { console.warn('Không thể lưu dữ liệu demo vào trình duyệt', error) }
    },
    toggleFavorite(id) {
      this.favorites = this.favorites.includes(id) ? this.favorites.filter(item => item !== id) : [...this.favorites, id]
      this.save()
    },
    addToCart(productId, size, color, quantity = 1) {
      const product = this.products.find(p => p.id === productId)
      const qty = Math.max(1, Math.floor(Number(quantity) || 1))
      if (!product || !product.sizes.includes(size) || !product.colors.includes(color)) return false
      const key = `${productId}|${size}|${color}`
      const existing = this.cart.find(line => line.key === key)
      const alreadyInCart = this.cart.filter(line => line.productId === productId).reduce((n, line) => n + line.qty, 0)
      if (qty + alreadyInCart > product.stock) return false
      if (existing) existing.qty += qty
      else this.cart.push({ key, productId, size, color, qty })
      this.save()
      return true
    },
    updateQuantity(key, quantity) {
      const item = this.cart.find(line => line.key === key)
      if (!item) return
      const product = this.products.find(p => p.id === item.productId)
      if (!product) return
      const otherQty = this.cart.filter(line => line.productId === item.productId && line.key !== key).reduce((n, line) => n + line.qty, 0)
      item.qty = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), Math.max(1, product.stock - otherQty))
      this.save()
    },
    removeFromCart(key) { this.cart = this.cart.filter(line => line.key !== key); this.save() },
    placeOrder(customer) {
      if (!this.cartDetails.length) return null
      const invalidStock = this.cartDetails.some(line => {
        const totalQty = this.cartDetails.filter(x => x.productId === line.productId).reduce((n, x) => n + x.qty, 0)
        return totalQty > line.product.stock
      })
      if (invalidStock) return null
      const lines = this.cartDetails.map(({ product, qty, size, color }) => ({ productId: product.id, size, color, qty }))
      const order = {
        id: `HQA-${Date.now()}`, createdAt: new Date().toISOString(), status: 'Chờ xác nhận',
        customer: clone(customer), items: this.cartDetails.map(({ product, qty, size, color }) => ({ productId: product.id, name: product.name, price: product.price, image: product.image, qty, size, color })),
        subtotal: this.subtotal, shipping: this.subtotal >= 600000 ? 0 : 30000,
      }
      this.orders.unshift(order)
      for (const line of this.cartDetails) line.product.stock -= line.qty
      this.cart = []
      this.save()
      this.syncOrder(order.id, customer, lines) // gửi đơn lên máy chủ (trừ kho thật, để admin duyệt)
      return order.id
    },
    setViewer(person) {
      this.viewer = { name: String(person.name || '').trim(), email: String(person.email || '').trim(), phone: String(person.phone || '').trim() }
      this.save()
    },
    logout() { this.viewer = null; this.save() },
    // ===== Đơn hàng: lưu trong PostgreSQL =====
    async syncOrder(id, customer, items) {
      try {
        await createOrder({ id, customer: clone(customer), items })
        await this.fetchCatalog() // tồn kho mới sau khi trừ hàng
        await this.fetchMyOrders()
      } catch (error) {
        console.error(error)
        alert(error?.response?.data?.message || 'Không gửi được đơn hàng lên máy chủ. Vui lòng thử lại.')
        this.orders = this.orders.filter(o => o.id !== id)
        this.save()
        await this.fetchCatalog()
      }
    },
    // Đơn của khách đang đăng nhập (kèm trạng thái mới nhất do admin duyệt)
    async fetchMyOrders() {
      if (!hasUserToken()) return
      try {
        const res = await getMyOrders()
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
    // ShopLayout gọi hàm này khi mở trang. Giỏ hàng hiện lưu trong trình duyệt nên không cần tải gì thêm.
    // Đồng thời tải sản phẩm/danh mục từ database (nếu chưa tải) để các trang quản trị và cửa hàng luôn có dữ liệu.
    async fetchCart() {
      if (!this.catalogLoaded) await this.fetchCatalog()
      await this.fetchMyOrders()
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