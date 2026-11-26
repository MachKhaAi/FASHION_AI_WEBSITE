import { defineStore } from 'pinia'
import { sendChatMessage, submitManualAdvice, getMyProfile, getUserToken, CHAT_SESSION_KEY, USER_LOGOUT_EVENT } from '../services/api'

const STORAGE_KEY = CHAT_SESSION_KEY
let logoutListening = false
const MAX_MESSAGES = 60
const MEASURE_KEYS = ['height', 'weight', 'chest', 'waist', 'hip']
const FORM_QUICK = { label: 'Nhập số đo bằng biểu mẫu', action: 'form' }

let seq = 0
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
function writeSession(data) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* trình duyệt chặn lưu: bỏ qua */ }
}

const GREETING = {
  text: 'Xin chào bạn! Mình là trợ lý tư vấn size của HQA ♡\nĐể gợi ý size chính xác, mình cần biết **sản phẩm bạn muốn mua** và **những số đo bạn đang có** (cao, nặng, ngực, eo, hông). Không cần đủ cả 5 số đo; mình chỉ gợi ý size nếu bảng size shop có căn cứ rõ ràng. Bạn cứ nhắn tự nhiên bằng tiếng Việt, hoặc nhập vào biểu mẫu nhé.',
  quickReplies: [FORM_QUICK, 'Cách đo số đo', 'Xem bảng size'],
}

const productCard = (p) => ({
  type: 'product',
  product: { id: p.id, name: p.name, image: p.image, price: p.price, oldPrice: p.oldPrice || 0, colors: p.colors || [], sizes: p.sizes || [], url: `/san-pham/${p.id}` },
})

// Số đo khách đã lưu trong hồ sơ (chỉ khi đã đăng nhập). Lỗi / chưa lưu thì trả về {}.
async function loadProfileMeasurements() {
  if (!getUserToken()) return {}
  try {
    const { data } = await getMyProfile()
    const user = data?.user || {}
    const out = {}
    for (const k of MEASURE_KEYS) if (user[k] !== null && user[k] !== undefined && user[k] !== '') out[k] = Number(user[k])
    return out
  } catch {
    return {}
  }
}

export const useHqaChatStore = defineStore('hqaChat', {
  state: () => ({
    open: false,
    messages: [],
    serverState: {}, // trạng thái hội thoại (số đo, sản phẩm...) do server giữ hộ
    loading: false,
    selection: null, // size khách bấm "Chọn size" trong khung chat, trang chi tiết sẽ áp dụng
    hydrated: false,
  }),

  actions: {
    hydrate() {
      if (this.hydrated) return
      this.hydrated = true
      // Đăng xuất (hoặc token hết hạn) -> xóa sạch cuộc trò chuyện và số đo đang giữ trong bộ nhớ
      if (!logoutListening && typeof window !== 'undefined') {
        logoutListening = true
        window.addEventListener(USER_LOGOUT_EVENT, () => this.clearAll())
      }
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
        this.serverState = { ...this.serverState, productId: product.id, askedFor: [], color: null }
        this.pushBot({
          text: `Bạn đang xem **${product.name}** ♡ Bạn cho mình biết **những số đo bạn biết** (cao, nặng, ngực, eo hoặc hông) để mình đối chiếu bảng size nhé. Không bắt buộc đủ 5 số đo. Nếu bạn đã lưu số đo trong hồ sơ cá nhân, mình sẽ dùng luôn số đo đó.`,
          cards: [productCard(product)],
          quickReplies: ['Tư vấn size cho sản phẩm này', FORM_QUICK, 'Cách đo số đo'],
        })
        this.persist()
      }
      if (text) this.send(text)
    },

    close() { this.open = false },
    toggle() { this.open ? this.close() : this.openChat() },

    /** Gửi tin nhắn. Backend nhờ AI (Google Gemini) trích xuất; nếu AI lỗi sẽ trả về biểu mẫu nhập số đo thủ công. */
    async send(rawText) {
      const text = String(rawText ?? '').trim().slice(0, 500)
      if (!text || this.loading) return
      this.hydrate()
      this.pushUser(text)
      this.loading = true
      try {
        const { data } = await sendChatMessage(text, this.serverState)
        if (!data?.success) throw new Error(data?.message || 'Trợ lý chưa trả lời được.')
        this.serverState = data.state || this.serverState
        const extra = data.fallback ? { fallback: true } : {}
        // Chỉ khi chạy `npm run dev` và backend không ở production: hiện nguyên nhân AI lỗi ngay trong khung chat
        if (import.meta.env.DEV && data.aiDebug) {
          const d = data.aiDebug
          extra.techNote = `${d.code}${d.status ? ` (HTTP ${d.status})` : ''}${d.apiCode ? ` · ${d.apiCode}` : ''}${d.detail ? ` · ${d.detail}` : ''} — ${d.hint}`
        }
        this.pushBot({ ...data.reply, extracted: data.extracted || null }, extra)
      } catch (error) {
        const message = error.response?.data?.message
          || (error.code === 'ECONNABORTED' ? 'Trợ lý phản hồi hơi lâu, bạn thử gửi lại hoặc nhập số đo bằng biểu mẫu nhé.' : 'Mình chưa kết nối được với cửa hàng, bạn thử lại sau ít phút nhé.')
        this.pushBot({ text: message, quickReplies: [FORM_QUICK] }, { error: true, retryText: text })
      } finally {
        this.loading = false
      }
    },

    /** Gợi ý nhanh: chuỗi = gửi như tin nhắn; { action: 'form' } = mở biểu mẫu. */
    sendQuick(q) {
      if (q && typeof q === 'object') {
        if (q.action === 'form') return this.openForm()
        return this.send(q.label)
      }
      return this.send(q)
    },

    /** Hiện biểu mẫu nhập số đo trong khung chat (điền sẵn số đo đã biết và số đo đã lưu trong hồ sơ). */
    async openForm() {
      this.hydrate()
      this.open = true
      const last = [...this.messages].reverse().find((m) => m.role === 'bot')
      if (last?.cards?.some((c) => c.type === 'form') && !last.formDone) return // đã có biểu mẫu đang mở
      const profile = await loadProfileMeasurements()
      this.pushBot({
        text: 'Bạn chọn **sản phẩm và điền những số đo mình có** vào biểu mẫu bên dưới, mình sẽ đối chiếu với bảng size của HQA nhé ♡',
        cards: [{ type: 'form', prefill: { productId: this.serverState.productId || null, measurements: { ...profile, ...(this.serverState.measurements || {}) } } }],
      })
    },

    /**
     * Gửi biểu mẫu. Trả về { ok: true } hoặc { ok: false, errors } để biểu mẫu hiện lỗi từng ô.
     * Số đo KHÔNG được ghi vào hồ sơ cá nhân ở bước này (chỉ dùng để tư vấn).
     */
    async submitForm(messageId, { productId, measurements }) {
      if (this.loading) return { ok: false, errors: { _form: 'Vui lòng chờ trong giây lát.' } }
      this.loading = true
      try {
        const { data } = await submitManualAdvice({ productId, measurements, state: this.serverState })
        const msg = this.messages.find((m) => m.id === messageId)
        if (msg) msg.formDone = true
        this.serverState = data.state || this.serverState
        this.pushUser('Mình đã nhập số đo bằng biểu mẫu.')
        this.pushBot({ ...data.reply, extracted: data.extracted || null })
        return { ok: true }
      } catch (error) {
        const errors = error.response?.data?.errors
        if (errors) return { ok: false, errors }
        return { ok: false, errors: { _form: error.response?.data?.message || 'Chưa gửi được, bạn thử lại sau ít phút nhé.' } }
      } finally {
        this.loading = false
      }
    },

    /** Xóa TOÀN BỘ dữ liệu chat (tin nhắn, số đo, sản phẩm đang tư vấn) cả trong bộ nhớ lẫn sessionStorage. Gọi khi đăng xuất. */
    clearAll() {
      this.open = false
      this.messages = []
      this.serverState = {}
      this.selection = null
      this.loading = false
      this.hydrated = false
      try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* bỏ qua */ }
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
