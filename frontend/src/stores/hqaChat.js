import { defineStore } from 'pinia'
import { sendSizeChat } from '../services/api'

const STORAGE_KEY = 'hqa_size_chat_v1'
const MAX_MESSAGES = 60

let seq = 0
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
function writeSession(data) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* trình duyệt chặn lưu: bỏ qua */ }
}

const GREETING = {
  text: 'Xin chào bạn! Mình là trợ lý tư vấn size của HQA ♡\nBạn cho mình biết **chiều cao, cân nặng** (hoặc số đo 3 vòng) và **sản phẩm muốn mua**, mình sẽ đối chiếu với bảng size của cửa hàng để gợi ý size vừa vặn nhất nhé.',
  quickReplies: ['Mình cao 1m60 nặng 50kg', 'Xem bảng size', 'Cách đo số đo'],
}

const productCard = (p) => ({
  type: 'product',
  product: {
    id: p.id,
    name: p.name,
    image: p.image,
    price: p.price,
    oldPrice: p.oldPrice || 0,
    colors: p.colors || [],
    sizes: p.sizes || [],
    url: `/san-pham/${p.id}`,
  },
})

export const useHqaChatStore = defineStore('hqaChat', {
  state: () => ({
    open: false,
    messages: [],
    serverState: {}, // trạng thái hội thoại (số đo, sản phẩm, sở thích...) do server giữ hộ
    loading: false,
    selection: null, // size khách bấm "Chọn size" trong khung chat, trang chi tiết sẽ áp dụng
    hydrated: false,
  }),

  getters: {
    lastBotMessage: (state) => [...state.messages].reverse().find((m) => m.role === 'bot') || null,
  },

  actions: {
    hydrate() {
      if (this.hydrated) return
      this.hydrated = true
      const saved = readSession()
      if (saved?.messages?.length) {
        this.messages = saved.messages
        this.serverState = saved.serverState || {}
      } else {
        this.pushBot(GREETING)
      }
    },

    persist() {
      writeSession({ messages: this.messages.slice(-MAX_MESSAGES), serverState: this.serverState })
    },

    pushBot(reply, extra = {}) {
      this.messages.push({
        id: uid(),
        role: 'bot',
        text: reply.text || '',
        cards: reply.cards || [],
        quickReplies: reply.quickReplies || [],
        extracted: reply.extracted || null,
        ...extra,
      })
      if (this.messages.length > MAX_MESSAGES) this.messages.splice(0, this.messages.length - MAX_MESSAGES)
      this.persist()
    },

    pushUser(text) {
      this.messages.push({ id: uid(), role: 'user', text })
      this.persist()
    },

    /** Mở khung chat. Truyền product nếu khách đang xem một sản phẩm: trợ lý sẽ tư vấn cho đúng sản phẩm đó. */
    openChat({ product = null, text = '' } = {}) {
      this.hydrate()
      this.open = true
      if (product && product.id !== this.serverState.productId) {
        this.serverState = { ...this.serverState, productId: product.id, awaiting: 'measure', color: null }
        const known = Object.keys(this.serverState.measurements || {}).length > 0
        this.pushBot({
          text: known
            ? `Bạn đang xem **${product.name}** ♡ Mình sẽ dùng số đo bạn đã cho trước đó để chọn size nhé.`
            : `Bạn đang xem **${product.name}** ♡ Bạn cho mình biết **chiều cao, cân nặng** (hoặc số đo 3 vòng) để mình chọn size phù hợp nhé.`,
          cards: [productCard(product)],
          quickReplies: known ? ['Tư vấn size cho sản phẩm này'] : ['Mình cao 1m60 nặng 50kg', 'Cách đo số đo', 'Xem bảng size'],
        })
        this.persist()
      }
      if (text) this.send(text)
    },

    close() { this.open = false },
    toggle() { this.open ? this.close() : this.openChat() },

    async send(rawText) {
      const text = String(rawText ?? '').trim().slice(0, 500)
      if (!text || this.loading) return
      this.hydrate()
      this.pushUser(text)
      this.loading = true
      try {
        const { data } = await sendSizeChat(text, this.serverState)
        if (!data?.success) throw new Error(data?.message || 'Trợ lý chưa trả lời được.')
        this.serverState = data.state || this.serverState
        this.pushBot({ ...data.reply, extracted: data.extracted || null })
      } catch (error) {
        const message = error.response?.data?.message
          || (error.code === 'ECONNABORTED' ? 'Trợ lý phản hồi hơi lâu, bạn thử gửi lại nhé.' : 'Mình chưa kết nối được với cửa hàng, bạn thử lại sau ít phút nhé.')
        this.pushBot({ text: message, quickReplies: [] }, { error: true, retryText: text })
      } finally {
        this.loading = false
      }
    },

    /** Xóa cuộc trò chuyện, bắt đầu lại. */
    reset() {
      this.messages = []
      this.serverState = {}
      this.pushBot(GREETING)
    },

    /** Khách bấm "Chọn size X" trong khung chat. */
    chooseSize({ productId, size }) {
      this.selection = { productId, size, at: Date.now() }
      this.pushBot({
        text: `Mình đã chọn **size ${size}** cho bạn trên trang sản phẩm ♡ Bạn kiểm tra màu rồi bấm **Thêm vào giỏ hàng** nhé.`,
        quickReplies: ['Tư vấn sản phẩm khác'],
      })
    },

    consumeSelection() { this.selection = null },
  },
})
