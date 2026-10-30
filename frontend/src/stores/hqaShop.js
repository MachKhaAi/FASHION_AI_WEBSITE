import { defineStore } from 'pinia'
import { seedCategories, seedProducts, seedSizeChart } from '../data/hqaCatalog'
import { getProducts } from '../services/api'

const KEY = 'hqa_frontend_demo_v1'
const clone = (value) => JSON.parse(JSON.stringify(value))
function loadDemo() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
const cached = typeof localStorage === 'undefined' ? {} : loadDemo()
const asArray = (v, def) => Array.isArray(v) ? v : clone(def)

export const useHqaShopStore = defineStore('hqaShop', {
  state: () => ({
    products: asArray(cached.products, seedProducts),
    categories: asArray(cached.categories, seedCategories),
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
        localStorage.setItem(KEY, JSON.stringify({ products: this.products, categories: this.categories, sizeChart: this.sizeChart, cart: this.cart, favorites: this.favorites, orders: this.orders, viewer: this.viewer }))
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
      const order = {
        id: `HQA-${Date.now()}`, createdAt: new Date().toISOString(), status: 'Chờ xác nhận (demo)',
        customer: clone(customer), items: this.cartDetails.map(({ product, qty, size, color }) => ({ productId: product.id, name: product.name, price: product.price, image: product.image, qty, size, color })),
        subtotal: this.subtotal, shipping: this.subtotal >= 600000 ? 0 : 30000,
      }
      this.orders.unshift(order)
      for (const line of this.cartDetails) line.product.stock -= line.qty
      this.cart = []
      this.save()
      return order.id
    },
    setViewer(person) {
      this.viewer = { name: String(person.name || '').trim(), email: String(person.email || '').trim(), phone: String(person.phone || '').trim() }
      this.save()
    },
    logout() { this.viewer = null; this.save() },
    updateProduct(payload) {
      const found = this.products.find(p => p.id === payload.id)
      if (!found) return false
      Object.assign(found, payload)
      this.save(); return true
    },
    addProduct(payload) {
      const id = `sp-${Date.now()}`
      this.products.unshift({ id, name: '', categoryId: 'ao', price: 0, oldPrice: 0, image: '', sizes: ['S', 'M', 'L'], colors: ['Kem'], stock: 0, featured: false, description: '', ...payload, id })
      this.save(); return id
    },
    deleteProduct(id) {
      this.products = this.products.filter(p => p.id !== id)
      this.cart = this.cart.filter(p => p.productId !== id)
      this.favorites = this.favorites.filter(f => f !== id)
      this.save()
    },
    addCategory(name) {
      const trimmed = name.trim(); if (!trimmed || this.categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return false
      this.categories.push({ id: `dm-${Date.now()}`, name: trimmed, icon: '✿' }); this.save(); return true
    },
    deleteCategory(id) {
      if (this.products.some(p => p.categoryId === id)) return false
      this.categories = this.categories.filter(c => c.id !== id); this.save(); return true
    },
    updateSizeChart(rows) { this.sizeChart = clone(rows); this.save() },

    async fetchProducts() {
      try {
        const response = await getProducts()
        const rows = response.data.data

        if (!Array.isArray(rows)) {
          throw new Error('API không trả về danh sách sản phẩm hợp lệ')
        }

        // Chuyển dữ liệu từ PostgreSQL sang định dạng
        // mà giao diện hiện tại đang sử dụng.
        this.products = rows.map((p) => ({
          id: String(p.id),
          name: p.name,
          categoryId: String(p.categoryId ?? p.category_id ?? ''),
          price: Number(p.price ?? 0),
          oldPrice: Number(p.oldPrice ?? p.old_price ?? 0),
          image: p.image ?? p.image_url ?? '',
          sizes: Array.isArray(p.sizes) ? p.sizes : [],
          colors: Array.isArray(p.colors) ? p.colors : [],
          stock: Number(p.stock ?? 0),
          featured: Boolean(p.featured),
          description: p.description ?? '',
        }))
      } catch (error) {
        console.error('Không thể tải sản phẩm:', error)
        throw error
      }
    },
  },
})