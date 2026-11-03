import { defineStore } from 'pinia'
import { seedCategories, seedProducts, seedSizeChart } from '../data/hqaCatalog'
import {
  getProducts,
  getCategories,
  getCart,
  apiAddToCart,
  apiUpdateCartItem,
  apiRemoveCartItem,
  apiClearCart,
} from '../services/api'

const KEY = 'hqa_frontend_demo_v1'
const clone = (value) => JSON.parse(JSON.stringify(value))
function loadDemo() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
const cached = typeof localStorage === 'undefined' ? {} : loadDemo()
const asArray = (v, def) => Array.isArray(v) ? v : clone(def)

// Kiểm tra xem người dùng đã đăng nhập (có token) hay chưa
export function hasUserToken() {
  try {
    return !!localStorage.getItem('hqa_user_token')
  } catch {
    return false
  }
}

// Chuyển đổi 1 sản phẩm từ API (PostgreSQL) sang định dạng hiển thị của giao diện
export function normalizeProduct(p) {
  return {
    id: String(p.id),
    name: p.name,
    categoryId: String(p.categoryId ?? p.category_id ?? ''),
    categoryName: p.categoryName ?? p.category_name ?? '',
    price: Number(p.price ?? 0),
    oldPrice: Number(p.oldPrice ?? p.old_price ?? 0),
    image: p.image ?? p.image_url ?? '',
    sizes: Array.isArray(p.sizes) ? p.sizes : [],
    colors: Array.isArray(p.colors) ? p.colors : [],
    variants: Array.isArray(p.variants)
      ? p.variants.map(v => ({ size: v.size, color: v.color, stock: Number(v.stock ?? 0) }))
      : [],
    // Thư viện ảnh theo màu: [{ url, color }] (color = null là ảnh chung)
    images: Array.isArray(p.images)
      ? p.images.filter(i => i && i.url).map(i => ({ url: i.url, color: i.color || null }))
      : [],
    stock: Number(p.stock ?? 0),
    featured: Boolean(p.featured ?? p.is_featured),
    description: p.description ?? '',
  }
}

export const useHqaShopStore = defineStore('hqaShop', {
  state: () => ({
    products: asArray(cached.products, seedProducts),
    categories: asArray(cached.categories, seedCategories),
    sizeChart: asArray(cached.sizeChart, seedSizeChart),
    cart: [], // Giỏ hàng lấy trực tiếp từ PostgreSQL của user đang đăng nhập
    cartLoading: false,
    favorites: asArray(cached.favorites, []),
    orders: asArray(cached.orders, []),
    viewer: cached.viewer && typeof cached.viewer === 'object' ? cached.viewer : null,
  }),

  getters: {
    // Tổng số lượng sản phẩm trong giỏ hàng (hiển thị trên icon giỏ hàng header)
    cartCount: (s) => s.cart.reduce((total, line) => total + line.qty, 0),

    // Chi tiết từng dòng giỏ hàng (tương thích hoàn hảo với CartView.vue & CheckoutView.vue)
    cartDetails: (s) =>
      s.cart.map((line) => ({
        ...line,
        product: line.product || s.products.find((p) => p.id === line.productId) || {
          id: line.productId,
          name: line.name,
          price: line.price,
          oldPrice: line.oldPrice || 0,
          image: line.image,
          stock: line.stock,
        },
      })),

    // Tính tổng tiền tạm tính (Subtotal) của toàn bộ giỏ hàng
    subtotal() {
      return this.cartDetails.reduce(
        (total, line) => total + Number(line.product.price || 0) * line.qty,
        0
      )
    },

    favoriteProducts: (s) => s.products.filter((p) => s.favorites.includes(p.id)),
  },

  actions: {
    save() {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({
            products: this.products,
            categories: this.categories,
            sizeChart: this.sizeChart,
            favorites: this.favorites,
            orders: this.orders,
            viewer: this.viewer,
          })
        )
      } catch (error) {
        console.warn('Không thể lưu dữ liệu vào trình duyệt', error)
      }
    },

    // Chuyển đổi dữ liệu từ API giỏ hàng sang state.cart của Pinia
    setCartFromApi(cartData) {
      const items = cartData?.items || []
      this.cart = items.map((item) => ({
        key: `${item.productId}|${item.size}|${item.color}`,
        cartItemId: item.cartItemId,
        productId: item.productId,
        size: item.size,
        color: item.color,
        qty: Number(item.quantity) || 1,
        stock: Number(item.stock) || 0, // Tồn kho của đúng biến thể Size + Màu
        isAiRecommended: Boolean(item.isAiRecommended), // Cờ nhận biết do AI tư vấn
        aiFitNote: item.aiFitNote || null,             // Ghi chú số đo từ AI
        product: {
          id: item.productId,
          name: item.name,
          price: Number(item.price) || 0,
          oldPrice: Number(item.oldPrice) || 0,
          image: item.image,
          stock: Number(item.stock) || 0,
        },
      }))
    },

    // 1. Tải giỏ hàng từ Server (PostgreSQL)
    async fetchCart() {
      if (!hasUserToken()) {
        this.cart = []
        return
      }
      this.cartLoading = true
      try {
        const response = await getCart()
        if (response.data?.success) {
          this.setCartFromApi(response.data.data)
        }
      } catch (error) {
        if (error.response?.status === 401) {
          this.cart = []
        }
        console.error('Không thể tải giỏ hàng:', error)
      } finally {
        this.cartLoading = false
      }
    },

    // 2. Thêm sản phẩm vào giỏ hàng (Hỗ trợ cờ AI tư vấn size)
    async addToCart(productId, size, color, quantity = 1, aiOptions = {}) {
      if (!hasUserToken()) {
        return {
          ok: false,
          requireLogin: true,
          message: 'Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng!',
        }
      }
      try {
        const response = await apiAddToCart({
          productId,
          size,
          color,
          quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
          isAiRecommended: Boolean(aiOptions.isAiRecommended),
          aiFitNote: aiOptions.aiFitNote || null,
        })
        this.setCartFromApi(response.data.data)
        return {
          ok: true,
          message: response.data.message || 'Đã thêm sản phẩm vào giỏ hàng ♡',
        }
      } catch (error) {
        if (error.response?.status === 401) {
          return {
            ok: false,
            requireLogin: true,
            message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!',
          }
        }
        return {
          ok: false,
          message:
            error.response?.data?.message ||
            'Không thể thêm: số lượng vượt quá tồn kho hoặc tùy chọn không hợp lệ.',
        }
      }
    },

    // 3. Cập nhật số lượng sản phẩm trong giỏ hàng
    async updateQuantity(key, quantity) {
      const item = this.cart.find((line) => line.key === key)
      if (!item || !item.cartItemId) return { ok: false }

      try {
        const response = await apiUpdateCartItem(item.cartItemId, quantity)
        this.setCartFromApi(response.data.data)
        return { ok: true }
      } catch (error) {
        const msg = error.response?.data?.message || 'Không thể cập nhật số lượng!'
        alert(msg)
        return { ok: false, message: msg }
      }
    },

    // 4. Xóa một sản phẩm khỏi giỏ hàng
    async removeFromCart(key) {
      const item = this.cart.find((line) => line.key === key)
      if (!item || !item.cartItemId) return

      try {
        const response = await apiRemoveCartItem(item.cartItemId)
        this.setCartFromApi(response.data.data)
      } catch (error) {
        console.error('Lỗi xóa sản phẩm khỏi giỏ:', error)
      }
    },

    // 5. Làm trống giỏ hàng (sau khi đặt hàng thành công)
    async clearCart() {
      if (!hasUserToken()) {
        this.cart = []
        return
      }
      try {
        const response = await apiClearCart()
        this.setCartFromApi(response.data.data)
      } catch (error) {
        console.error('Lỗi làm trống giỏ:', error)
      }
    },

    toggleFavorite(id) {
      this.favorites = this.favorites.includes(id)
        ? this.favorites.filter((item) => item !== id)
        : [...this.favorites, id]
      this.save()
    },

    placeOrder(customer) {
      if (!this.cartDetails.length) return null
      const order = {
        id: `HQA-${Date.now()}`,
        createdAt: new Date().toISOString(),
        status: 'Chờ xác nhận',
        customer: clone(customer),
        items: this.cartDetails.map(({ product, qty, size, color }) => ({
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          qty,
          size,
          color,
        })),
        subtotal: this.subtotal,
        shipping: this.subtotal >= 600000 ? 0 : 30000,
      }
      this.orders.unshift(order)
      this.clearCart()
      this.save()
      return order.id
    },

    setViewer(person) {
      this.viewer = {
        name: String(person.name || '').trim(),
        email: String(person.email || '').trim(),
        phone: String(person.phone || '').trim(),
      }
      this.save()
    },

    logout() {
      this.viewer = null
      this.cart = []
      this.save()
    },

    // Các hàm quản lý sản phẩm / danh mục sẵn có trong hệ thống
    updateProduct(payload) {
      const found = this.products.find((p) => p.id === payload.id)
      if (!found) return false
      Object.assign(found, payload)
      found.variants = []
      this.save()
      return true
    },
    addProduct(payload) {
      const id = `sp-${Date.now()}`
      this.products.unshift({
        id,
        name: '',
        categoryId: 'ao',
        price: 0,
        oldPrice: 0,
        image: '',
        sizes: ['S', 'M', 'L'],
        colors: ['Kem'],
        stock: 0,
        featured: false,
        description: '',
        ...payload,
        id,
      })
      this.save()
      return id
    },
    deleteProduct(id) {
      this.products = this.products.filter((p) => p.id !== id)
      this.cart = this.cart.filter((p) => p.productId !== id)
      this.favorites = this.favorites.filter((f) => f !== id)
      this.save()
    },
    addCategory(name) {
      const trimmed = name.trim()
      if (!trimmed || this.categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase()))
        return false
      this.categories.push({ id: `dm-${Date.now()}`, name: trimmed, icon: '✿' })
      this.save()
      return true
    },
    deleteCategory(id) {
      if (this.products.some((p) => p.categoryId === id)) return false
      this.categories = this.categories.filter((c) => c.id !== id)
      this.save()
      return true
    },
    updateSizeChart(rows) {
      this.sizeChart = clone(rows)
      this.save()
    },
    async fetchProducts() {
      try {
        const response = await getProducts()
        const rows = response.data.data
        if (!Array.isArray(rows)) throw new Error('API không trả về danh sách sản phẩm hợp lệ')
        this.products = rows.map(normalizeProduct)
      } catch (error) {
        console.error('Không thể tải sản phẩm:', error)
        throw error
      }
    },
    upsertProduct(raw) {
      const product = normalizeProduct(raw)
      const index = this.products.findIndex((p) => p.id === product.id)
      if (index >= 0) this.products.splice(index, 1, product)
      else this.products.push(product)
      return product
    },
    async fetchCategories() {
      try {
        const response = await getCategories()
        const rows = response.data.data
        if (Array.isArray(rows) && rows.length) this.categories = rows
      } catch (error) {
        console.error('Không thể tải danh mục:', error)
      }
    },
  },
})